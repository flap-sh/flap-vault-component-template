import { keccak256, parseAbi } from "viem";
import type { AbiFunction, PublicClient } from "viem";
import type { Address, ContractWriteRequest, VaultRuntimeContext } from "./types";

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

export interface TapeXAssemblyApproval {
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
export interface TapeXAssemblyHostContext {
  verifiedManifestSha256: string;
  verifiedComponentSha256: string;
  approval: TapeXAssemblyApproval;
}

const testnetChainId = 97;
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

function requireTapeX(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error(`tape-x-assembly/${code}`);
}

function same(a: string | undefined, b: string | undefined) {
  return a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();
}

function isAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[a-f0-9]{40}$/i.test(value) && !/^0x0+$/i.test(value);
}

async function matchesCode(client: PublicClient, address: Address, expectedHash: Address, blockNumber: bigint) {
  requireTapeX(codeHash.test(expectedHash), "invalid-code-pin");
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
  requireTapeX(pin && ["immutable", "eip1967", "eip1967-beacon"].includes(pin.kind), "invalid-code-pin");
  requireTapeX(await matchesCode(client, address, pin.codeHash, blockNumber), "code-hash-mismatch");
  if (pin.kind === "eip1967") {
    const implementation = await readSlotAddress(client, address, implementationSlot, blockNumber);
    requireTapeX(implementation, "invalid-implementation");
    requireTapeX(await matchesCode(client, implementation, pin.implementationCodeHash, blockNumber), "implementation-hash-mismatch");
  } else if (pin.kind === "eip1967-beacon") {
    requireTapeX(isAddress(pin.beacon) && isAddress(pin.implementation), "invalid-code-pin");
    const beacon = await readSlotAddress(client, address, beaconSlot, blockNumber);
    requireTapeX(beacon && same(beacon, pin.beacon), "beacon-mismatch");
    requireTapeX(await matchesCode(client, beacon, pin.beaconCodeHash, blockNumber), "beacon-code-hash-mismatch");
    const implementation = await client.readContract({ address: beacon, abi: beaconAbi, functionName: "implementation", blockNumber });
    requireTapeX(same(implementation, pin.implementation), "implementation-address-mismatch");
    requireTapeX(await matchesCode(client, implementation, pin.implementationCodeHash, blockNumber), "implementation-hash-mismatch");
  }
}

export function createTapeXAssemblyPolicy(client: PublicClient, context: VaultRuntimeContext, host?: TapeXAssemblyHostContext) {
  const approval = host?.approval;
  const { chainId, tokenAddress, vaultAddress, factoryAddress } = context;
  requireTapeX(chainId === testnetChainId, "testnet-only");
  requireTapeX(host && approval && sha256.test(host.verifiedManifestSha256) && sha256.test(host.verifiedComponentSha256)
    && same(host.verifiedManifestSha256, approval.manifestSha256)
    && same(host.verifiedComponentSha256, approval.componentSha256), "artifact-not-approved");
  requireTapeX(isAddress(factoryAddress) && same(factoryAddress, approval.taxFactory)
    && isAddress(approval.businessFactory) && isAddress(tokenAddress) && isAddress(vaultAddress), "invalid-host-binding");
  requireTapeX(typeof approval.revealValueWei === "bigint" && approval.revealValueWei > 0n
    && approval.revealValueWei < 2n ** 256n, "invalid-reveal-value");
  requireTapeX(approval.taxVaultCode?.kind === "eip1967-beacon"
    && approval.runtimeCode?.kind === "eip1967-beacon", "beacon-pin-required");
  const { businessFactory: approvedFactory, businessFactoryCode, taxVaultCode, runtimeCode, revealValueWei } = approval;

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
    requireTapeX(isAddress(boundRuntime) && same(businessFactory, approvedFactory)
      && same(taxFactory, factoryAddress) && same(taxToken, tokenAddress), "vault-binding-mismatch");
    await verifyCode(client, boundRuntime, runtimeCode, blockNumber);
    const runtimeVault = await client.readContract({ address: boundRuntime, abi: runtimeAbi, functionName: "taxVault", blockNumber });
    requireTapeX(same(runtimeVault, vaultAddress), "runtime-vault-mismatch");
    return boundRuntime;
  }

  function validateWrite(method: AbiFunction, request: ContractWriteRequest) {
    const value = request.value ?? 0n;
    if (method.name === "commitTapeout") {
      requireTapeX(value === 0n, "value-mismatch");
      return;
    }
    requireTapeX(method.name === "revealTapeout" && value === revealValueWei, "value-mismatch");
    const netlist = request.args?.[2];
    requireTapeX(typeof netlist === "string" && /^0x[0-9a-f]{70}$/i.test(netlist), "netlist-length");
  }

  return { resolve, validateWrite };
}
