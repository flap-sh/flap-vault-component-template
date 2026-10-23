import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { FSI_QUERY_PREFIX, FSI_QUERY_PREFIXES, buildFsiQueryUrl, hasFsiQueryDeclaration, isFsiQueryUrl, resolveFsiQueryPrefix } from "./fsiPolicy.mjs";
const NEW_PREFIX = "https://fsi.taxed.fun/fsi/v1";
const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
const compiled = await build({ entryPoints: [new URL("./fsi.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "esm" });
const { readFsiJson } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);

test("query exception matches only the two exact HTTPS origins and /fsi/v1 path boundary", () => {
  assert.deepEqual(FSI_QUERY_PREFIXES, [NEW_PREFIX, FSI_QUERY_PREFIX]);
  assert(Object.isFrozen(FSI_QUERY_PREFIXES));
  for (const prefix of [FSI_QUERY_PREFIX, NEW_PREFIX]) {
    const { host, origin } = new URL(prefix);
    for (const suffix of ["", "/", "/by-key/account?templateId=G", "/vault/A/points?cursor=a%2Fb%3D%3D"]) {
      assert.equal(isFsiQueryUrl(prefix + suffix), true, prefix + suffix);
    }
    for (const url of [
      `http://${host}/fsi/v1/vault`, `https://${host}:444/fsi/v1/vault`,
      `https://user:pass@${host}/fsi/v1/vault`, `https://${host}.evil.test/fsi/v1/vault`,
      `https://sub.${host}/fsi/v1/vault`, prefix + "0/vault", prefix + "-evil",
      origin + "/fsi/versions", prefix + "/../../admin", prefix + "/%2e%2e/admin",
      prefix + "/%252e%252e/admin", prefix + "/%2f..%2fadmin", prefix + "#fragment",
    ]) assert.equal(isFsiQueryUrl(url), false, url);
  }
});

test("manifest selects a declared exact FSI root with deterministic new-host preference", () => {
  for (const prefix of [FSI_QUERY_PREFIX, NEW_PREFIX]) {
    for (const endpoints of [prefix, prefix + "/", ["https://other.test", prefix]]) {
      assert(hasFsiQueryDeclaration(endpoints));
      assert.equal(resolveFsiQueryPrefix(endpoints), prefix);
    }
    const { host, origin } = new URL(prefix);
    for (const endpoints of [origin, prefix + "?limit=1", prefix + "/vault", `https://user@${host}/fsi/v1`]) {
      assert(!hasFsiQueryDeclaration(endpoints));
      assert.equal(resolveFsiQueryPrefix(endpoints), null);
    }
  }
  for (const endpoints of [[FSI_QUERY_PREFIX, NEW_PREFIX], [NEW_PREFIX, FSI_QUERY_PREFIX], [FSI_QUERY_PREFIX, NEW_PREFIX + "/"]]) {
    assert.equal(resolveFsiQueryPrefix(endpoints), NEW_PREFIX);
  }
  for (const endpoints of [undefined, [], null, {}, [42], "https://unreviewed.test/fsi/v1"]) {
    assert.equal(resolveFsiQueryPrefix(endpoints), null);
  }
  assert.equal(buildFsiQueryUrl("vault/G"), FSI_QUERY_PREFIX + "/vault/G", "the existing helper default stays compatible");
  assert.equal(buildFsiQueryUrl("vault/G", {}, NEW_PREFIX), NEW_PREFIX + "/vault/G");
  for (const prefix of ["https://unreviewed.test/fsi/v1", NEW_PREFIX + "/vault", NEW_PREFIX + "?limit=1"]) {
    assert.throws(() => buildFsiQueryUrl("vault/G", {}, prefix), /FSI/);
  }
});

test("SDK routes to the reviewed endpoint without depending on declaration order", async () => {
  for (const [endpoints, expectedPrefix] of [
    [FSI_QUERY_PREFIX, FSI_QUERY_PREFIX], [NEW_PREFIX, NEW_PREFIX],
    [[FSI_QUERY_PREFIX, NEW_PREFIX], NEW_PREFIX], [[NEW_PREFIX, FSI_QUERY_PREFIX], NEW_PREFIX],
  ]) {
    const calls = [];
    const result = await readFsiJson(endpoints, "by-key/account", { cursor: "a/b+c==&?#" }, async (url, options) => {
      calls.push(url);
      const parsed = new URL(url);
      assert.equal(parsed.origin + parsed.pathname, expectedPrefix + "/by-key/account");
      assert.equal(parsed.searchParams.get("cursor"), "a/b+c==&?#");
      assert.deepEqual(options, { method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store" });
      return Response.json({ items: [] });
    });
    assert.deepEqual(result, { items: [] });
    assert.equal(calls.length, 1);
  }
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
  for (const endpoints of [undefined, [], "https://fsi.taxed.fun", NEW_PREFIX + "/vault", NEW_PREFIX + "?limit=1", "https://fsi.taxed.fun.evil.test/fsi/v1"]) {
    await assert.rejects(readFsiJson(endpoints, "vault/G", {}, fetchImpl), /manifest.endpoints/);
  }
  for (const path of ["../versions", "vault/../../../../admin", "/fsi/v1/vault", "vault/G?limit=1", "vault/G#fragment", "vault/%252e%252e/admin", "vault/%2f..%2fadmin", "vault\\..\\admin"]) {
    for (const prefix of [FSI_QUERY_PREFIX, NEW_PREFIX]) await assert.rejects(readFsiJson(prefix, path, {}, fetchImpl), /FSI/, path);
  }
  await assert.rejects(readFsiJson(NEW_PREFIX, "vault/G", { limit: 100 }, fetchImpl), /strings/);
  assert.equal(calls, 0);
});

test("SDK propagates upstream failures without a success result", async () => {
  await assert.rejects(readFsiJson(FSI_QUERY_PREFIX, "vault/G", {}, async () => new Response(null, { status: 404 })), /404/);
  await assert.rejects(readFsiJson(FSI_QUERY_PREFIX, "vault/G", {}, async () => { throw new TypeError("redirect blocked"); }), /redirect blocked/);
  for (const failure of [async () => new Response(null, { status: 503 }), async () => { throw new TypeError("network unavailable"); }]) {
    const calls = [];
    await assert.rejects(readFsiJson([FSI_QUERY_PREFIX, NEW_PREFIX], "vault/G", {}, async (url) => {
      calls.push(url);
      return failure();
    }), /503|network unavailable/);
    assert.deepEqual(calls, [NEW_PREFIX + "/vault/G"], "failed queries never fall back to the other deployment");
  }
});
