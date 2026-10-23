import { encodeFunctionData, toFunctionSelector, keccak256 } from "viem";
import { parseAppWalletContracts, type ParsedAppWalletPermissions } from "./appWalletPolicy.mjs";
import type { Address, ContractWriteRequest, VaultManifest } from "./types";
import type { FlapWalletRuntime } from "./flapChainRuntime";
import type { ResolvedContractHandle } from "./resolvedContractTypes";
const requireRule = (ok: unknown, reason: string) => { if (!ok) throw new Error(`app-wallet/${reason}`); };
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
export function createAppWalletContracts(runtime: FlapWalletRuntime, chainId: number, manifest: VaultManifest) {
  const roots = manifest.walletContracts === undefined ? [] : parseAppWalletContracts(manifest.walletContracts).filter((p) => p.definition.chainId === chainId);
  type RecordEntry = { root: typeof roots[number]; policy: typeof roots[number]["resolved"][number]; address: Address; args: unknown[] };
  const records = new WeakMap<object, RecordEntry>();
  async function checkCode(address: Address, policy: ParsedAppWalletPermissions) {
    const code = await runtime.getCode(chainId, address); requireRule(code && code !== "0x", "missing-code");
    if (policy.definition.codeHash) requireRule(same(keccak256(code!), policy.definition.codeHash), "code-hash-changed");
  }
  async function resolve(root: typeof roots[number], policy: RecordEntry["policy"], args: unknown[]) {
    await checkCode(root.definition.address, root);
    const address = await runtime.readContract(chainId, { address: root.definition.address, abi: [policy.resolver], functionName: policy.resolver.name, args });
    requireRule(typeof address === "string" && /^0x[0-9a-f]{40}$/i.test(address) && !/^0x0{40}$/i.test(address), "invalid-resolved-target");
    await checkCode(address as Address, policy); return address as Address;
  }
  async function resolveContract(id: string, input: readonly unknown[]): Promise<ResolvedContractHandle> {
    const root = roots.find((p) => p.resolved.some((r) => r.definition.id === id)); const policy = root?.resolved.find((p) => p.definition.id === id);
    if (!root || !policy) throw new Error("app-wallet/undeclared-resolver");
    const args = structuredClone([...input]); encodeFunctionData({ abi: [policy.resolver], functionName: policy.resolver.name, args });
    const address = await resolve(root, policy, args);
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
    const data = encodeFunctionData({ abi: request.abi!, functionName: request.functionName, args: request.args });
    const entry = (write ? policy.writes : policy.reads).find((f) => toFunctionSelector(f) === data.slice(0, 10));
    requireRule(entry, "selector-not-allowed");
    requireRule(encodeFunctionData({ abi: [entry!], functionName: entry!.name, args: request.args }) === data, "abi-mismatch");
    const value = request.value ?? 0n;
    requireRule(value >= 0n && (value === 0n || entry!.stateMutability === "payable" && policy.definition.maxValueWei && value <= BigInt(policy.definition.maxValueWei)), "value-not-allowed");
    if (write && entry!.name === "approve") {
      requireRule(policy.definition.approvalSpenders?.some((a) => same(a, request.args?.[0])), "spender-not-allowed");
      const amount = request.args?.[1]; requireRule(typeof amount === "bigint" && amount >= 0n && amount <= BigInt(policy.definition.maxApprovalWei!), "approval-cap-exceeded");
    }
    return { ...request, abi: [entry!], functionName: entry!.name };
  }
  async function validate(prepared: ReturnType<typeof snapshot>, write: boolean) {
    const { record, root, policy } = prepared;
    let address = root?.definition.address;
    if (record) { address = await resolve(record.root, record.policy, record.args); requireRule(same(address, record.address), "resolved-target-changed"); }
    else if (write) await checkCode(address!, policy);
    return checkFunction({ ...prepared.request, address }, policy, write);
  }
  return { roots, snapshot, validate, resolveContract };
}
