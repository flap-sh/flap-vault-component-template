import { concatHex, decodeAbiParameters, decodeEventLog, encodeAbiParameters, encodeFunctionData, getContractAddress, keccak256, parseAbi } from "viem";
import type { Hex, PublicClient } from "viem";
import type { Address, ContractWriteRequest, VaultManifest, VaultRuntimeContext } from "./types";
import type { NftAccountWithdrawalPolicy, NftAccountWithdrawalRequest, NftAccountWithdrawalReceipt, ReviewedContractPin, ReviewedBeaconPin } from "./nftAccountTypes";

const abi = parseAbi([
  "function nft() view returns (address)", "function vault() view returns (address)",
  "function bag() view returns (address)", "function registry() view returns (address)",
  "function salt() view returns (bytes32)", "function accountImpl() view returns (address)",
  "function walletOf(uint256) view returns (address)", "function tokenIdOfWallet(address) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)", "function controllerOf(uint256) view returns (address)",
  "function owner() view returns (address)", "function token() view returns (uint256,address,uint256)",
  "function implementation() view returns (address)", "function nftBeacon() view returns (address)",
  "function vaultBeacon() view returns (address)", "function balanceOf(address) view returns (uint256)",
  "function account(address,bytes32,uint256,address,uint256) view returns (address)",
  "function transfer(address,uint256) returns (bool)",
  "function execute(address,uint256,bytes,uint8) payable returns (bytes)",
  "event SyncFailed(uint256 indexed tokenId,uint256 bagBefore,uint256 bagAfter)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
const beaconSlot = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const executeSelector = encodeFunctionData({ abi, functionName: "execute", args: ["0x0000000000000000000000000000000000000001", 0n, "0x", 0] }).slice(0, 10);
const zero = /^0x0+$/i;
function requireRule(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error(`nft-account/${code}`);
}
function same(a: unknown, b: unknown) { return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase(); }
function address(value: unknown): asserts value is Address { requireRule(typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value) && !zero.test(value), "invalid-address"); }

/** Generic SDK writes must never serve as an alternative to the restricted entry. */
export function assertNoGenericNftAccountExecute(request: ContractWriteRequest) {
  if (!request.abi) return;
  const data = encodeFunctionData({ abi: request.abi, functionName: request.functionName, args: request.args });
  requireRule(data.slice(0, 10) !== executeSelector, "use-restricted-entry");
}

export function snapshotGenericContractWrite(request: ContractWriteRequest): ContractWriteRequest {
  const snapshot = structuredClone(request);
  assertNoGenericNftAccountExecute(snapshot);
  return snapshot;
}

/** EIP-6551 reference registry deployment code; salt/chain/token are not assumed. */
export function nftAccountCode(implementation: Address, salt: Hex, chainId: number, nft: Address, tokenId: bigint) {
  return concatHex([
    "0x363d3d373d3d3d363d73", implementation, "0x5af43d82803e903d91602b57fd5bf3",
    salt, encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "uint256" }], [BigInt(chainId), nft, tokenId]),
  ]);
}

export function deriveNftAccount(policy: NftAccountWithdrawalPolicy, tokenId: bigint) {
  const code = nftAccountCode(policy.accountImplementation.address, policy.salt, policy.chainId, policy.nft.address, tokenId);
  return getContractAddress({ opcode: "CREATE2", from: policy.registry.address, salt: policy.salt, bytecode: concatHex(["0x3d60ad80600a3d3981f3", code]) });
}

interface WithdrawalEnvironment {
  client: PublicClient;
  manifest: VaultManifest;
  context: VaultRuntimeContext;
  policies: readonly NftAccountWithdrawalPolicy[];
  /** Must check the live wallet again immediately before signing. */
  getWallet(): Promise<{ address: Address; chainId: number }>;
  send(request: ContractWriteRequest, expectedSender: Address): Promise<Address>;
  refetch(): Promise<void>;
}

