import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
const compiled = await build({ entryPoints: ["src/sdk/ipfsText.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { createIpfsTextReader } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);
const cid = "bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq";
const text = (value, headers = {}) => new Response(value, { headers: { "content-type": "text/plain; charset=utf-8", ...headers } });

test("reads dynamic CID text and JSON as UTF-8 with fixed safe request options", async () => {
  const requests = [];
  const read = createIpfsTextReader({ fetchImpl: async (url, options) => { requests.push({ url, options }); return text('{"post":"你好 🌍"}'); } });
  assert.deepEqual(JSON.parse(await read(cid, "posts/1.json")), { post: "你好 🌍" });
  assert.equal(requests[0].url, `https://flap.mypinata.cloud/ipfs/${cid}/posts/1.json`);
  const { signal, ...options } = requests[0].options;
  assert(signal instanceof AbortSignal);
  assert.deepEqual(options, { method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "force-cache" });
});

test("rejects non-CIDs and unsafe paths before network access", async () => {
  let calls = 0;
  const read = createIpfsTextReader({ fetchImpl: async () => { calls++; return text("unexpected"); } });
  for (const value of [null, undefined, {}, "", `ipfs://${cid}`, `https://example.com/ipfs/${cid}`, `${cid}/file`, `${cid}?x=1`, "b" + "a".repeat(129)]) await assert.rejects(read(value), /bare CID/);
  for (const path of [null, {}, "", "../file", "a/../b", "a//b", "/a", "a/", "%2e%2e/file", "a?x=1", "a#f", "a\\b"]) await assert.rejects(read(cid, path), /bare CID/);
  assert.equal(calls, 0);
});

test("rejects HTML, binary controls, invalid UTF-8 and unsupported charsets", async () => {
  for (const response of [text("<script>bad</script>", { "content-type": "text/html" }), text("\u0000binary"), text(new Uint8Array([0xff])), text("abc", { "content-type": "text/plain; charset=gbk" })]) {
    const read = createIpfsTextReader({ fetchImpl: async () => response });
    await assert.rejects(read(cid));
  }
});

test("enforces declared and streamed 256 KiB limits without retrying rejected content", async () => {
  for (const response of [text("small", { "content-length": String(256 * 1024 + 1) }), text("x".repeat(256 * 1024 + 1))]) {
    let calls = 0;
    await assert.rejects(createIpfsTextReader({ fetchImpl: async () => { calls++; return response; } })(cid), /256 KiB/);
    assert.equal(calls, 1);
  }
});

test("falls back only across platform gateways and bounds hung requests", async () => {
  const urls = [];
  const read = createIpfsTextReader({ fetchImpl: async (url) => { urls.push(url); return urls.length === 1 ? new Response(null, { status: 503 }) : text("fallback"); } });
  assert.equal(await read(cid), "fallback");
  assert.deepEqual(urls, [`https://flap.mypinata.cloud/ipfs/${cid}`, `https://magenta-naval-penguin-822.mypinata.cloud/ipfs/${cid}`]);
  const hung = createIpfsTextReader({ timeoutMs: 10, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) });
  await assert.rejects(hung(cid), /timed out/);
});

test("deduplicates in-flight reads, caches immutable content and retries failures", async () => {
  let calls = 0;
  const read = createIpfsTextReader({ fetchImpl: async () => { calls++; return text("post"); } });
  assert.deepEqual(await Promise.all([read(cid), read(cid)]), ["post", "post"]);
  await read(cid);
  assert.equal(calls, 1);
  let fail = true;
  const retry = createIpfsTextReader({ fetchImpl: async () => { if (fail) throw new Error("offline"); return text("back"); } });
  await assert.rejects(retry(cid), /offline/);
  fail = false;
  assert.equal(await retry(cid), "back");
});

test("deadline also cancels stalled response bodies", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-type": "text/plain" } });
  const read = createIpfsTextReader({ timeoutMs: 10, fetchImpl: async () => response });
  await assert.rejects(read(cid), /timed out/);
  assert.equal(cancelled, true);
});

test("limits concurrency to six and rejects an unbounded queue", async () => {
  const releases = [];
  const read = createIpfsTextReader({ fetchImpl: () => new Promise((resolve) => releases.push(() => resolve(text("post")))) });
  const reads = Array.from({ length: 128 }, (_, i) => read(cid, `${i}.txt`));
  assert.equal(releases.length, 6);
  await assert.rejects(read(cid, "overflow.txt"), /paginate/);
  let released = 0;
  while (released < 128) {
    const batch = releases.splice(0);
    batch.forEach((release) => { release(); released++; });
    await new Promise((resolve) => setImmediate(resolve));
    assert(releases.length <= 6);
  }
  await Promise.all(reads);
});
