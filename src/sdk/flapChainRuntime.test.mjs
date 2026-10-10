import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
const bundled = buildSync({ entryPoints: ["src/sdk/flapChainRuntime.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { createFlapChainSdk } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const { parseAbi, encodeFunctionData } = await import("viem");
const owner = "0x1111111111111111111111111111111111111111";
const portal = "0x2222222222222222222222222222222222222222";
const vault = "0x3333333333333333333333333333333333333333";
const hash = `0x${"a".repeat(64)}`;
const signatures = ["function launch(uint256 version) payable", "function claim()", "function buy(uint256 minOut) payable", "function sell(uint256 amount,uint256 minOut)", "function approve(address spender,uint256 amount) returns (bool)"];
const abi = parseAbi(signatures);
function fixture(patch = {}) {
  let account = { address: owner, isConnected: true, chainId: 56 }; let resolved = vault;
  const calls = []; const manifest = { appModel: "standalone", walletChains: [56], walletContracts: [{ id: "portal", chainId: 56, address: portal, allow: signatures, read: ["function vaultOf(address token) view returns (address)"], maxValueWei: "1000", approvalSpenders: [portal], maxApprovalWei: "100", resolvedContracts: [{ id: "rewards", resolver: "function vaultOf(address token) view returns (address)", allow: ["function claim()"], read: ["function pending(address wallet) view returns (uint256)"] }] }], match: { bindings: [] } };
  const runtime = { chains: [{ id: 56, name: "BNB", explorerBaseUrl: "https://bscscan.com" }], getAccount: () => account,
    connect() {}, disconnect() {}, switchChain: async () => { account.chainId = 56; },
    getCode: async () => "0x6000", readContract: async (_chain, request) => request.functionName === "vaultOf" ? resolved : 8n,
    simulateContract: async (chain, request) => { calls.push(["simulate", chain, request]); return 9n; },
    writeContract: async (chain, request) => { calls.push(["write", chain, request]); return hash; },
    sendTransaction: async (chain, request) => { calls.push(["send", chain, request]); return hash; },
    waitForTx: async () => ({ hash, status: "success", blockNumber: 10n, logs: [] }), getGasPrice: async () => 10n, getBlockNumber: async () => 2500n,
    getBalance: async () => 123n, getContractEvents: async (_chain, request) => { calls.push(["events", request]); return [request.fromBlock]; },
    upload: async (request) => { calls.push(["upload", request]); return { cid: "test" }; }, openUrl() {}, ...patch };
  const sdk = createFlapChainSdk(runtime, { chainId: 56, manifest, writableChains: manifest.walletChains, i18n: { locale: "en", t: (k) => k }, notify: {} });
  return { sdk, runtime, calls, manifest, setAccount: (value) => { account = value; }, setResolved: (value) => { resolved = value; } };
}
const request = (functionName, args = [], value) => ({ address: portal, abi, functionName, args, value });
test("launch regular/tax token, claim, buy and sell all use the same host account and chain", async () => {
  const { sdk, calls } = fixture();
  for (const call of [request("launch", [2n], 100n), request("launch", [6n], 100n), request("claim"), request("buy", [10n], 50n), request("sell", [10n, 5n])]) {
    const simulation = await sdk.simulateContract(call); assert.equal(simulation.result, 9n);
    assert.equal(await sdk.writeContract(simulation.request), hash);
  }
  assert.equal(calls.filter(([kind]) => kind === "write").length, 5);
  for (const [, chain, call] of calls) { assert.equal(chain, 56); assert.equal(call.account, owner); }
  assert.deepEqual(await sdk.waitForTx(hash), { hash, status: "success", blockNumber: 10n, logs: [] });
});
test("disconnected, wrong-chain, fixture and undeclared chains send nothing", async () => {
  for (const account of [{ isConnected: false }, { isConnected: true, address: owner, chainId: 97 }]) { const f = fixture(); f.setAccount(account); await assert.rejects(f.sdk.writeContract(request("claim"))); assert.equal(f.calls.length, 0); }
  const f = fixture({ readOnly: true }); await assert.rejects(f.sdk.writeContract(request("claim")), /fixtures/); assert.equal(f.calls.length, 0);
  const g = fixture(); const sdk = createFlapChainSdk(g.runtime, { chainId: 56, manifest: g.manifest, writableChains: [], i18n: {}, notify: {} }); await assert.rejects(sdk.writeContract(request("claim")), /walletChains/);
  assert.throws(() => createFlapChainSdk(g.runtime, { chainId: 97, manifest: g.manifest, writableChains: [97] }), /Unsupported/);
});
test("network switching is explicit", async () => { const f = fixture(); f.setAccount({ address: owner, isConnected: true, chainId: 97 }); assert.equal(f.sdk.wallet.isWrongNetwork, true); await f.sdk.wallet.switchChain(); assert.equal(f.sdk.wallet.isWrongNetwork, false); });
test("target, selector, value, spender and approval cap are enforced", async () => {
  const f = fixture();
  for (const call of [{ ...request("claim"), address: vault }, { address: portal, abi: parseAbi(["function drain()"]), functionName: "drain" }, request("buy", [0n], 1001n), request("claim", [], 1n), request("approve", [vault, 10n]), request("approve", [portal, 101n])]) await assert.rejects(f.sdk.writeContract(call));
  assert.equal(f.calls.length, 0); await f.sdk.writeContract(request("approve", [portal, 100n])); assert.equal(f.calls.length, 1);
});
test("manifest and in-flight ABI/args mutations cannot expand permissions", async () => {
  const f = fixture(); f.manifest.walletContracts[0].address = vault; f.manifest.walletChains.push(97);
  await assert.rejects(f.sdk.writeContract({ ...request("claim"), address: vault }), /undeclared/);
  let release; const gate = new Promise((r) => { release = r; }); const g = fixture({ getGasPrice: () => gate });
  const call = { ...request("buy", [5n], 10n), gasPrice: 10n }; const pending = g.sdk.writeContract(call); call.args[0] = 999n; call.value = 10000n; release(10n); await pending;
  assert.deepEqual(g.calls[0][2].args, [5n]); assert.equal(g.calls[0][2].value, 10n);
});
test("account/chain changes while awaiting gas checks reject before signing", async () => {
  for (const account of [{ address: vault, isConnected: true, chainId: 56 }, { address: owner, isConnected: true, chainId: 97 }, { isConnected: false }]) {
    const f = fixture(); f.runtime.getGasPrice = async () => { f.setAccount(account); return 10n; };
    await assert.rejects(f.sdk.writeContract({ ...request("claim"), gasPrice: 10n })); assert.equal(f.calls.length, 0);
  }
});
test("resolved claims use genuine handles, re-resolve, and reject changed/forged/foreign targets", async () => {
  const f = fixture(); const handle = await f.sdk.resolveContract("rewards", [portal]);
  const call = { contract: handle, abi: parseAbi(["function claim()"]), functionName: "claim" };
  const sim = await f.sdk.simulateContract(call); assert.equal(sim.request.contract, handle); assert.equal(sim.request.address, undefined);
  await f.sdk.writeContract(sim.request); assert.equal(f.calls.at(-1)[2].address, vault);
  await assert.rejects(f.sdk.writeContract({ ...call, contract: { ...handle } }), /forged/);
  await assert.rejects(fixture().sdk.writeContract(call), /forged/);
  await assert.rejects(f.sdk.writeContract({ ...call, address: portal }), /override|handle-with-address/);
  f.setResolved(owner); await assert.rejects(f.sdk.writeContract(call), /changed/);
});
test("resolved target or wallet changes during simulation abort the write", async () => {
  const f = fixture(); const handle = await f.sdk.resolveContract("rewards", [portal]);
  f.runtime.simulateContract = async () => { f.setResolved(owner); };
  await assert.rejects(f.sdk.writeContract({ contract: handle, abi: parseAbi(["function claim()"]), functionName: "claim" }), /changed/);
  assert.equal(f.calls.length, 0);
});
test("raw calldata cannot bypass signatures or send native currency to arbitrary recipients", async () => {
  const f = fixture(); const data = encodeFunctionData({ abi, functionName: "buy", args: [5n] });
  await f.sdk.sendTransaction({ to: portal, data, value: 10n }); assert.equal(f.calls[0][2].account, owner);
  for (const call of [{ to: owner, value: 1n }, { to: portal, data: "0x12345678" }, { to: portal, data, value: 1001n }]) await assert.rejects(f.sdk.sendTransaction(call));
  assert.equal(f.calls.length, 1);
});
test("reverted receipts and wallet rejections are preserved", async () => {
  const f = fixture({ waitForTx: async () => ({ hash, status: "reverted", blockNumber: 11n, logs: [] }), writeContract: async () => { throw new Error("User rejected"); } });
  assert.equal((await f.sdk.waitForTx(hash)).status, "reverted"); await assert.rejects(f.sdk.writeContract(request("claim")), /User rejected/);
});
test("fees and event lookbacks retain the existing bounds", async () => {
  const f = fixture(); await assert.rejects(f.sdk.writeContract({ ...request("claim"), gasPrice: 21n }), /safety limit/);
  await assert.rejects(f.sdk.writeContract({ ...request("claim"), gas: 5000001n }), /must not exceed/);
  const events = await f.sdk.getContractEvents({ address: portal, abi: [], eventName: "Transfer", fromBlock: 0n, toBlock: 2500n }).catch(() => []); assert.deepEqual(events, []);
  const eventAbi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 amount)"]);
  assert.deepEqual(await f.sdk.getContractEvents({ address: portal, abi: eventAbi, eventName: "Transfer", fromBlock: 0n, toBlock: 2500n }), [0n, 1001n, 2002n]);
  await assert.rejects(f.sdk.getContractEvents({ address: portal, abi: eventAbi, eventName: "Transfer", fromBlock: 0n, toBlock: 20001n }), /must not exceed/);
});
