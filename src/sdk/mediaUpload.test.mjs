import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
async function compile(file) {
  const compiled = await build({ entryPoints: [new URL(file, import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);
}
const { createLocalMediaUploader, MAX_IMAGE_UPLOAD_BYTES, MAX_TEXT_UPLOAD_BYTES } = await compile("./mediaUpload.ts");
const { createRuntimeUploadHandler } = await compile("./mediaUploadServer.ts");
const CID = "bafkreigo6g3mkveu5w3l7ud56qr4oq3sa62hawcdmybdhbi5agurqwm5ye";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const image = () => new Blob([PNG], { type: "image/png" });
function request(file = image(), kind = "image", extra = {}) {
  const body = new FormData();
  body.set("kind", kind);
  body.set("chainId", "56");
  body.set("file", file, "untrusted-name");
  return new Request("https://flap.sh/api/runtime/upload", { method: "POST", body, ...extra });
}
function handler(fetchImpl = async () => Response.json({ IpfsHash: CID }), options = {}) {
  return createRuntimeUploadHandler({ pinataJwt: "server-only-test-key", fetchImpl, ...options });
}

test("image SDK roundtrip pins the original file once and returns its CID and Flap gateway", async () => {
  let calls = 0;
  const post = handler(async (url, init) => {
    calls++;
    assert.equal(url, "https://api.pinata.cloud/pinning/pinFileToIPFS");
    assert.equal(init.headers.Authorization, "Bearer server-only-test-key");
    assert.deepEqual(JSON.parse(init.body.get("pinataOptions")), { cidVersion: 1 });
    const file = init.body.get("file");
    assert.equal(file.name, "image.png");
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), PNG);
    assert.equal(init.body.has("meta"), false);
    return Response.json({ IpfsHash: CID });
  });
  const upload = createLocalMediaUploader({ fetchImpl: async (url, init) => {
    assert.equal(url, "/api/runtime/upload");
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.headers, undefined);
    return post(new Request(`https://flap.sh${url}`, init));
  } });
  assert.deepEqual(await upload({ kind: "image", file: image(), chainId: 56 }), {
    cid: CID, uri: `ipfs://${CID}`, gatewayUrl: `https://flap.mypinata.cloud/ipfs/${CID}`,
  });
  assert.equal(calls, 1);
});

test("text preserves UTF-8 content and resolves the testnet gateway", async () => {
  const text = "你好 Flap\nsecond line";
  const post = handler(async (_url, init) => {
    assert.equal(await init.body.get("file").text(), text);
    assert.equal(init.body.get("file").name, "text.txt");
    return Response.json({ IpfsHash: CID });
  });
  const upload = createLocalMediaUploader({ fetchImpl: (url, init) => post(new Request(`https://flap.sh${url}`, init)) });
  const result = await upload({ kind: "text", file: new Blob([text], { type: "text/plain;charset=utf-8" }), chainId: 97 });
  assert.equal(result.cid, CID);
  assert.equal(result.gatewayUrl, `https://magenta-naval-penguin-822.mypinata.cloud/ipfs/${CID}`);
});

test("client rejects empty, oversized, and unsupported uploads before network access", async () => {
  const upload = createLocalMediaUploader({ fetchImpl: () => { throw new Error("must not fetch"); } });
  for (const [kind, file, code] of [
    ["image", new Blob([], { type: "image/png" }), "UPLOAD_EMPTY"],
    ["image", new Blob([new Uint8Array(MAX_IMAGE_UPLOAD_BYTES + 1)], { type: "image/png" }), "UPLOAD_TOO_LARGE"],
    ["text", new Blob(["中".repeat(MAX_TEXT_UPLOAD_BYTES / 3 + 1)], { type: "text/plain" }), "UPLOAD_TOO_LARGE"],
    ["image", new Blob(["<svg/>"], { type: "image/svg+xml" }), "UPLOAD_UNSUPPORTED_TYPE"],
  ]) await assert.rejects(upload({ kind, file, chainId: 56 }), { code });
});

test("server independently enforces file limits, image signatures and UTF-8", async () => {
  const post = handler(() => { throw new Error("must not pin"); });
  for (const [kind, file, status, code] of [
    ["image", new Blob(["<script/>"], { type: "image/png" }), 415, "UPLOAD_INVALID_IMAGE"],
    ["image", new Blob([new Uint8Array(MAX_IMAGE_UPLOAD_BYTES + 1)], { type: "image/png" }), 413, "UPLOAD_TOO_LARGE"],
    ["text", new Blob([new Uint8Array(MAX_TEXT_UPLOAD_BYTES + 1)], { type: "text/plain" }), 413, "UPLOAD_TOO_LARGE"],
    ["text", new Blob([Uint8Array.of(255)], { type: "text/plain" }), 400, "UPLOAD_INVALID_TEXT"],
  ]) {
    const response = await post(request(file, kind));
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
  }
});

test("all documented image signatures are accepted", async () => {
  for (const [type, content] of [
    ["image/jpeg", Uint8Array.of(255, 216, 255, 224)],
    ["image/gif", "GIF89a"],
    ["image/webp", "RIFF0000WEBP"],
  ]) assert.equal((await handler()(request(new Blob([content], { type })))).status, 200);
});

test("request stream is bounded even when content-length is absent or dishonest", async () => {
  for (const headers of [{}, { "content-length": "1" }, { "content-length": String(5 * 1024 * 1024) }]) {
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024)); controller.close(); } });
    const response = await handler()(new Request("https://flap.sh/api/runtime/upload", {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=test", ...headers }, body, duplex: "half",
    }));
    assert.equal(response.status, 413);
  }
});

