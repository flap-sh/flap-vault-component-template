import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { keccak256, parseAbi } from "viem";
const bundled = buildSync({ entryPoints: ["src/sdk/flapChainRuntime.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { createFlapChainSdk } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const owner = "0x1111111111111111111111111111111111111111";
const root = "0x2222222222222222222222222222222222222222";
const target = "0x3333333333333333333333333333333333333333";
const other = "0x4444444444444444444444444444444444444444";
const code = "0x6000";
const pin = keccak256(code);
const resolver = "function vaultOf(address token) view returns (address)";
const pendingAbi = parseAbi(["function pending(address wallet) view returns (uint256)"]);
const claimAbi = parseAbi(["function claim()"]);
const pending = handle => ({ contract: handle, abi: pendingAbi, functionName: "pending", args: [owner] });
function fixture({ snapshot = true } = {}) {
  const calls = [];
  const state = { block: 100n, resolved: target, code, snapshots: 0, codeFailures: 0, resolverFailures: 0, active: true };
  const manifest = { appModel: "standalone", walletChains: [56], walletContracts: [{ id: "root", chainId: 56, address: root, codeHash: pin,
    read: [resolver], resolvedContracts: [
      { id: "good", resolver, codeHash: pin, read: ["function pending(address wallet) view returns (uint256)"], allow: ["function claim()"] },
      { id: "bad-pin", resolver, codeHash: keccak256("0x6001"), read: ["function pending(address wallet) view returns (uint256)"] },
    ] }], match: { bindings: [] } };
  const getCode = async (block, address) => {
    calls.push(["code", block, address]);
    if (state.codeFailures > 0) { state.codeFailures--; return "0x"; }
    return state.code;
  };
  const readContract = async (block, request) => {
    calls.push(["read", block, request.address, request.functionName, request.args]);
    if (request.functionName === "vaultOf") {
      if (state.resolverFailures > 0) { state.resolverFailures--; throw new Error("resolver unavailable"); }
      return state.resolved;
    }
    return 8n;
  };
  const runtime = {
    chains: [{ id: 56, name: "BSC" }], assertActive() { if (!state.active) throw new Error("host expired"); },
    getAccount: () => ({ address: owner, chainId: 56, isConnected: true }), connect() {}, disconnect() {}, switchChain: async () => {},
    getCode: (_chain, address) => getCode("latest", address), readContract: (_chain, request) => readContract("latest", request),
    getGasPrice: async () => 10n, simulateContract: async (_chain, request) => { calls.push(["simulate", request.address]); return 1n; },
    writeContract: async (_chain, request) => { calls.push(["write", request.address]); return `0x${"a".repeat(64)}`; },
    ...(snapshot ? { createDisplayReadSnapshot: async chainId => {
      assert.equal(chainId, 56); state.snapshots++; const block = state.block;
      return { getCode: address => getCode(block, address), readContract: request => readContract(block, request) };
    } } : {}),
  };
  const sdk = createFlapChainSdk(runtime, { chainId: 56, manifest, writableChains: [56], i18n: {}, notify: {} });
  return { calls, state, sdk, runtime };
}

test("display batch shares same-block code/resolver requests but rereads business fields", async () => {
  const f = fixture();
  await f.sdk.withDisplayReadBatch(async sdk => {
    assert.deepEqual(Object.keys(sdk).sort(), ["context", "readContract", "resolveContract"]);
    const handles = await Promise.all([sdk.resolveContract("good", [owner]), sdk.resolveContract("good", [owner])]);
    await Promise.all(handles.map(handle => sdk.readContract(pending(handle))));
    f.state.block++;
    assert.equal(await sdk.readContract(pending(handles[0])), 8n);
  });
  assert.equal(f.state.snapshots, 1);
  assert.deepEqual(f.calls.filter(call => call[0] === "code").map(call => call[2]).sort(), [root, target].sort());
  assert.equal(f.calls.filter(call => call[3] === "vaultOf").length, 1);
  assert.equal(f.calls.filter(call => call[3] === "pending").length, 3);
  assert.ok(f.calls.every(call => call[1] === 100n));
});

test("genuine handles cross batches while each new scope rereads its own block", async () => {
  const f = fixture(); let handle;
  await f.sdk.withDisplayReadBatch(async sdk => { handle = await sdk.resolveContract("good", [owner]); });
  f.state.block = 101n; f.calls.length = 0;
  await f.sdk.withDisplayReadBatch(async sdk => { assert.equal(await sdk.readContract(pending(handle)), 8n); });
  assert.equal(f.state.snapshots, 2);
  assert.deepEqual(f.calls.map(call => call[1]), [101n, 101n, 101n, 101n]);
  f.state.resolved = other;
  await assert.rejects(f.sdk.withDisplayReadBatch(sdk => sdk.readContract(pending(handle))), /resolved-target-changed/);
});

test("resolver cache key includes encoded args, and every policy still checks its own hash", async () => {
  const f = fixture();
  await f.sdk.withDisplayReadBatch(async sdk => {
    await sdk.resolveContract("good", [owner]);
    await assert.rejects(sdk.resolveContract("bad-pin", [owner]), /code-hash-changed/);
    await sdk.resolveContract("good", [owner]);
    await sdk.resolveContract("good", [other]);
  });
  assert.equal(f.calls.filter(call => call[0] === "code").length, 2, "policy mismatch does not invalidate successful raw bytecode");
  assert.equal(f.calls.filter(call => call[3] === "vaultOf").length, 2);
});

test("failed code and resolver reads are evicted so the same scope can retry", async () => {
  for (const kind of ["codeFailures", "resolverFailures"]) {
    const f = fixture(); f.state[kind] = 1;
    await f.sdk.withDisplayReadBatch(async sdk => {
      await assert.rejects(sdk.resolveContract("good", [owner]), kind === "codeFailures" ? /missing-code/ : /resolver unavailable/);
      await sdk.resolveContract("good", [owner]);
    });
    assert.equal(f.state.snapshots, 1);
    assert.equal(f.calls.filter(call => kind === "codeFailures" ? call[0] === "code" && call[2] === root : call[3] === "vaultOf").length, 2);
  }
});

test("closed or expired display facades cannot start or finish reads", async () => {
  const f = fixture(); let escaped;
  await f.sdk.withDisplayReadBatch(async sdk => { escaped = sdk; });
  assert.equal(f.state.snapshots, 0, "snapshot is lazy");
  await assert.rejects(escaped.resolveContract("good", [owner]), /display-batch-closed/);
  f.state.active = false;
  await assert.rejects(f.sdk.withDisplayReadBatch(sdk => sdk.resolveContract("good", [owner])), /host expired/);
  assert.equal(f.state.snapshots, 0);
});

test("overlapping batches have independent caches", async () => {
  const f = fixture();
  await Promise.all([1, 2].map(() => f.sdk.withDisplayReadBatch(sdk => sdk.resolveContract("good", [owner]))));
  assert.equal(f.state.snapshots, 2);
  assert.equal(f.calls.filter(call => call[0] === "code").length, 4);
  assert.equal(f.calls.filter(call => call[3] === "vaultOf").length, 2);
});

test("display policy rejects forged handles, undeclared methods, and target overrides", async () => {
  const f = fixture();
  await f.sdk.withDisplayReadBatch(async sdk => {
    const handle = await sdk.resolveContract("good", [owner]);
    await assert.rejects(sdk.readContract(pending({ ...handle })), /forged/);
    await assert.rejects(sdk.readContract({ ...pending(handle), address: root }), /handle-with-address/);
    await assert.rejects(sdk.readContract({ contract: handle, abi: claimAbi, functionName: "claim" }), /selector-not-allowed/);
  });
  assert.equal(f.calls.filter(call => call[3] === "pending").length, 0);
});

test("older hosts keep fresh validation with no cross-read cache", async () => {
  const f = fixture({ snapshot: false });
  await f.sdk.withDisplayReadBatch(async sdk => {
    const handle = await sdk.resolveContract("good", [owner]);
    await sdk.readContract(pending(handle));
    await sdk.readContract(pending(handle));
  });
  assert.equal(f.state.snapshots, 0);
  assert.equal(f.calls.filter(call => call[0] === "code").length, 6);
  assert.equal(f.calls.filter(call => call[3] === "vaultOf").length, 3);
  assert.ok(f.calls.every(call => call[1] === "latest"));
});

test("fresh reads, simulation and writes bypass display caches", async () => {
  const f = fixture(); let handle;
  await f.sdk.withDisplayReadBatch(async sdk => { handle = await sdk.resolveContract("good", [owner]); });
  f.calls.length = 0;
  await f.sdk.readContract(pending(handle));
  const call = { contract: handle, abi: claimAbi, functionName: "claim" };
  await f.sdk.simulateContract(call);
  await f.sdk.writeContract(call);
  assert.equal(f.calls.filter(call => call[0] === "code").length, 8);
  assert.equal(f.calls.filter(call => call[3] === "vaultOf").length, 4);
  assert.ok(f.calls.filter(call => call[0] === "code" || call[0] === "read").every(call => call[1] === "latest"));
  f.state.code = "0x6001";
  await assert.rejects(f.sdk.writeContract(call), /code-hash-changed/);
  assert.equal(f.calls.filter(call => call[0] === "write").length, 1);
});
