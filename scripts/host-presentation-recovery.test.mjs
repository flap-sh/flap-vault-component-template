import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
const dir = await mkdtemp(path.join(os.tmpdir(), "flap-host-presentation-recovery-"));
const entry = path.join(dir, "presentation.mjs");
await build({ absWorkingDir: process.cwd(), entryPoints: ["src/sdk/hostPresentation.ts"], outfile: entry, bundle: true, platform: "node", format: "esm", logLevel: "silent" });
const { loadFlapHostTokenPresentation: load, loadFlapHostTokenPresentationBatch: batch, createLocalHostPresentationFetcher: local } = await import(pathToFileURL(entry).href);
after(() => rm(dir, { recursive: true, force: true }));
const token = "0x286184b2660a2822671a33f24c4517f593947777";
const data = { data: { [token]: { address: token, symbol: "TOKEN", name: "Read-only metadata" } } };
const ok = () => Response.json(data);

test("only the public read-only metadata query retries transient network/5xx failures and keeps its request", async () => {
  const calls = [];
  const result = await load({ chainId: 56, tokenAddress: token, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) throw new TypeError("fetch failed", { cause: { code: "UND_ERR_SOCKET" } });
    if (calls.length === 2) return new Response("temporarily unavailable", { status: 503 });
    return ok();
  } });
  assert.equal(result.tokenSymbol, "TOKEN");
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.url, "https://flap.sh/api/tax-dashboard/metadata");
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.cache, "no-store");
    assert.deepEqual(JSON.parse(call.init.body), { chain: "bnb", addresses: [token] });
    assert.ok(call.init.signal instanceof AbortSignal);
  }
});

test("batch metadata uses the same bounded 429 recovery", async () => {
  let calls = 0;
  const result = await batch({ chainId: 56, tokenAddresses: [token], fetchImpl: async () => {
    if (++calls === 1) return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
    return ok();
  } });
  assert.equal(calls, 2);
  assert.equal(Object.values(result)[0].tokenName, "Read-only metadata");
});

test("HTTP 400/401/403, malformed JSON and invalid schemas fail once without empty success", async () => {
  for (const response of [
    () => new Response("bad request", { status: 400 }),
    () => new Response("unauthorized", { status: 401 }),
    () => new Response("forbidden", { status: 403 }),
    () => new Response("{broken", { status: 200 }),
    () => Response.json({ error: "business validation failed" }),
    () => Response.json({ data: [] }),
  ]) {
    let calls = 0;
    await assert.rejects(load({ chainId: 56, tokenAddress: token, fetchImpl: async () => { calls++; return response(); } }));
    assert.equal(calls, 1);
  }
});

test("transient failures stop after three attempts and preserve the failure", async () => {
  let calls = 0;
  await assert.rejects(load({ chainId: 56, tokenAddress: token, fetchImpl: async () => { calls++; return new Response("unavailable", { status: 502 }); } }), /HTTP 502/);
  assert.equal(calls, 3);
});

test("TLS policy failures are not retried as temporary transport failures", async () => {
  let calls = 0;
  await assert.rejects(load({ chainId: 56, tokenAddress: token, fetchImpl: async () => { calls++; throw new TypeError("fetch failed", { cause: { code: "CERT_HAS_EXPIRED" } }); } }));
  assert.equal(calls, 1);
});

test("the total deadline aborts even an injected fetch that ignores its signal", async () => {
  let calls = 0, signal;
  const started = Date.now();
  await assert.rejects(load({ chainId: 56, tokenAddress: token, timeoutMs: 30, fetchImpl: async (_url, init) => { calls++; signal = init.signal; return new Promise(() => {}); } }), { name: "TimeoutError" });
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - started < 1000);
});

test("caller cancellation stops the request and retry backoff immediately", async () => {
  for (const mode of ["request", "backoff"]) {
    const controller = new AbortController(), reason = new Error("caller cancelled");
    let calls = 0;
    const timer = setTimeout(() => controller.abort(reason), 20);
    try {
      await assert.rejects(load({ chainId: 56, tokenAddress: token, signal: controller.signal, fetchImpl: async () => { calls++; return mode === "request" ? new Promise(() => {}) : new Response("unavailable", { status: 503 }); } }), (error) => error === reason);
      assert.equal(calls, 1);
    } finally { clearTimeout(timer); }
  }
});

test("valid missing metadata remains null; local proxy failures are neither retried nor disguised", async () => {
  assert.equal(await load({ chainId: 56, tokenAddress: token, fetchImpl: async () => Response.json({ data: {} }) }), null);
  const controller = new AbortController();
  let calls = 0;
  const fetcher = local({ signal: controller.signal, fetchImpl: async (_url, init) => { calls++; assert.equal(init.signal, controller.signal); return new Response("forbidden", { status: 403 }); } });
  await assert.rejects(fetcher({ chainId: 56, tokenAddress: token }), /HTTP 403/);
  assert.equal(calls, 1);
});
