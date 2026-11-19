import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
const bundled = buildSync({ entryPoints: ["src/sdk/flapChainRuntime.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { createFlapChainSdk } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const { parseAbi, encodeFunctionData, keccak256, toFunctionSelector } = await import("viem");
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
test("a resolved BNB launcher mint can simulate and submit above five million gas", async () => {
  const { runtime, calls } = fixture({
    readContract: async (_chain, { functionName }) => {
      assert.equal(functionName, "mintForLaunchSalt");
      return vault;
    },
  });
  const allow = ["function mint(bytes32[] candidates) payable"];
  const value = 2_000_000_000_000_000_000n;
  const sdk = createFlapChainSdk(runtime, {
    chainId: 56, writableChains: [56], i18n: {}, notify: {},
    manifest: {
      appModel: "standalone", walletChains: [56], match: { bindings: [] },
      walletContracts: [{
        id: "launcher-factory", chainId: 56, address: portal,
        read: ["function deploymentCount() view returns (uint256)"],
        resolvedContracts: [{
          id: "launcher", resolver: "function mintForLaunchSalt(bytes32 salt) view returns (address)",
          allow, maxValueWei: value.toString(),
        }],
      }],
    },
  });
  const contract = await sdk.resolveContract("launcher", [hash]);
  const gas = 6_532_584n;
  const simulation = await sdk.simulateContract({ contract, abi: parseAbi(allow), functionName: "mint", args: [[]], value, gas });
  assert.equal(await sdk.writeContract(simulation.request), hash);
  assert.deepEqual(calls.map(([kind, chainId, request]) => [kind, chainId, request.address, request.gas, request.value]), [
    ["simulate", 56, vault, gas, value],
    ["simulate", 56, vault, gas, value],
    ["write", 56, vault, gas, value],
  ]);
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

const quoteToken = "0x4444444444444444444444444444444444444444";
const otherQuoteToken = "0x5555555555555555555555555555555555555555";
const contributeQuote = "function contributeQuote(uint256 amount)";
async function presaleFixture(otherContracts = []) {
  const f = fixture();
  const root = f.manifest.walletContracts[0];
  root.allow = [...root.allow, contributeQuote];
  f.manifest.walletContracts.push(...otherContracts);
  const launcher = root.resolvedContracts[0];
  launcher.allow.push(contributeQuote);
  root.presaleApproval = { policyId: "presale-test", launcherResolver: launcher.id, maxApprovalWei: "100" };
  root.resolvedContracts.push({ ...launcher, id: "second-resolver" });
  let token = quoteToken;
  let approved = true;
  let allowance = 0n;
  const checked = [];
  const originalRead = f.runtime.readContract;
  f.runtime.readContract = async (chain, request) => {
    if (request.functionName !== "allowance") return originalRead(chain, request);
    assert.equal(request.address, token);
    assert.deepEqual(request.args, [owner, vault]);
    return allowance;
  };
  f.runtime.resolvePresaleApproval = async (request) => {
    checked.push(request);
    return { quoteToken: token, maxApprovalWei: 50n };
  };
  f.runtime.simulateContract = async (chain, request) => {
    f.calls.push(["simulate", chain, request]);
    return request.functionName === "approve" ? approved : undefined;
  };
  const sdk = createFlapChainSdk(f.runtime, { chainId: 56, manifest: f.manifest, writableChains: [56], i18n: {}, notify: {} });
  const pool = await sdk.resolveContract(launcher.id, [portal]);
  const contribution = { contract: pool, abi: parseAbi([contributeQuote]), functionName: "contributeQuote", args: [40n] };
  return {
    ...f, sdk, pool, contribution, checked,
    setAllowance: (amount) => { allowance = amount; },
    setQuote: (address) => { token = address; },
    setApprovalResult: (value) => { approved = value; },
  };
}

test("presale approval and contribution use the same reviewed pool, quote token and buyer", async () => {
  const f = await presaleFixture();
  await assert.rejects(f.sdk.writeContract(f.contribution), /presale-allowance-insufficient/);
  await f.sdk.approveQuote({ pool: f.pool, amount: 40n });
  const approval = f.calls.at(-1)[2];
  assert.equal(approval.address, quoteToken);
  assert.equal(approval.account, owner);
  assert.equal(approval.value, 0n);
  assert.equal(encodeFunctionData(approval), encodeFunctionData({
    abi, functionName: "approve", args: [vault, 40n],
  }));
  f.setAllowance(40n);
  await f.sdk.writeContract(f.contribution);
  assert.equal(f.calls.at(-1)[2].address, vault);
  assert.equal(f.calls.at(-1)[2].account, owner);
  assert.ok(f.checked.every((entry) => entry.chainId === 56 && entry.policyId === "presale-test" && entry.factory === portal && entry.launcher === vault));
});

test("presale guards reject fake handles, an unrelated resolver, overrides and excess approval before signing", async () => {
  const f = await presaleFixture();
  const secondPool = await f.sdk.resolveContract("second-resolver", [portal]);
  for (const request of [
    { pool: { ...f.pool }, amount: 10n },
    { pool: secondPool, amount: 10n },
    { pool: f.pool, amount: 10n, quoteToken: otherQuoteToken },
    { pool: f.pool, amount: 0n },
    { pool: f.pool, amount: 51n },
  ]) await assert.rejects(f.sdk.approveQuote(request), /app-wallet\//);
  await assert.rejects(f.sdk.writeContract({ ...f.contribution, contract: secondPool }), /undeclared-presale-launcher/);
  await assert.rejects(f.sdk.sendTransaction({ to: portal, data: encodeFunctionData({ abi, functionName: "approve", args: [vault, 10n] }) }), /spender-not-allowed/);
  assert.equal(f.calls.length, 0);
});

test("presale checks apply to the declaring Factory and preserve other authorized contributions", async () => {
  const otherFactory = "0x6666666666666666666666666666666666666666";
  const otherLauncher = "0x7777777777777777777777777777777777777777";
  const f = await presaleFixture([{
    id: "other-factory",
    chainId: 56,
    address: otherFactory,
    allow: [contributeQuote],
    resolvedContracts: [{
      id: "other-launcher",
      resolver: "function launcherAt(uint256 index) view returns (address)",
      allow: [contributeQuote],
    }],
  }]);
  const originalRead = f.runtime.readContract;
  f.runtime.readContract = (chain, request) => request.functionName === "launcherAt"
    ? Promise.resolve(otherLauncher)
    : originalRead(chain, request);

  const { abi, functionName, args } = f.contribution;
  const data = encodeFunctionData({ abi, functionName, args });
  await assert.rejects(
    f.sdk.sendTransaction({ to: portal, data }),
    /undeclared-presale-launcher/,
  );

  assert.equal(await f.sdk.writeContract({ address: otherFactory, abi, functionName, args }), hash);
  assert.equal(await f.sdk.sendTransaction({ to: otherFactory, data }), hash);
  const otherPool = await f.sdk.resolveContract("other-launcher", [0n]);
  assert.equal(await f.sdk.writeContract({ contract: otherPool, abi, functionName, args }), hash);
  await assert.rejects(
    f.sdk.approveQuote({ pool: otherPool, amount: 40n }),
    /undeclared-presale-launcher/,
  );

  assert.deepEqual(f.calls.filter(([action]) => action !== "simulate").map(([action, , request]) => [
    action, request.address ?? request.to,
  ]), [
    ["write", otherFactory],
    ["send", otherFactory],
    ["write", otherLauncher],
  ]);
  assert.deepEqual(f.checked, []);
});

test("presale writes fail closed on missing policy, a false approval, or a quote change during simulation", async () => {
  const f = await presaleFixture();
  const savedCallback = f.runtime.resolvePresaleApproval;
  delete f.runtime.resolvePresaleApproval;
  const approval = { pool: f.pool, amount: 40n };
  await assert.rejects(f.sdk.approveQuote(approval), /presale-approval-unavailable/);
  f.runtime.resolvePresaleApproval = savedCallback;
  f.setApprovalResult(false);
  await assert.rejects(f.sdk.approveQuote(approval), /presale-approval-simulation-failed/);
  f.runtime.simulateContract = async () => { f.setQuote(otherQuoteToken); return true; };
  await assert.rejects(f.sdk.approveQuote(approval), /presale-quote-changed/);
  f.setQuote(quoteToken);
  f.setAllowance(40n);
  await assert.rejects(f.sdk.writeContract(f.contribution), /presale-quote-changed/);
  assert.ok(f.calls.every(([operation]) => operation !== "write" && operation !== "send"));
});

const evidenceWrite = "function submitEvidence(uint256 id, bytes evidence, bytes checksum) payable";
const idOnlyWrite = "function submitEvidence(uint256 id)";
const evidenceAbi = parseAbi([evidenceWrite, idOnlyWrite]);
const evidenceArgs = [5n, `0x${"aB".repeat(16)}`, `0x${"cd".repeat(32)}`];

async function constrainedWriteFixture(valueWei = "42") {
  const f = fixture();
  const readRoot = f.manifest.walletContracts[0];
  const codeHash = keccak256(await f.runtime.getCode(56, portal));
  readRoot.codeHash = codeHash;
  const target = readRoot.resolvedContracts[0];
  target.codeHash = codeHash;
  target.maxValueWei = "100";
  target.allow.push(evidenceWrite, idOnlyWrite);
  target.writeConstraints = [{
    selector: toFunctionSelector(evidenceWrite),
    fixedBytes: [{ index: 1, length: 16 }, { index: 2, length: 32 }],
    ...(valueWei === null ? {} : { valueWei }),
  }];
  const sdk = createFlapChainSdk(f.runtime, {
    chainId: 56, manifest: f.manifest, writableChains: f.manifest.walletChains, i18n: {}, notify: {},
  });
  const contract = await sdk.resolveContract("rewards", [portal]);
  const call = { contract, abi: evidenceAbi, functionName: "submitEvidence", args: [...evidenceArgs], value: 42n };
  return { ...f, sdk, call };
}

test("constrained bytes use the declared selector and indexes on simulate and write", async () => {
  const { sdk, call, calls } = await constrainedWriteFixture();
  const simulation = await sdk.simulateContract(call);
  assert.equal(simulation.request.contract, call.contract);
  assert.equal(simulation.request.address, undefined);
  assert.equal(await sdk.writeContract(simulation.request), hash);
  assert.deepEqual(calls.map(([kind, chain, request]) => [kind, chain, request.address, request.args, request.value]), [
    ["simulate", 56, vault, evidenceArgs, 42n],
    ["simulate", 56, vault, evidenceArgs, 42n],
    ["write", 56, vault, evidenceArgs, 42n],
  ]);
  assert.equal(await sdk.writeContract({ ...call, args: [6n], value: undefined }), hash);
  assert.deepEqual(calls.at(-1)[2].args, [6n]);
  const unconstrained = await constrainedWriteFixture(null);
  await unconstrained.sdk.writeContract({ ...unconstrained.call, value: 99n });
  await assert.rejects(unconstrained.sdk.writeContract({ ...unconstrained.call, value: 101n }), /value-not-allowed/);
});

test("a returned simulation ABI cannot change the reviewed write policy", async () => {
  const { sdk, call, calls } = await constrainedWriteFixture();
  const { request } = await sdk.simulateContract(call);
  request.abi[0].name = "unreviewedWrite";
  await assert.rejects(sdk.writeContract({ ...request, functionName: "unreviewedWrite" }), /selector-not-allowed/);
  assert.equal(await sdk.writeContract(call), hash);
  assert.deepEqual(calls.filter(([kind]) => kind === "write").map(([, , sent]) => sent.functionName), ["submitEvidence"]);
});

test("wrong byte lengths, invalid hex and incorrect exact values never reach the wallet transport", async () => {
  const { sdk, call, calls } = await constrainedWriteFixture();
  for (const argument of [
    "0x",
    `0x${"ab".repeat(15)}`,
    `0x${"ab".repeat(17)}`,
    `0x${"ab".repeat(4097)}`,
    `0x${"ab".repeat(15)}0`,
    `0x${"ab".repeat(15)}zz`,
    new Uint8Array(16),
  ]) {
    const invalid = { ...call, args: [5n, argument, evidenceArgs[2]] };
    await assert.rejects(sdk.simulateContract(invalid), /app-wallet\//);
    await assert.rejects(sdk.writeContract(invalid), /app-wallet\//);
  }
  await assert.rejects(sdk.writeContract({ ...call, args: [5n, evidenceArgs[2], evidenceArgs[1]] }), /fixed-bytes-length-mismatch/);
  for (const value of [undefined, 41n, 43n]) {
    const invalid = { ...call, value };
    await assert.rejects(sdk.simulateContract(invalid), /exact-value-mismatch/);
    await assert.rejects(sdk.writeContract(invalid), /exact-value-mismatch/);
  }
  assert.deepEqual(calls, []);
});

test("constrained writes reject foreign handles, direct addresses and changed code pins", async () => {
  const { sdk, call, calls, runtime } = await constrainedWriteFixture();
  await assert.rejects(sdk.writeContract({ ...call, contract: { ...call.contract } }), /forged/);
  await assert.rejects(sdk.writeContract({ ...call, contract: undefined, address: vault }), /undeclared-target/);
  const data = encodeFunctionData({ abi: evidenceAbi, functionName: call.functionName, args: call.args });
  await assert.rejects(sdk.sendTransaction({ to: vault, data, value: call.value }), /undeclared-target/);
  const beforeSimulation = runtime.simulateContract;
  const readCode = runtime.getCode;
  for (const changedAddress of [portal, vault]) {
    runtime.getCode = readCode;
    runtime.simulateContract = async (chain, request) => {
      const result = await beforeSimulation(chain, request);
      runtime.getCode = async (chainId, target) => target === changedAddress ? "0x6001" : readCode(chainId, target);
      return result;
    };
    await assert.rejects(sdk.writeContract(call), /code-hash-changed/);
  }
  assert.deepEqual(calls.map(([kind]) => kind), ["simulate", "simulate"]);
});

test("a reviewed Mini App resolver can commit, reveal and verify a miner on BNB Testnet", async () => {
  const chainId = 97;
  const { runtime, calls, setAccount } = fixture({
    readContract: async (_chainId, { functionName, args }) => {
      assert.equal(functionName, "projectVault");
      assert.deepEqual(args, [hash]);
      return vault;
    },
  });
  runtime.chains.push({ id: chainId, name: "BNB Testnet" });
  setAccount({ address: owner, chainId, isConnected: true });
  const value = 2_000_000_000_000_000n;
  const resolver = "function projectVault(bytes32) view returns (address)";
  const reveal = "function revealTapeout(address,uint256[5],bytes,bytes32,bytes32) payable returns (uint256)";
  const allow = ["function commitTapeout(bytes32)", reveal, "function verifyMiner(uint256) returns (bool)"];
  const codeHash = keccak256(await runtime.getCode(chainId, portal));
  const sdk = createFlapChainSdk(runtime, {
    chainId, writableChains: [chainId], i18n: {}, notify: {},
    manifest: {
      appModel: "standalone", walletChains: [chainId], match: { bindings: [] },
      walletContracts: [{
        id: "factory", chainId, address: portal, codeHash, read: [resolver],
        resolvedContracts: [{
          id: "assembly", resolver,
          allow, codeHash, maxValueWei: String(value),
          writeConstraints: [{ selector: toFunctionSelector(reveal), fixedBytes: [{ index: 2, length: 35 }], valueWei: String(value) }],
        }],
      }],
    },
  });
  const contract = await sdk.resolveContract("assembly", [hash]);
  const assemblyAbi = parseAbi(allow);
  const operations = [
    { functionName: "commitTapeout", args: [hash] },
    { functionName: "revealTapeout", args: [owner, [1n, 2n, 3n, 4n, 5n], `0x${"ab".repeat(35)}`, hash, hash], value },
    { functionName: "verifyMiner", args: [1n] },
  ];
  for (const operation of operations) {
    const prepared = await sdk.simulateContract({ ...operation, contract, abi: assemblyAbi });
    const receipt = await sdk.waitForTx(await sdk.writeContract(prepared.request));
    assert.equal(receipt.status, "success");
  }
  assert.deepEqual(calls.filter(([kind]) => kind === "write").map(([, chain, call]) => [
    chain, call.address, call.functionName, call.value ?? 0n,
  ]), [
    [chainId, vault, "commitTapeout", 0n],
    [chainId, vault, "revealTapeout", value],
    [chainId, vault, "verifyMiner", 0n],
  ]);
});

test("reverted receipts and wallet rejections are preserved", async () => {
  const f = fixture({ waitForTx: async () => ({ hash, status: "reverted", blockNumber: 11n, logs: [] }), writeContract: async () => { throw new Error("User rejected"); } });
  assert.equal((await f.sdk.waitForTx(hash)).status, "reverted"); await assert.rejects(f.sdk.writeContract(request("claim")), /User rejected/);
});
test("fees and event lookbacks retain the existing bounds", async () => {
  const f = fixture(); await assert.rejects(f.sdk.writeContract({ ...request("claim"), gasPrice: 21n }), /safety limit/);
  await assert.rejects(f.sdk.writeContract({ ...request("claim"), gas: 15_000_001n }), /must not exceed 15000000/);
  assert.equal(f.calls.length, 0);
  const events = await f.sdk.getContractEvents({ address: portal, abi: [], eventName: "Transfer", fromBlock: 0n, toBlock: 2500n }).catch(() => []); assert.deepEqual(events, []);
  const eventAbi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 amount)"]);
  assert.deepEqual(await f.sdk.getContractEvents({ address: portal, abi: eventAbi, eventName: "Transfer", fromBlock: 0n, toBlock: 2500n }), [0n, 1001n, 2002n]);
  await assert.rejects(f.sdk.getContractEvents({ address: portal, abi: eventAbi, eventName: "Transfer", fromBlock: 0n, toBlock: 20001n }), /must not exceed/);
});


test("chain SDK shares bounded IPFS reads and snapshots the reviewed FSI declaration", async () => {
  const f = fixture();
  const calls = [];
  const reader = async (cid, path) => { calls.push([cid, path]); return "plain text"; };
  const sdk = createFlapChainSdk(f.runtime, { chainId: 56, writableChains: [], i18n: {}, notify: {}, manifest: {...f.manifest, endpoints:["https://bsc-debug.butterfly.army/fsi/v1"]}, readIpfsText:reader });
  assert.equal(await sdk.readIpfsText("cid", "post.txt"), "plain text");
  assert.deepEqual(calls, [["cid", "post.txt"]]);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => { calls.push([url,options]); return new Response('{"items":[]}', {headers:{"content-type":"application/json"}}); };
    await assert.rejects(f.sdk.readFsi("posts"), /requires/);
    assert.deepEqual(await sdk.readFsi("posts", {wallet:owner}), {items:[]});
    assert.equal(calls[1][0], `https://bsc-debug.butterfly.army/fsi/v1/posts?wallet=${owner}`);
    assert.equal(calls[1][1].credentials, "omit");
    assert.equal(calls[1][1].redirect, "error");
    await assert.rejects(sdk.readFsi("../versions"), /traversal/);
    assert.equal(calls.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("chain SDK selects only declared FSI deployments independently of chain ID", async () => {
  const legacy = "https://bsc-debug.butterfly.army/fsi/v1";
  const current = "https://fsi.taxed.fun/fsi/v1";
  const testnet = "https://bsc-testnet-debug.butterfly.army/fsi/v1";
  const f = fixture({ chains: [{ id: 56, name: "BNB" }, { id: 97, name: "BNB Testnet" }] });
  const calls = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      calls.push([url, options]);
      return Response.json({ items: [] });
    };
    const cases = [
      [legacy, legacy], [current, current], [testnet, testnet],
      [[legacy, current], current], [[current, legacy], current],
      [[testnet, legacy], legacy], [[legacy, testnet], legacy],
      [[testnet, current], current], [[current, testnet], current],
      [[testnet, legacy, current], current],
    ];
    for (const chainId of [56, 97]) {
      for (const [endpoints, expectedPrefix] of cases) {
        const sdk = createFlapChainSdk(f.runtime, { chainId, writableChains: [], i18n: {}, notify: {}, manifest: { ...f.manifest, endpoints } });
        assert.deepEqual(await sdk.readFsi("by-key/account", { cursor: "a/b+c==" }), { items: [] });
        const [url, options] = calls.at(-1);
        assert.equal(new URL(url).origin + new URL(url).pathname, expectedPrefix + "/by-key/account");
        assert.equal(new URL(url).searchParams.get("cursor"), "a/b+c==");
        assert.deepEqual(options, { method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store" });
        await assert.rejects(sdk.readFsi("../versions"), /traversal/);
      }
    }
    assert.equal(calls.length, cases.length * 2, "chain selection and invalid paths must not issue extra FSI requests");
  } finally { globalThis.fetch = originalFetch; }
});
