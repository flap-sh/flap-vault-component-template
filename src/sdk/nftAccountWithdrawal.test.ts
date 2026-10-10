import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, keccak256, parseAbi } from "viem";
import type { Hex, PublicClient } from "viem";
import type { Address, ContractWriteRequest, VaultManifest, VaultRuntimeContext } from "./types";
import type { NftAccountWithdrawalPolicy } from "./nftAccountTypes";
// @ts-expect-error Node type-stripping runner needs the source extension.
import { assertNoGenericNftAccountExecute, snapshotGenericContractWrite, deriveNftAccount, nftAccountCode, withdrawNftAccount } from "./nftAccountWithdrawal.ts";

const a = (id: number) => `0x${id.toString(16).padStart(40, "0")}` as Address;
const pin = (id: number) => ({ address: a(id), codeHash: keccak256("0x6000") });
const p: NftAccountWithdrawalPolicy = {
  policyId: "reviewed-withdrawal", profile: "null-bag-withdraw-v1", artifactId: "test-artifact", chainId: 56,
  factory: pin(1), token: pin(2), registry: pin(3), accountImplementation: pin(4),
  vault: { ...pin(5), beacon: pin(6), implementation: pin(7) },
  nft: { ...pin(8), beacon: pin(9), implementation: pin(10) },
  salt: `0x${"00".repeat(31)}01`,
};
const holder = a(20);
const id = 12n;
const account = deriveNftAccount(p, id);
const eventAbi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)", "event SyncFailed(uint256 indexed tokenId,uint256 bagBefore,uint256 bagAfter)"]);
const transferLog = { address: p.token.address, topics: encodeEventTopics({ abi: eventAbi, eventName: "Transfer", args: { from: account, to: holder } }), data: encodeAbiParameters([{ type: "uint256" }], [90n]) };
const syncLog = { address: account, topics: encodeEventTopics({ abi: eventAbi, eventName: "SyncFailed", args: { tokenId: id } }), data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [1000n, 900n]) };

function fixture() {
  const state = { chain: 56, owner: holder, balance: 1000n, badCode: "", badRelationship: "", implChanged: false, footerChanged: false, falseReturn: false, status: "success", logs: [transferLog], estimate: 600_000n, sends: 0, refresh: 0, validations: 0, changeOnSimulation: false, walletChangeOnSimulation: false, burn: false, readAfterFails: false, waitFails: false, walletChanged: false, badStorage: false, malformedReturn: false, sent: undefined as ContractWriteRequest | undefined };
  const client = {
    getChainId: async () => state.chain,
    getBlockNumber: async () => { state.validations++; return 100n; },
    getCode: async ({ address }: { address: string }) => address === state.badCode ? "0x6001" : address.toLowerCase() === account.toLowerCase() ? nftAccountCode(p.accountImplementation.address, p.salt, 56, p.nft.address, id) : "0x6000",
    getStorageAt: async ({ address }: { address: string }) => state.badStorage ? `0x${"00".repeat(32)}` : `0x${"0".repeat(24)}${(address === p.vault.address ? p.vault.beacon.address : p.nft.beacon.address).slice(2)}`,
    readContract: async ({ address, functionName, blockNumber }: { address: string; functionName: string; blockNumber: bigint }) => {
      if (functionName === state.badRelationship) return a(99);
      if (functionName === "implementation") return state.implChanged ? a(99) : address === p.vault.beacon.address ? p.vault.implementation.address : p.nft.implementation.address;
      if (functionName === "nftBeacon") return p.nft.beacon.address;
      if (functionName === "vaultBeacon") return p.vault.beacon.address;
      if (functionName === "nft") return p.nft.address;
      if (functionName === "vault") return p.vault.address;
      if (functionName === "bag") return p.token.address;
      if (functionName === "registry") return p.registry.address;
      if (functionName === "salt") return p.salt;
      if (functionName === "accountImpl") return p.accountImplementation.address;
      if (["walletOf", "account"].includes(functionName)) return account;
      if (["ownerOf", "controllerOf", "owner"].includes(functionName)) {
        if (state.burn && functionName === "ownerOf") throw new Error("burned");
        return state.owner;
      }
      if (functionName === "tokenIdOfWallet") return id;
      if (functionName === "token") return [state.footerChanged ? 97n : 56n, p.nft.address, id];
      if (functionName === "balanceOf") {
        if (blockNumber === 101n && state.readAfterFails) throw new Error("RPC unavailable");
        return blockNumber === 101n ? 900n : state.balance;
      }
      throw new Error(`Unexpected read ${functionName}`);
    },
    estimateContractGas: async () => state.estimate,
    simulateContract: async () => {
      if (state.changeOnSimulation) state.owner = a(99);
      if (state.walletChangeOnSimulation) state.walletChanged = true;
      return { result: state.malformedReturn ? "0x1234" : encodeAbiParameters([{ type: "bool" }], [!state.falseReturn]) };
    },
    waitForTransactionReceipt: async () => { if (state.waitFails) throw new Error("timeout"); return { status: state.status, blockNumber: 101n, logs: state.logs }; },
  } as unknown as PublicClient;
  const env = {
    client,
    manifest: { artifactId: p.artifactId, match: { bindings: [{ chainId: 56, factoryAddress: p.factory.address, nftAccountWithdrawals: [{ policyId: p.policyId, profile: p.profile }] }] } } as VaultManifest,
    context: { chainId: 56, vaultAddress: p.vault.address, factoryAddress: p.factory.address, tokenAddress: p.token.address } as VaultRuntimeContext,
    policies: [p],
    getWallet: async () => ({ address: state.walletChanged ? a(99) : holder, chainId: state.chain }),
    send: async (request: ContractWriteRequest) => { state.sends++; state.sent = request; return a(50); },
    refetch: async () => { state.refresh++; },
  };
  const run = () => withdrawNftAccount(env, { policyId: p.policyId, tokenId: id, amount: 100n });
  return { state, env, run };
}

