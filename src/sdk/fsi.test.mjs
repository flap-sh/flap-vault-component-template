import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { FSI_QUERY_PREFIX, buildFsiQueryUrl, hasFsiQueryDeclaration, isFsiQueryUrl } from "./fsiPolicy.mjs";
const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
const compiled = await build({ entryPoints: [new URL("./fsi.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "esm" });
const { readFsiJson } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);

test("query exception matches only the HTTPS origin and /fsi/v1 path boundary", () => {
  for (const suffix of ["", "/", "/by-key/account?templateId=G", "/vault/A/points?cursor=a%2Fb%3D%3D"]) {
    assert.equal(isFsiQueryUrl(FSI_QUERY_PREFIX + suffix), true, suffix);
  }
  for (const url of [
    "http://bsc-debug.butterfly.army/fsi/v1/vault", "https://bsc-debug.butterfly.army:444/fsi/v1/vault",
    "https://user:pass@bsc-debug.butterfly.army/fsi/v1/vault", "https://bsc-debug.butterfly.army.evil.test/fsi/v1/vault",
    "https://sub.bsc-debug.butterfly.army/fsi/v1/vault", FSI_QUERY_PREFIX + "0/vault", FSI_QUERY_PREFIX + "-evil",
    "https://bsc-debug.butterfly.army/fsi/versions", FSI_QUERY_PREFIX + "/../../admin", FSI_QUERY_PREFIX + "/%2e%2e/admin",
    FSI_QUERY_PREFIX + "/%252e%252e/admin", FSI_QUERY_PREFIX + "/%2f..%2fadmin", FSI_QUERY_PREFIX + "#fragment",
  ]) assert.equal(isFsiQueryUrl(url), false, url);
});

test("manifest must declare the FSI prefix without a fixed query", () => {
  for (const endpoints of [FSI_QUERY_PREFIX, FSI_QUERY_PREFIX + "/", ["https://other.test", FSI_QUERY_PREFIX]]) assert(hasFsiQueryDeclaration(endpoints));
  for (const endpoints of [undefined, [], "https://bsc-debug.butterfly.army", FSI_QUERY_PREFIX + "?limit=1", FSI_QUERY_PREFIX + "/vault", "https://user@bsc-debug.butterfly.army/fsi/v1"]) assert(!hasFsiQueryDeclaration(endpoints));
});

test("FSI rejects raw and encoded dot segments before URL normalization, including prefix-equivalent declarations", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json({}); };
  for (const path of [
    "vault/../other/G", "vault/./G", "vault/%2e%2e/other/G", "vault/.%2e/other/G", "vault/%2e./other/G",
    "vault/%2E%2E/other/G", "vault/%2E/G", "%2e%2e/v1/other/G", "vault/%2fG", "vault/%5cG", "vault/%25G", "vault/\u0000G", "vault/\u007fG",
  ]) {
    assert.equal(isFsiQueryUrl(`${FSI_QUERY_PREFIX}/${path}`), false, path);
    assert.throws(() => buildFsiQueryUrl(path), /FSI/, path);
    await assert.rejects(readFsiJson(FSI_QUERY_PREFIX, path, {}, fetchImpl), /FSI/, path);
  }
  for (const suffix of ["/vault/..", "/vault/%2e%2e", "/%2e", "/.", "/#", "/vault\\..", "/vault/\n../"]) {
    const endpoint = FSI_QUERY_PREFIX + suffix;
    assert.equal(isFsiQueryUrl(endpoint), false, endpoint);
    assert.equal(hasFsiQueryDeclaration(endpoint), false, endpoint);
    await assert.rejects(readFsiJson(endpoint, "vault/G", {}, fetchImpl), /manifest.endpoints/, endpoint);
  }
  assert.equal(calls, 0, "all rejected paths/declarations must fail before fetch");
});

test("SDK preserves uint256 strings and safely encodes arbitrary query names and cursor values", async () => {
  const params = { round: "115792089237316195423570985008687907853269984665640564039457584007913129639935", cursor: "a/b+c==&?#", "custom key": "你好", limit: "100" };
  const result = await readFsiJson(FSI_QUERY_PREFIX, "vault/B/points", params, async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, FSI_QUERY_PREFIX + "/vault/B/points");
    assert.deepEqual(Object.fromEntries(parsed.searchParams), params);
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    assert.equal(init.credentials, "omit");
    assert.equal(init.referrerPolicy, "no-referrer");
    return Response.json({ items: [], nextCursor: params.cursor });
  });
  assert.deepEqual(result, { items: [], nextCursor: params.cursor });
  for (const path of ["vault/A/points", "vault/B/score/7/account", "vault/L/feed/3", "vault/G", "by-key/account"]) assert(isFsiQueryUrl(buildFsiQueryUrl(path)));
});

test("SDK rejects path escapes and missing declaration before network access", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json({}); };
  await assert.rejects(readFsiJson(undefined, "vault/G", {}, fetchImpl), /manifest.endpoints/);
  for (const path of ["../versions", "vault/../../../../admin", "/fsi/v1/vault", "vault/G?limit=1", "vault/G#fragment", "vault/%252e%252e/admin", "vault/%2f..%2fadmin", "vault\\..\\admin"]) {
    await assert.rejects(readFsiJson(FSI_QUERY_PREFIX, path, {}, fetchImpl), /FSI/, path);
  }
  assert.equal(calls, 0);
});

test("SDK propagates upstream failures without a success result", async () => {
  await assert.rejects(readFsiJson(FSI_QUERY_PREFIX, "vault/G", {}, async () => new Response(null, { status: 404 })), /404/);
  await assert.rejects(readFsiJson(FSI_QUERY_PREFIX, "vault/G", {}, async () => { throw new TypeError("redirect blocked"); }), /redirect blocked/);
});