export async function withdrawNftAccount(env: WithdrawalEnvironment, request: NftAccountWithdrawalRequest): Promise<NftAccountWithdrawalReceipt> {
  const input = { ...request };
  requireRule(Object.keys(input).every((key) => ["policyId", "tokenId", "amount"].includes(key)), "unexpected-input");
  requireRule(typeof input.tokenId === "bigint" && input.tokenId > 0n && input.tokenId < 2n ** 256n, "invalid-token-id");
  requireRule(typeof input.amount === "bigint" && input.amount > 0n && input.amount < 2n ** 256n, "invalid-amount");
  const policies = env.policies.filter((p) => p.policyId === input.policyId && p.artifactId === env.manifest.artifactId && p.chainId === env.context.chainId);
  requireRule(policies.length === 1, "policy-not-approved");
  // Capture trusted configuration, not mutable values returned by the component.
  const p = structuredClone(policies[0]);
  requireRule(p.profile === "null-bag-withdraw-v1", "unsupported-profile");
  requireRule(same(env.context.vaultAddress, p.vault.address) && same(env.context.tokenAddress, p.token.address) && same(env.context.factoryAddress, p.factory.address), "host-binding-mismatch");
  requireRule(/^0x[0-9a-f]{64}$/i.test(p.salt), "invalid-salt");
  const bindings = env.manifest.match.bindings.filter((b) => b.chainId === p.chainId && same(b.factoryAddress, p.factory.address));
  requireRule(bindings.length === 1 && bindings[0].nftAccountWithdrawals?.some((d) => d.policyId === p.policyId && d.profile === p.profile), "policy-not-declared");
  const recipient = (await env.getWallet()).address;
  address(recipient);
  const accountAddress = deriveNftAccount(p, input.tokenId);

  async function validate() {
    const wallet = await env.getWallet();
    requireRule(same(wallet.address, recipient) && wallet.chainId === p.chainId && await env.client.getChainId() === p.chainId, "wallet-or-chain-changed");
    const blockNumber = await env.client.getBlockNumber();
    async function read<T>(at: Address, functionName: string, args?: readonly unknown[]) {
      return await env.client.readContract({ address: at, abi, functionName, args, blockNumber } as never) as T;
    }
    async function pin(contract: ReviewedContractPin) {
      address(contract.address);
      requireRule(/^0x[0-9a-f]{64}$/i.test(contract.codeHash), "invalid-code-hash");
      const code = await env.client.getCode({ address: contract.address, blockNumber });
      requireRule(code && code !== "0x" && same(keccak256(code), contract.codeHash), "code-changed");
    }
    async function beacon(contract: ReviewedBeaconPin) {
      await pin(contract); await pin(contract.beacon); await pin(contract.implementation);
      const slot = await env.client.getStorageAt({ address: contract.address, slot: beaconSlot, blockNumber });
      requireRule(slot && same(`0x${slot.slice(-40)}`, contract.beacon.address), "beacon-changed");
      requireRule(same(await read(contract.beacon.address, "implementation"), contract.implementation.address), "implementation-changed");
    }
    await Promise.all([pin(p.factory), pin(p.token), pin(p.registry), pin(p.accountImplementation), beacon(p.vault), beacon(p.nft)]);
    const checks = await Promise.all([
      read(p.factory.address, "nftBeacon"), read(p.factory.address, "vaultBeacon"),
      read(p.vault.address, "nft"), read(p.nft.address, "vault"), read(p.nft.address, "bag"),
      read(p.nft.address, "registry"), read(p.nft.address, "salt"), read(p.nft.address, "accountImpl"),
      read(p.accountImplementation.address, "nft"), read(p.accountImplementation.address, "vault"),
      read(p.nft.address, "walletOf", [input.tokenId]),
      read(p.registry.address, "account", [p.accountImplementation.address, p.salt, BigInt(p.chainId), p.nft.address, input.tokenId]),
      read(p.nft.address, "ownerOf", [input.tokenId]), read(p.nft.address, "controllerOf", [input.tokenId]),
      read(accountAddress, "owner"), read(accountAddress, "nft"), read(accountAddress, "vault"),
    ]);
    const expected = [p.nft.beacon.address, p.vault.beacon.address, p.nft.address, p.vault.address, p.token.address, p.registry.address, p.salt, p.accountImplementation.address, p.nft.address, p.vault.address, accountAddress, accountAddress, recipient, recipient, recipient, p.nft.address, p.vault.address];
    requireRule(checks.every((value, i) => same(value, expected[i])), "relationship-mismatch");
    requireRule(await read(p.nft.address, "tokenIdOfWallet", [accountAddress]) === input.tokenId, "wallet-id-mismatch");
    const token = await read<readonly [bigint, Address, bigint]>(accountAddress, "token");
    requireRule(token[0] === BigInt(p.chainId) && same(token[1], p.nft.address) && token[2] === input.tokenId, "footer-mismatch");
    const code = await env.client.getCode({ address: accountAddress, blockNumber });
    requireRule(same(code, nftAccountCode(p.accountImplementation.address, p.salt, p.chainId, p.nft.address, input.tokenId)), "account-code-mismatch");
    const balance = await read<bigint>(p.token.address, "balanceOf", [accountAddress]);
    requireRule(typeof balance === "bigint" && input.amount <= balance, "insufficient-balance");
  }
  await validate();
  const data = encodeFunctionData({ abi, functionName: "transfer", args: [recipient, input.amount] });
  const args = [p.token.address, 0n, data, 0] as const;
  const base = { account: recipient, address: accountAddress, abi, functionName: "execute", args, value: 0n } as const;
  const estimated = await env.client.estimateContractGas(base);
  // NullAccount requires >=422,500 gas AFTER the token call; allow estimate margin.
  const padded = estimated * 120n / 100n + 50_000n;
  const gas = padded < 600_000n ? 600_000n : padded;
  requireRule(gas >= 600_000n && gas <= 5_000_000n, "gas-out-of-range");
  const simulation = await env.client.simulateContract({ ...base, gas });
  const returned = simulation.result;
  requireRule(returned === "0x" || (typeof returned === "string" && returned.length === 66 && decodeAbiParameters([{ type: "bool" }], returned as Hex)[0]), "token-transfer-rejected");
  await validate(); // No cached ownership, code, balance, or beacon approval across signing.
  const hash = await env.send({ address: accountAddress, abi, functionName: "execute", args: [...args], value: 0n, gas }, recipient);
  let receipt;
  try {
    receipt = await env.client.waitForTransactionReceipt({ hash });
  } catch {
    // A broadcast may be mined later. Keep the hash so the UI cannot mistake a
    // provider timeout for a safe reason to submit the withdrawal a second time.
    try { await env.refetch(); } catch { /* Keep the submitted hash. */ }
    return { hash, status: "effect-unconfirmed", accountAddress, recipient, amount: input.amount };
  }
  let balanceAfter: bigint | undefined;
  try {
    balanceAfter = await env.client.readContract({ address: p.token.address, abi, functionName: "balanceOf", args: [accountAddress], blockNumber: receipt.blockNumber });
  } catch { /* Never turn an RPC refresh failure into a false withdrawal success. */ }
  let transferred = 0n;
  let syncFailed = false;
  for (const log of receipt.logs) {
    try {
      const event = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (same(log.address, accountAddress) && event.eventName === "SyncFailed" && event.args.tokenId === input.tokenId) syncFailed = true;
      if (same(log.address, p.token.address) && event.eventName === "Transfer" && same(event.args.from, accountAddress) && same(event.args.to, recipient)) transferred += event.args.value;
    } catch { /* Other events are not withdrawal evidence. */ }
  }
  const status = receipt.status !== "success" ? "reverted" : transferred > 0n && transferred <= input.amount ? syncFailed ? "withdrawn-sync-required" : "withdrawn" : "effect-unconfirmed";
  // Refresh shares through the component's normal refetch effect even after SyncFailed.
  try { await env.refetch(); } catch { /* Receipt status remains authoritative. */ }
  return { hash, status, accountAddress, recipient, amount: input.amount, balanceAfter };
}
