import { encodeFunctionData, keccak256, parseAbi, toFunctionSelector } from "viem";
import type { AbiFunction, PublicClient } from "viem";
import type { Address, ContractReadRequest, ContractWriteRequest, VaultManifest, VaultRuntimeContext } from "./types";
import type { ParsedResolvedContract, ResolvedContractHandle } from "./resolvedContractTypes";
import { parseResolvedContract } from "./resolvedContractPolicy.mjs";

const zero = /^0x0+$/i;
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
function requireRule(ok: unknown, code: string): asserts ok { if (!ok) throw new Error(`resolved-contract/${code}`); }
function validAddress(a: unknown): a is Address { return typeof a === "string" && /^0x[0-9a-f]{40}$/i.test(a) && !zero.test(a); }
export function isEip6551Proxy(code: string) { return /^0x363d3d373d3d3d363d73[0-9a-f]{40}5af43d82803e903d91602b57fd5bf3[0-9a-f]{256}$/i.test(code); }
function freezeData<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freezeData); Object.freeze(value); }
  return value;
}
const checksAbi = parseAbi(["function owner() view returns (address)", "function ownerOf(uint256) view returns (address)", "function balanceOf(address) view returns (uint256)"]);
interface Environment {
  client: PublicClient;
  manifest: VaultManifest;
  context: VaultRuntimeContext;
  getWallet(): Promise<{ address: Address; chainId: number }>;
  /** Preview-only migration diagnostic. Production hosts must use strict. */
  targetPolicy?: "strict" | "warn";
  warn?(message: string): void;
}
interface RecordEntry { parsed: ParsedResolvedContract; address: Address; args: unknown[] }
export function createResolvedContractRuntime(environment: Environment) {
  // Neither the component's sdk.context nor its manifest may mutate authorization.
  const manifest = structuredClone(environment.manifest);
  const context = structuredClone(environment.context);
  const client = environment.client;
  const records = new WeakMap<object, RecordEntry>();
  const bindings = manifest.match.bindings.filter((b) => b.chainId === context.chainId && (b.factoryAddress ? same(b.factoryAddress, context.factoryAddress) : b.vaultAddresses?.length ? b.vaultAddresses.some((v) => same(v, context.vaultAddress)) && (!b.tokenAddresses?.length || b.tokenAddresses.some((t) => same(t, context.tokenAddress))) : b.tokenAddresses?.some((t) => same(t, context.tokenAddress))));
  requireRule(bindings.length <= 1, "ambiguous-binding");
  const binding = bindings[0];
  const definitions = new Map<string, ParsedResolvedContract>();
  if (binding?.resolvedContracts !== undefined) {
    requireRule(validAddress(binding.factoryAddress) && binding.resolvedContracts.length > 0 && binding.resolvedContracts.length <= 8, "invalid-declarations");
    for (const input of binding.resolvedContracts) { const parsed = parseResolvedContract(input); requireRule(!definitions.has(parsed.definition.id), "duplicate-id"); definitions.set(parsed.definition.id, parsed); }
  }
  const genericAddresses = new Set<string>();
  const add = (a: unknown) => { if (validAddress(a)) genericAddresses.add(a.toLowerCase()); };
  [context.vaultAddress, context.tokenAddress, context.factoryAddress, context.paymentToken?.address, context.host?.taxInfo?.quoteToken, context.host?.taxInfo?.dividendToken].forEach(add);
  if (binding) [binding.factoryAddress, ...(binding.vaultAddresses ?? []), ...(binding.tokenAddresses ?? []), ...(binding.externalContracts ?? []).map((c) => c.address)].forEach(add);
  async function chain() { requireRule(await client.getChainId() === context.chainId, "chain-changed"); }
  async function wallet(expected?: Address) {
    const live = await environment.getWallet();
    requireRule(validAddress(live.address) && live.chainId === context.chainId && (!expected || same(live.address, expected)), "wallet-or-chain-changed");
    return live.address;
  }
  async function validateCode(address: Address, parsed: ParsedResolvedContract, blockNumber: bigint) {
    const code = await client.getCode({ address, blockNumber });
    requireRule(code && code !== "0x", "missing-code");
    const d = parsed.definition;
    if (d.codePattern === "eip6551-proxy") requireRule(isEip6551Proxy(code), "code-pattern-mismatch");
    if (d.codeHash) requireRule(same(keccak256(code), d.codeHash), "code-hash-mismatch");
    if (d.implementationCodeHash) {
      const implementation = `0x${code.slice(22, 62)}` as Address;
      const implCode = await client.getCode({ address: implementation, blockNumber });
      requireRule(implCode && implCode !== "0x" && same(keccak256(implCode), d.implementationCodeHash), "implementation-hash-mismatch");
    }
  }
  async function resolve(parsed: ParsedResolvedContract, args: readonly unknown[], blockNumber: bigint) {
    requireRule(validAddress(context.vaultAddress), "missing-vault");
    const address = await client.readContract({ address: context.vaultAddress, abi: [parsed.resolver], functionName: parsed.resolver.name, args, blockNumber } as never);
    requireRule(validAddress(address), "invalid-resolved-address");
    await validateCode(address, parsed, blockNumber);
    return address;
  }
  async function resolveContract(id: string, input: readonly unknown[]): Promise<ResolvedContractHandle> {
    const parsed = definitions.get(id); requireRule(parsed, "undeclared-resolver");
    const args = structuredClone([...input]);
    encodeFunctionData({ abi: [parsed.resolver], functionName: parsed.resolver.name, args });
    await chain();
    const address = await resolve(parsed, args, await client.getBlockNumber());
    const handle = freezeData({ id, address, args: structuredClone(args), chainId: context.chainId });
    records.set(handle, { parsed, args, address });
    return handle;
  }
  function snapshot(input: ContractReadRequest | ContractWriteRequest) {
    const contract = input.contract;
    const record = typeof contract === "object" && contract !== null ? records.get(contract) : undefined;
    requireRule(typeof contract !== "object" || record, "forged-or-expired-handle");
    requireRule(!record || input.address === undefined, "handle-with-address");
    // Preserve the authentic handle identity; clone only transaction data.
    const { contract: _contract, ...data } = input;
    const request = structuredClone(data) as ContractWriteRequest;
    if (record) request.address = record.address;
    requireRule(validAddress(request.address) && request.abi, "invalid-request");
    return { record, request };
  }
  function allowedFunction(request: ContractWriteRequest, functions: AbiFunction[]) {
    const data = encodeFunctionData({ abi: request.abi!, functionName: request.functionName, args: request.args });
    const selected = functions.find((f) => toFunctionSelector(f) === data.slice(0, 10));
    requireRule(selected, "selector-not-allowed");
    // Decode/encode with the reviewed ABI too, preventing caller ABI ambiguity.
    requireRule(encodeFunctionData({ abi: [selected], functionName: selected.name, args: request.args }) === data, "abi-mismatch");
    request.abi = [selected]; request.functionName = selected.name;
    return selected;
  }
  async function validate(input: ReturnType<typeof snapshot>, write: boolean, expectedSender?: Address) {
    const { record, request } = input;
    await chain();
    const sender = write ? await wallet(expectedSender) : undefined;
    const blockNumber = await client.getBlockNumber();
    if (!record) {
      if (write) {
        if (!genericAddresses.has(request.address!.toLowerCase())) {
          requireRule(environment.targetPolicy === "warn", "unapproved-raw-target");
          environment.warn?.("resolved-contract/legacy-derived-target: migrate to resolveContract before production");
        }
        const code = await client.getCode({ address: request.address!, blockNumber });
        requireRule(!code || !isEip6551Proxy(code), "account-requires-profile");
      }
      return { request, sender, blockNumber };
    }
    requireRule(same(await resolve(record.parsed, record.args, blockNumber), record.address), "resolved-address-changed");
    const d = record.parsed.definition;
    if (!write) {
      const reads = record.parsed.reads;
      const f = reads === "any" ? allowedFunction(request, (request.abi as AbiFunction[]).filter((f) => f.type === "function")) : allowedFunction(request, reads);
      requireRule(f && ["view", "pure"].includes(f.stateMutability), "read-not-view");
      return { request, blockNumber };
    }
    const f = allowedFunction(request, record.parsed.writes);
    const value = request.value ?? 0n;
    requireRule(typeof value === "bigint" && value >= 0n && (value === 0n || (d.payable && f.stateMutability === "payable" && value <= BigInt(d.maxValueWei!))), "value-not-allowed");
    request.account = sender;
    for (const check of d.checks ?? []) {
      if (check.kind === "owner" || check.kind === "ownerOf") {
        const owner = await client.readContract({ address: check.target === "vault" ? context.vaultAddress : record.address, abi: checksAbi, functionName: check.kind, args: check.kind === "ownerOf" ? [record.args[check.resolverArg]] : [], blockNumber } as never);
        requireRule(same(owner, sender), "ownership-check-failed");
      } else if (toFunctionSelector(check.function) === toFunctionSelector(f)) {
        if (check.kind === "recipient") requireRule(same(request.args?.[check.arg], sender), "recipient-check-failed");
        else {
          const amount = request.args?.[check.amountArg];
          const balance = await client.readContract({ address: check.token === "token" ? context.tokenAddress : record.address, abi: checksAbi, functionName: "balanceOf", args: [check.owner === "user" ? sender! : record.address], blockNumber });
          requireRule(typeof amount === "bigint" && amount >= 0n && amount <= balance, "balance-check-failed");
        }
      }
    }
    return { request, sender, blockNumber };
  }
  return { resolveContract, snapshot, validate, assertWallet: wallet };
}
