import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidTransactionReceiptError,
  TransactionReceiptPollingTimeoutError,
  pollTransactionReceipt,
} from "./transactionReceipt.ts";

const HASH = `0x${"ab".repeat(32)}`;
const OTHER_HASH = `0x${"cd".repeat(32)}`;
const OPTIONS = { timeout: 100, pollingInterval: 5, requestTimeout: 20 };
const receipt = (overrides = {}) => ({ transactionHash: HASH, status: "success", blockNumber: 123n, logs: [], ...overrides });
const flush = async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); };
const clock = (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  return async (ms) => { t.mock.timers.tick(ms); await flush(); };
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("returns the complete immediate receipt and clears all polling timers", async (t) => {
  const tick = clock(t);
  const expected = receipt({ logs: [{ data: "0x01", topics: [] }], gasUsed: 21_000n });
  let calls = 0;
  const actual = await pollTransactionReceipt({ async getTransactionReceipt({ hash }) { assert.equal(hash, HASH); calls += 1; return expected; } }, HASH, OPTIONS);
  assert.strictEqual(actual, expected);
  await tick(1000);
  assert.equal(calls, 1);
});

test("pending null and receipt-not-found retry on the same client until inclusion", async (t) => {
  const tick = clock(t);
  let calls = 0;
  const expected = receipt();
  const pending = pollTransactionReceipt({ async getTransactionReceipt() {
    calls += 1;
    if (calls === 1) return null;
    if (calls === 2) throw Object.assign(new Error("not found"), { name: "TransactionReceiptNotFoundError" });
    return expected;
  } }, HASH, OPTIONS);
  await flush();
  await tick(5);
  await tick(5);
  assert.strictEqual(await pending, expected);
  assert.equal(calls, 3);
});

test("returns reverted status unchanged instead of reporting success", async (t) => {
  clock(t);
  const expected = receipt({ status: "reverted" });
  assert.strictEqual(await pollTransactionReceipt({ async getTransactionReceipt() { return expected; } }, HASH, OPTIONS), expected);
});

test("retries transient network, HTTP 429, and HTTP 404 errors within the deadline", async (t) => {
  const tick = clock(t);
  let calls = 0;
  const errors = [new TypeError("fetch failed"), Object.assign(new Error("rate limited"), { status: 429 }), Object.assign(new Error("not found endpoint"), { status: 404 })];
  const pending = pollTransactionReceipt({ async getTransactionReceipt() {
    const error = errors[calls++];
    if (error) throw error;
    return receipt();
  } }, HASH, OPTIONS);
  await flush();
  for (let index = 0; index < 3; index += 1) await tick(5);
  assert.equal((await pending).status, "success");
  assert.equal(calls, 4);
});

test("permanent invalid JSON-RPC parameters reject immediately, including wrapped errors", async (t) => {
  const tick = clock(t);
  let calls = 0;
  const error = Object.assign(new Error("request failed"), { cause: { code: -32602 } });
  await assert.rejects(pollTransactionReceipt({ async getTransactionReceipt() { calls += 1; throw error; } }, HASH, OPTIONS), (actual) => actual === error);
  await tick(1000);
  assert.equal(calls, 1);
});

for (const [name, overrides] of [
  ["mismatched hash", { transactionHash: OTHER_HASH }],
  ["malformed hash", { transactionHash: "0x1234" }],
  ["unknown status", { status: "pending" }],
  ["missing status", { status: undefined }],
  ["numeric block number", { blockNumber: 123 }],
  ["negative block number", { blockNumber: -1n }],
  ["invalid logs", { logs: {} }],
]) {
  test(`rejects ${name} without scheduling another request`, async (t) => {
    const tick = clock(t);
    let calls = 0;
    await assert.rejects(pollTransactionReceipt({ async getTransactionReceipt() { calls += 1; return receipt(overrides); } }, HASH, OPTIONS), InvalidTransactionReceiptError);
    await tick(1000);
    assert.equal(calls, 1);
  });
}

test("undefined RPC result is invalid rather than a pending receipt", async (t) => {
  clock(t);
  await assert.rejects(pollTransactionReceipt({ async getTransactionReceipt() { return undefined; } }, HASH, OPTIONS), InvalidTransactionReceiptError);
});

test("validates input hashes and timing options before making RPC calls", async (t) => {
  clock(t);
  let calls = 0;
  const client = { async getTransactionReceipt() { calls += 1; return receipt(); } };
  for (const hash of ["0x1234", `0x${"zz".repeat(32)}`, "ab".repeat(32)]) await assert.rejects(pollTransactionReceipt(client, hash, OPTIONS), /32-byte/);
  for (const options of [{ timeout: 0 }, { requestTimeout: Infinity }, { pollingInterval: -1 }, { timeout: 2_147_483_648 }]) await assert.rejects(pollTransactionReceipt(client, HASH, options), /positive timer/);
  assert.equal(calls, 0);
});

test("bounds an RPC that never settles and retries only after its request deadline", async (t) => {
  const tick = clock(t);
  let calls = 0;
  const pending = pollTransactionReceipt({ getTransactionReceipt() { calls += 1; return new Promise(() => {}); } }, HASH, OPTIONS);
  const rejected = assert.rejects(pending, (error) => error instanceof TransactionReceiptPollingTimeoutError && error.hash === HASH && error.lastError?.name === "TransactionReceiptRequestTimeoutError");
  await tick(19);
  assert.equal(calls, 1);
  await tick(1);
  assert.equal(calls, 1);
  await tick(5);
  assert.equal(calls, 2);
  await tick(75);
  await rejected;
  const callsAtTimeout = calls;
  await tick(1000);
  assert.equal(calls, callsAtTimeout);
});

test("the independent global deadline bounds a request longer than the total timeout", async (t) => {
  const tick = clock(t);
  let calls = 0;
  const pending = pollTransactionReceipt({ getTransactionReceipt() { calls += 1; return new Promise(() => {}); } }, HASH, { timeout: 10, pollingInterval: 5, requestTimeout: 80 });
  const rejected = assert.rejects(pending, TransactionReceiptPollingTimeoutError);
  await tick(10);
  await rejected;
  await tick(1000);
  assert.equal(calls, 1);
});

test("timeout preserves the last RPC error without including its credentials in the message", async (t) => {
  const tick = clock(t);
  const secret = new Error("https://user:password@rpc.invalid/?apiKey=secret-token");
  const pending = pollTransactionReceipt({ async getTransactionReceipt() { throw secret; } }, HASH, { ...OPTIONS, timeout: 10 });
  const rejected = assert.rejects(pending, (error) => {
    assert.strictEqual(error.lastError, secret);
    assert.equal(error.hash, HASH);
    assert.match(error.message, /result is unknown/);
    assert.doesNotMatch(error.message, /password|secret-token|rpc\.invalid/);
    return true;
  });
  await flush();
  await tick(10);
  await rejected;
});

test("a stale timed-out RPC response cannot resolve a later attempt or start more polling", async (t) => {
  const tick = clock(t);
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const pending = pollTransactionReceipt({ getTransactionReceipt() { calls += 1; return calls === 1 ? first.promise : second.promise; } }, HASH, OPTIONS);
  await tick(20);
  await tick(5);
  assert.equal(calls, 2);
  first.resolve(receipt({ status: "reverted" }));
  await flush();
  second.resolve(receipt());
  assert.equal((await pending).status, "success");
  await tick(1000);
  assert.equal(calls, 2);
});

test("late rejection after the global deadline is consumed and does not restart polling", async (t) => {
  const tick = clock(t);
  const late = deferred();
  let calls = 0;
  const pending = pollTransactionReceipt({ getTransactionReceipt() { calls += 1; return late.promise; } }, HASH, { timeout: 10, pollingInterval: 5, requestTimeout: 80 });
  const rejected = assert.rejects(pending, TransactionReceiptPollingTimeoutError);
  await tick(10);
  await rejected;
  late.reject(new Error("late RPC rejection"));
  await flush();
  await tick(1000);
  assert.equal(calls, 1);
});

test("concurrent clients and hashes keep independent polling state", async (t) => {
  const tick = clock(t);
  let callsA = 0;
  let callsB = 0;
  const a = pollTransactionReceipt({ async getTransactionReceipt({ hash }) { assert.equal(hash, HASH); callsA += 1; return callsA === 1 ? null : receipt(); } }, HASH, OPTIONS);
  const b = pollTransactionReceipt({ async getTransactionReceipt({ hash }) { assert.equal(hash, OTHER_HASH); callsB += 1; return receipt({ transactionHash: OTHER_HASH, status: "reverted" }); } }, OTHER_HASH, OPTIONS);
  assert.equal((await b).status, "reverted");
  await flush();
  await tick(5);
  assert.equal((await a).status, "success");
  await tick(1000);
  assert.equal(callsA, 2);
  assert.equal(callsB, 1);
});
