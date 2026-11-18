import { keccak256, parseAbi, toFunctionSelector } from "viem";
import type { AbiFunction, PublicClient } from "viem";
import type { Address, ContractWriteRequest, VaultRuntimeContext } from "./types";
import { isVaultAssemblyChain } from "./resolvedContractPolicy.mjs";
// @ts-expect-error Node's source tests need the TypeScript extension.
import { checkResolvedWriteConstraint, type ResolvedWriteConstraint } from "./resolvedWriteConstraints.ts";

type BeaconCodePin = {
  kind: "eip1967-beacon";
  codeHash: Address;
  beacon: Address;
  beaconCodeHash: Address;
  implementation: Address;
  implementationCodeHash: Address;
};

type CodePin =
  | { kind: "immutable"; codeHash: Address }
  | { kind: "eip1967"; codeHash: Address; implementationCodeHash: Address }
  | BeaconCodePin;

export interface VaultAssemblyApproval {
  chainId: 56 | 97;
  manifestSha256: string;
  componentSha256: string;
  taxFactory: Address;
  businessFactory: Address;
  businessFactoryCode: CodePin;
  taxVaultCode: BeaconCodePin;
  runtimeCode: BeaconCodePin;
  revealValueWei: bigint;
}

/** Pass only from the host using the digests computed over the verified artifact bytes. */
export interface VaultAssemblyHostContext {
  verifiedManifestSha256: string;
  verifiedComponentSha256: string;
  approval: VaultAssemblyApproval;
}

const sha256 = /^[a-f0-9]{64}$/i;
const codeHash = /^0x[a-f0-9]{64}$/i;
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const beaconSlot = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const beaconAbi = parseAbi(["function implementation() view returns (address)"]);
const taxVaultAbi = parseAbi([
  "function businessVault() view returns (address)",
  "function businessFactory() view returns (address)",
  "function taxFactory() view returns (address)",
  "function taxToken() view returns (address)",
]);
const runtimeAbi = parseAbi(["function taxVault() view returns (address)"]);
const commitSelector = toFunctionSelector("commitTapeout(bytes32)");
const revealSelector = toFunctionSelector("revealTapeout(address,uint256[5],bytes,bytes32,bytes32)");
const verifySelector = toFunctionSelector("verifyMiner(uint256)");
const zeroValueOnly = { valueWei: 0n };
const netlistBytes = new Map([[2, 35]]);

function requireAssembly(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error(`vault-assembly/${code}`);
}

function same(a: string | undefined, b: string | undefined) {
  return a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();
}

function isAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[a-f0-9]{40}$/i.test(value) && !/^0x0+$/i.test(value);
}

async function matchesCode(client: PublicClient, address: Address, expectedHash: Address, blockNumber: bigint) {
  requireAssembly(codeHash.test(expectedHash), "invalid-code-pin");
  const code = await client.getCode({ address, blockNumber });
  return !!code && code !== "0x" && same(keccak256(code), expectedHash);
}

async function readSlotAddress(client: PublicClient, address: Address, slot: Address, blockNumber: bigint) {
  const value = await client.getStorageAt({ address, slot, blockNumber });
  if (!value || !/^0x0{24}[a-f0-9]{40}$/i.test(value)) return undefined;
  const decoded = `0x${value.slice(-40)}`;
  return isAddress(decoded) ? decoded : undefined;
}

async function verifyCode(client: PublicClient, address: Address, pin: CodePin, blockNumber: bigint) {
  requireAssembly(pin && ["immutable", "eip1967", "eip1967-beacon"].includes(pin.kind), "invalid-code-pin");
  requireAssembly(await matchesCode(client, address, pin.codeHash, blockNumber), "code-hash-mismatch");
  if (pin.kind === "eip1967") {
    const implementation = await readSlotAddress(client, address, implementationSlot, blockNumber);
    requireAssembly(implementation, "invalid-implementation");
    requireAssembly(await matchesCode(client, implementation, pin.implementationCodeHash, blockNumber), "implementation-hash-mismatch");
  } else if (pin.kind === "eip1967-beacon") {
    requireAssembly(isAddress(pin.beacon) && isAddress(pin.implementation), "invalid-code-pin");
    const beacon = await readSlotAddress(client, address, beaconSlot, blockNumber);
    requireAssembly(beacon && same(beacon, pin.beacon), "beacon-mismatch");
    requireAssembly(await matchesCode(client, beacon, pin.beaconCodeHash, blockNumber), "beacon-code-hash-mismatch");
    const implementation = await client.readContract({ address: beacon, abi: beaconAbi, functionName: "implementation", blockNumber });
    requireAssembly(same(implementation, pin.implementation), "implementation-address-mismatch");
    requireAssembly(await matchesCode(client, implementation, pin.implementationCodeHash, blockNumber), "implementation-hash-mismatch");
  }
}