test("withdraws only bag to the live holder with zero value/CALL and padded gas", async () => {
  const { state, run } = fixture();
  const result = await run();
  assert.equal(result.status, "withdrawn");
  assert.equal(result.balanceAfter, 900n);
  assert.equal(state.validations, 2);
  assert.equal(state.refresh, 1);
  assert.deepEqual(state.sent?.args?.slice(0, 2), [p.token.address, 0n]);
  assert.equal(state.sent?.args?.[3], 0);
  assert.equal(state.sent?.value, 0n);
  assert.equal(state.sent?.gas, 770_000n);
  const decoded = decodeFunctionData({ abi: parseAbi(["function transfer(address,uint256) returns (bool)"]), data: state.sent!.args![2] as Hex });
  assert.deepEqual(decoded.args, [holder, 100n]);
});

test("a successful receipt with SyncFailed is a completed withdrawal needing sync", async () => {
  const { state, run } = fixture(); state.logs = [transferLog, syncLog];
  assert.equal((await run()).status, "withdrawn-sync-required");
  assert.equal(state.sends, 1);
});

test("receipt failure and missing transfer evidence never report withdrawal success", async () => {
  for (const status of ["reverted", "success"]) {
    const { state, run } = fixture(); state.status = status; state.logs = [];
    assert.equal((await run()).status, status === "reverted" ? "reverted" : "effect-unconfirmed");
  }
  const { state, run } = fixture(); state.readAfterFails = true;
  assert.equal((await run()).balanceAfter, undefined);
});

test("fails closed on unapproved, undeclared, wrong artifact and wrong host bindings", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.env.policies = []; },
    (f: ReturnType<typeof fixture>) => { f.env.manifest.match.bindings[0].nftAccountWithdrawals = []; },
    (f: ReturnType<typeof fixture>) => { f.env.manifest.artifactId = "other"; },
    (f: ReturnType<typeof fixture>) => { f.env.context.vaultAddress = a(99); },
    (f: ReturnType<typeof fixture>) => { f.state.chain = 97; },
  ]) {
    const f = fixture(); change(f); await assert.rejects(f.run()); assert.equal(f.state.sends, 0);
  }
});

test("rejects changed code, upgraded beacon, spoofed registry/account/owner/footer and burned NFTs", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.state.badCode = p.accountImplementation.address; },
    (f: ReturnType<typeof fixture>) => { f.state.badCode = account; },
    (f: ReturnType<typeof fixture>) => { f.state.implChanged = true; },
    (f: ReturnType<typeof fixture>) => { f.state.badStorage = true; },
    (f: ReturnType<typeof fixture>) => { f.state.malformedReturn = true; },
    (f: ReturnType<typeof fixture>) => { f.state.badRelationship = "account"; },
    (f: ReturnType<typeof fixture>) => { f.state.badRelationship = "walletOf"; },
    (f: ReturnType<typeof fixture>) => { f.state.owner = a(99); },
    (f: ReturnType<typeof fixture>) => { f.state.footerChanged = true; },
    (f: ReturnType<typeof fixture>) => { f.state.burn = true; },
    (f: ReturnType<typeof fixture>) => { f.state.changeOnSimulation = true; },
    (f: ReturnType<typeof fixture>) => { f.state.walletChangeOnSimulation = true; },
    (f: ReturnType<typeof fixture>) => { f.state.balance = 99n; },
    (f: ReturnType<typeof fixture>) => { f.state.falseReturn = true; },
    (f: ReturnType<typeof fixture>) => { f.state.estimate = 5_000_000n; },
  ]) {
    const f = fixture(); change(f); await assert.rejects(f.run()); assert.equal(f.state.sends, 0);
  }
});

test("caller cannot add a recipient/target/value/calldata or use generic execute", async () => {
  const f = fixture();
  for (const key of ["recipient", "target", "value", "data", "operation"]) {
    await assert.rejects(withdrawNftAccount(f.env, { policyId: p.policyId, tokenId: id, amount: 100n, [key]: holder }));
  }
  const abi = parseAbi(["function execute(address,uint256,bytes,uint8) payable returns (bytes)"]);
  assert.throws(() => assertNoGenericNftAccountExecute({ address: account, abi, functionName: "execute", args: [p.token.address, 0n, "0x", 0] }), /use-restricted-entry/);
  assert.doesNotThrow(() => assertNoGenericNftAccountExecute({ address: p.vault.address, abi: parseAbi(["function sync(uint256)"]), functionName: "sync", args: [id] }));
  assert.notEqual(deriveNftAccount({ ...p, salt: `0x${"00".repeat(32)}` }, id), account);
});


test("a receipt timeout preserves the broadcast hash without resubmitting", async () => {
  const { state, run } = fixture(); state.waitFails = true;
  const result = await run();
  assert.equal(result.status, "effect-unconfirmed");
  assert.equal(result.hash, a(50));
  assert.equal(state.sends, 1);
});

test("generic requests cannot change into execute while fee lookup is pending", () => {
  const request: ContractWriteRequest = { address: p.vault.address, abi: parseAbi(["function sync(uint256)"]), functionName: "sync", args: [id] };
  const safe = snapshotGenericContractWrite(request);
  request.functionName = "execute";
  request.args![0] = 99n;
  assert.equal(safe.functionName, "sync");
  assert.deepEqual(safe.args, [id]);
  assert.notEqual(safe.abi, request.abi);
});
