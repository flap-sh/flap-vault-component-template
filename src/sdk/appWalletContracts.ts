import { encodeFunctionData, keccak256, parseAbi, prepareEncodeFunctionData } from "viem";
import { ERC20_APPROVE_SELECTOR, PRESALE_CONTRIBUTE_QUOTE_SELECTOR, parseAppWalletContracts, type ParsedAppWalletPermissions } from "./appWalletPolicy.mjs";
import type { Address, ContractWriteRequest, VaultManifest } from "./types";
import type { FlapDisplayReadSnapshot, FlapWalletRuntime, PresaleQuoteApprovalRequest } from "./flapChainRuntime";
import type { ResolvedContractHandle } from "./resolvedContractTypes";
// @ts-expect-error Node's source tests need the TypeScript extension.
import { checkResolvedWriteConstraint, checkReviewedContractCall } from "./resolvedWriteConstraints.ts";
function requireRule(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`app-wallet/${reason}`); }
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
function isContractAddress(address: unknown): address is Address {
  return typeof address === "string" && /^0x[0-9a-f]{40}$/i.test(address) && !/^0x0{40}$/i.test(address);
}
const quoteAbi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
]);
export function createAppWalletContracts(runtime: FlapWalletRuntime, chainId: number, manifest: VaultManifest) {
  const roots = manifest.walletContracts === undefined ? [] : parseAppWalletContracts(manifest.walletContracts).filter((p) => p.definition.chainId === chainId);
  type RecordEntry = { root: typeof roots[number]; policy: typeof roots[number]["resolved"][number]; address: Address; args: unknown[] };
  const records = new WeakMap<object, RecordEntry>();
  type DisplayScope = { snapshot: FlapDisplayReadSnapshot; codes: Map<string, Promise<`0x${string}` | undefined>>; resolvers: Map<string, Promise<unknown>>; assertActive(): void };
  function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
    let pending = cache.get(key);
    if (!pending) {
      pending = Promise.resolve().then(load);
      cache.set(key, pending);
      void pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
    }
    return pending;
  }
  const hasPresaleApproval = roots.some(({ definition }) => definition.presaleApproval !== undefined);
  async function checkCode(address: Address, policy: ParsedAppWalletPermissions, scope?: DisplayScope) {
    scope?.assertActive();
    const key = address.toLowerCase();
    const read = async () => { const code = await scope!.snapshot.getCode(address); requireRule(code && code !== "0x", "missing-code"); return code; };
    const code = scope ? await cached(scope.codes, key, read) : await runtime.getCode(chainId, address);
    scope?.assertActive();
    requireRule(code && code !== "0x", "missing-code");
    if (policy.definition.codeHash) requireRule(same(keccak256(code!), policy.definition.codeHash), "code-hash-changed");
  }
  async function resolve(root: typeof roots[number], policy: RecordEntry["policy"], args: unknown[], scope?: DisplayScope) {
    await checkCode(root.definition.address, root, scope);
    const request = { address: root.definition.address, abi: [policy.resolver], functionName: policy.resolver.name, args };
    const read = async () => {
      const address = scope ? await scope.snapshot.readContract(request) : await runtime.readContract(chainId, request);
      requireRule(typeof address === "string" && /^0x[0-9a-f]{40}$/i.test(address) && !/^0x0{40}$/i.test(address), "invalid-resolved-target");
      return address;
    };
    const address = scope ? await cached(scope.resolvers, root.definition.address.toLowerCase() + ":" + encodeFunctionData(request).toLowerCase(), read) : await read();
    scope?.assertActive();
    await checkCode(address as Address, policy, scope);
    return address as Address;
  }
  async function resolveContract(id: string, input: readonly unknown[], scope?: DisplayScope): Promise<ResolvedContractHandle> {
    scope?.assertActive();
    const root = roots.find((p) => p.resolved.some((r) => r.definition.id === id)); const policy = root?.resolved.find((p) => p.definition.id === id);
    if (!root || !policy) throw new Error("app-wallet/undeclared-resolver");
    const args = structuredClone([...input]); encodeFunctionData({ abi: [policy.resolver], functionName: policy.resolver.name, args });
    const address = await resolve(root, policy, args, scope);
    const handle = Object.freeze({ id, chainId, address, args: Object.freeze(structuredClone(args)) }); records.set(handle, { root, policy, address, args }); return handle;
  }
  function snapshot(input: ContractWriteRequest) {
    const { contract, ...data } = input; const request = structuredClone(data);
    const record = typeof contract === "object" && contract !== null ? records.get(contract) : undefined;
    requireRule(typeof contract !== "object" || record, "forged-or-expired-handle"); requireRule(!record || input.address === undefined, "handle-with-address");
    const root = roots.find((p) => same(p.definition.address, request.address)); const policy = record?.policy ?? root;
    requireRule(policy, "undeclared-target");
    return { request, record, root, policy: policy! };
  }
  function checkFunction(request: ContractWriteRequest, policy: ParsedAppWalletPermissions, write: boolean) {
    requireRule(request.abi && request.functionName, "invalid-call");
    const parameters = { abi: request.abi!, functionName: request.functionName, args: request.args };
    const value = request.value ?? 0n;
    const prepared = write && policy.writeConstraints?.size ? prepareEncodeFunctionData(parameters) : undefined;
    const constraint = prepared && policy.writeConstraints?.get(prepared.functionName);
    if (constraint) {
      const { fixedBytesMatch, valueMatches } = checkResolvedWriteConstraint(request, constraint);
      requireRule(fixedBytesMatch, "fixed-bytes-length-mismatch");
      requireRule(valueMatches, "exact-value-mismatch");
    }
    const { selector, entry, abiMatches } = checkReviewedContractCall(
      { ...parameters, ...prepared }, write ? policy.writes : policy.reads,
    );
    requireRule(entry, "selector-not-allowed");
    requireRule(abiMatches, "abi-mismatch");
    requireRule(value >= 0n && (value === 0n || entry!.stateMutability === "payable" && policy.definition.maxValueWei && value <= BigInt(policy.definition.maxValueWei)), "value-not-allowed");
    if (write && selector === ERC20_APPROVE_SELECTOR) {
      requireRule(policy.definition.approvalSpenders?.some((a) => same(a, request.args?.[0])), "spender-not-allowed");
      const amount = request.args?.[1]; requireRule(typeof amount === "bigint" && amount >= 0n && amount <= BigInt(policy.definition.maxApprovalWei!), "approval-cap-exceeded");
    }
    // The component can change a simulation request, so keep the reviewed ABI private.
    return { selector, call: { ...request, abi: [structuredClone(entry)], functionName: entry.name } };
  }

  async function resolvePresaleQuote(record: RecordEntry | undefined, launcher: Address | undefined, amount: unknown) {
    const declaration = record?.root.definition.presaleApproval;
    requireRule(record && launcher && declaration && record.policy.definition.id === declaration.launcherResolver, "undeclared-presale-launcher");
    requireRule(typeof amount === "bigint" && amount > 0n && amount <= BigInt(declaration.maxApprovalWei), "presale-approval-cap-exceeded");
    requireRule(runtime.resolvePresaleApproval, "presale-approval-unavailable");
    const approval = await runtime.resolvePresaleApproval({ chainId, policyId: declaration.policyId, factory: record.root.definition.address, launcher });
    requireRule(approval && isContractAddress(approval.quoteToken), "invalid-presale-quote-token");
    requireRule(typeof approval.maxApprovalWei === "bigint" && amount <= approval.maxApprovalWei, "presale-approval-cap-exceeded");
    return { token: approval.quoteToken, amount };
  }

  function snapshotQuoteApproval(input: PresaleQuoteApprovalRequest) {
    requireRule(input && typeof input === "object" && Object.keys(input).every((key) => key === "pool" || key === "amount"), "invalid-presale-approval-request");
    const { pool, amount } = input;
    const record = records.get(pool);
    requireRule(record, "forged-or-expired-handle");
    return { record, amount };
  }

  async function validateQuoteApproval(prepared: ReturnType<typeof snapshotQuoteApproval>) {
    const { record, amount } = prepared;
    const launcher = await resolve(record.root, record.policy, record.args);
    requireRule(same(launcher, record.address), "resolved-target-changed");
    const { token } = await resolvePresaleQuote(record, launcher, amount);
    return { address: token, abi: quoteAbi, functionName: "approve", args: [launcher, amount], value: 0n };
  }

  async function validate(prepared: ReturnType<typeof snapshot>, write: boolean, account?: Address, scope?: DisplayScope) {
    scope?.assertActive();
    requireRule(!scope || !write, "display-read-only");
    const { record, root, policy } = prepared;
    let address = root?.definition.address;
    if (record) { address = await resolve(record.root, record.policy, record.args, scope); requireRule(same(address, record.address), "resolved-target-changed"); }
    else if (write) await checkCode(address!, policy);
    const { selector, call } = checkFunction({ ...prepared.request, address }, policy, write);
    if (write && hasPresaleApproval && (record?.root ?? root)?.definition.presaleApproval !== undefined && selector === PRESALE_CONTRIBUTE_QUOTE_SELECTOR) {
      requireRule(account, "presale-account-unavailable");
      const { token, amount } = await resolvePresaleQuote(record, address, call.args?.[0]);
      const allowance = await runtime.readContract(chainId, { address: token, abi: quoteAbi, functionName: "allowance", args: [account, address] });
      requireRule(typeof allowance === "bigint" && allowance >= amount, "presale-allowance-insufficient");
      return { call, presaleQuoteToken: token };
    }
    return { call, presaleQuoteToken: undefined };
  }
  function withDisplayReadSnapshot(reads: FlapDisplayReadSnapshot) {
    let active = true;
    const scope: DisplayScope = { snapshot: reads, codes: new Map(), resolvers: new Map(),
      assertActive() { requireRule(active, "display-batch-closed"); runtime.assertActive?.(); } };
    return {
      resolveContract: (id: string, args: readonly unknown[]) => resolveContract(id, args, scope),
      validate: (prepared: ReturnType<typeof snapshot>) => validate(prepared, false, undefined, scope),
      close() { active = false; scope.codes.clear(); scope.resolvers.clear(); },
    };
  }
  return { roots, snapshot, validate, resolveContract, snapshotQuoteApproval, validateQuoteApproval, withDisplayReadSnapshot };
}