test("rejects malformed multipart, duplicate files and invalid chains", async () => {
  const invalid = new Request("https://flap.sh/api/runtime/upload", { method: "POST", body: "bad", headers: { "content-type": "multipart/form-data; boundary=invalid" } });
  assert.equal((await handler()(invalid)).status, 400);
  for (const change of [(form) => form.append("file", image()), (form) => form.set("chainId", "NaN"), (form) => form.set("endpoint", "https://evil.example")]) {
    const form = await request().formData();
    change(form);
    assert.equal((await handler()(new Request("https://flap.sh/api/runtime/upload", { method: "POST", body: form }))).status, 400);
  }
});

test("missing server configuration and foreign origins never pin", async () => {
  assert.equal((await createRuntimeUploadHandler({})(request())).status, 503);
  const response = await handler(() => { throw new Error("must not pin"); })(request(image(), "image", { headers: { origin: "https://evil.example" } }));
  assert.equal(response.status, 403);
});

test("limits repeated uploads and returns retry-after", async () => {
  const post = handler();
  for (let index = 0; index < 10; index++) assert.equal((await post(request())).status, 200);
  const denied = await post(request());
  assert.equal(denied.status, 429);
  assert.equal((await denied.json()).code, "UPLOAD_RATE_LIMITED");
  assert.ok(Number(denied.headers.get("retry-after")) > 0);
});

test("upstream errors and malformed CIDs cannot leak credentials or become successful uploads", async () => {
  for (const fetchImpl of [
    async () => new Response("server-only-test-key", { status: 500 }),
    async () => Response.json({ IpfsHash: "https://evil.example/file" }),
    async () => new Response("not-json"),
    async () => new Response("x".repeat(20 * 1024)),
  ]) {
    const response = await handler(fetchImpl)(request());
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes("server-only-test-key"), false);
  }
});

test("upstream timeout aborts and returns a retryable error", async () => {
  const pending = handler((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }), { timeoutMs: 5 })(request());
  // AbortSignal.timeout intentionally does not keep Node's event loop alive.
  const [response] = await Promise.all([pending, new Promise((resolve) => setTimeout(resolve, 20))]);
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, "UPLOAD_TIMEOUT");
});

test("client exposes stable server errors and rejects malformed success responses", async () => {
  const denied = createLocalMediaUploader({ fetchImpl: async () => Response.json({ code: "UPLOAD_RATE_LIMITED" }, { status: 429 }) });
  await assert.rejects(denied({ kind: "image", file: image(), chainId: 56 }), { code: "UPLOAD_RATE_LIMITED", status: 429 });
  for (const payload of [null, {}, { data: { cid: "ipfs://bad" } }]) {
    const upload = createLocalMediaUploader({ fetchImpl: async () => Response.json(payload) });
    await assert.rejects(upload({ kind: "image", file: image(), chainId: 56 }), { code: "UPLOAD_INVALID_RESPONSE" });
  }
});

test("client forwards cancellation and distinguishes network failures", async () => {
  const controller = new AbortController();
  controller.abort();
  const upload = createLocalMediaUploader({ fetchImpl: async (_url, init) => {
    assert.equal(init.signal, controller.signal);
    throw controller.signal.reason;
  } });
  await assert.rejects(upload({ kind: "image", file: image(), chainId: 56, signal: controller.signal }), { name: "AbortError" });
  const offline = createLocalMediaUploader({ fetchImpl: async () => { throw new TypeError("offline"); } });
  await assert.rejects(offline({ kind: "image", file: image(), chainId: 56 }), { code: "UPLOAD_NETWORK_ERROR" });
});

test("preview relay requires no pinning key and forwards only normalized file fields", async () => {
  const central = handler();
  const relay = createRuntimeUploadHandler({ upstreamOrigin: "https://flap.sh", fetchImpl: async (url, init) => {
    assert.equal(url, "https://flap.sh/api/runtime/upload");
    assert.equal(init.headers, undefined);
    assert.equal(init.redirect, "error");
    assert.deepEqual([...init.body.keys()], ["kind", "chainId", "file"]);
    return central(new Request(url, init));
  } });
  const incoming = request(image(), "image", { headers: { cookie: "private-session", authorization: "private-key" } });
  const preview = new Request("https://preview.example/api/runtime/upload", incoming);
  const response = await relay(preview);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.cid, CID);
});

test("preview relay fails closed on invalid origins, redirects and invalid upstream CIDs", async () => {
  for (const upstreamOrigin of ["http://flap.sh", "https://user:pass@flap.sh", "https://flap.sh/path", "https://flap.sh/?token=secret", "https://flap.sh"]) {
    const response = await createRuntimeUploadHandler({ upstreamOrigin })(request());
    assert.equal(response.status, 503);
  }
  const relay = createRuntimeUploadHandler({ upstreamOrigin: "https://flap.sh", fetchImpl: async () => Response.json({ data: { cid: "https://evil.example" } }) });
  const response = await relay(new Request("https://preview.example/api/runtime/upload", request()));
  assert.equal(response.status, 502);
});

test("preview relay preserves rate-limit status and bounded retry-after", async () => {
  const relay = createRuntimeUploadHandler({ upstreamOrigin: "https://flap.sh", fetchImpl: async () => Response.json({ code: "UPLOAD_RATE_LIMITED", error: "private-details" }, { status: 429, headers: { "retry-after": "20" } }) });
  const response = await relay(new Request("https://preview.example/api/runtime/upload", request()));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "20");
  assert.equal((await response.text()).includes("private-details"), false);
});