export function createVaultAssemblyPolicy(client: PublicClient, context: VaultRuntimeContext, host?: VaultAssemblyHostContext) {
  const approval = host?.approval;
  const { chainId, tokenAddress, vaultAddress, factoryAddress } = context;
  requireAssembly(isVaultAssemblyChain(chainId), "unsupported-chain");
  requireAssembly(host && approval && sha256.test(host.verifiedManifestSha256) && sha256.test(host.verifiedComponentSha256)
    && same(host.verifiedManifestSha256, approval.manifestSha256)
    && same(host.verifiedComponentSha256, approval.componentSha256), "artifact-not-approved");
  requireAssembly(approval.chainId === chainId, "approval-chain-mismatch");
  requireAssembly(isAddress(factoryAddress) && same(factoryAddress, approval.taxFactory)
    && isAddress(approval.businessFactory) && isAddress(tokenAddress) && isAddress(vaultAddress), "invalid-host-binding");
  requireAssembly(typeof approval.revealValueWei === "bigint" && approval.revealValueWei > 0n
    && approval.revealValueWei < 2n ** 256n, "invalid-reveal-value");
  requireAssembly(approval.taxVaultCode?.kind === "eip1967-beacon"
    && approval.runtimeCode?.kind === "eip1967-beacon", "beacon-pin-required");
  const { businessFactory: approvedFactory, businessFactoryCode, taxVaultCode, runtimeCode, revealValueWei } = approval;
  const writeConstraints = new Map<string, ResolvedWriteConstraint>([
    [commitSelector, zeroValueOnly],
    [verifySelector, zeroValueOnly],
    [revealSelector, { valueWei: revealValueWei, fixedBytes: netlistBytes, caseInsensitiveHexPrefix: true }],
  ]);

  async function resolve(blockNumber: bigint) {
    const vault = { address: vaultAddress, abi: taxVaultAbi, blockNumber } as const;
    await Promise.all([
      verifyCode(client, vaultAddress, taxVaultCode, blockNumber),
      verifyCode(client, approvedFactory, businessFactoryCode, blockNumber),
    ]);
    const [boundRuntime, businessFactory, taxFactory, taxToken] = await Promise.all([
      client.readContract({ ...vault, functionName: "businessVault" }),
      client.readContract({ ...vault, functionName: "businessFactory" }),
      client.readContract({ ...vault, functionName: "taxFactory" }),
      client.readContract({ ...vault, functionName: "taxToken" }),
    ]);
    requireAssembly(isAddress(boundRuntime) && same(businessFactory, approvedFactory)
      && same(taxFactory, factoryAddress) && same(taxToken, tokenAddress), "vault-binding-mismatch");
    await verifyCode(client, boundRuntime, runtimeCode, blockNumber);
    const runtimeVault = await client.readContract({ address: boundRuntime, abi: runtimeAbi, functionName: "taxVault", blockNumber });
    requireAssembly(same(runtimeVault, vaultAddress), "runtime-vault-mismatch");
    return boundRuntime;
  }

  function validateWrite(method: AbiFunction, request: ContractWriteRequest) {
    const constraint = writeConstraints.get(toFunctionSelector(method));
    requireAssembly(constraint, "value-mismatch");
    const { fixedBytesMatch, valueMatches } = checkResolvedWriteConstraint(request, constraint);
    requireAssembly(valueMatches, "value-mismatch");
    requireAssembly(fixedBytesMatch, "netlist-length");
  }

  return { resolve, validateWrite };
}
