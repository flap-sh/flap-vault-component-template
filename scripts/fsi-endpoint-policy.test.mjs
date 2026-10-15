import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runVaultCheck } from "./vault-check.mjs";

const PREFIX = "https://bsc-debug.butterfly.army/fsi/v1";
const SAFE_OPTIONS = '{ method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" }';
const network = (result) => result.issues.filter((x) => x.severity === "blocking" && (x.ruleId.startsWith("endpoint-policy/") || x.ruleId.startsWith("forbidden-api/")));
function fixture(t) {
  const folder = `fsi-query-test-${process.pid}`;
  const dir = path.resolve("src/vaults", folder);
  mkdirSync(dir);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const manifest = {
    artifactId: `vaultui_${folder}_01K9V9Z0P0AAAAAAAAAAAAAAAA`, name: "FSI policy test", i18n: ["en"],
    match: { bindings: [{ chainId: 56, factoryAddress: "0xc3e4ee8f3c616d16297fafcb9daab122d31efa9e", tokenAddresses: ["0x286184b2660a2822671a33f24c4517f593947777"] }] },
  };
  const check = (body, endpoints = PREFIX) => {
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...manifest, ...(endpoints === undefined ? {} : { endpoints }) }));
    writeFileSync(path.join(dir, "Component.tsx"), `"use client";
import { useFlapSdk } from "@/src/sdk";
export default function Component() {
  const sdk = useFlapSdk();
  const context = sdk.context;
  ${body}
  return <div>{sdk.i18n.t("title")}</div>;
}`);
    return runVaultCheck(folder, { silent: true });
  };
  writeFileSync(path.join(dir, "VaultABI.ts"), "export const vaultAbi = [] as const;");
  writeFileSync(path.join(dir, "i18n.json"), JSON.stringify({ en: { title: "FSI" } }));
  return check;
}

test("FSI query exception passes both gates and preserves endpoint review evidence", (t) => {
  const check = fixture(t);
  const sdkResult = check('void sdk.readFsi(`${context.vaultAddress}/G/claim`, { actor: sdk.wallet.address ?? "", limit: "100", cursor: "a/b+c==" });');
  assert.deepEqual(network(sdkResult), []);
  const sdkReview = sdkResult.review.externalEndpoints.find((x) => x.source === "sdk.readFsi");
  assert.equal(sdkReview.url, PREFIX);
  assert.equal(sdkReview.dynamicQuery, true);
  assert.match(sdkReview.pathExpression, /context.vaultAddress/);
  assert.match(sdkReview.paramsExpression, /cursor/);
  const noDeclaration = check('void sdk.readFsi("by-key/account", { templateId: "G" });', null);
  assert(network(noDeclaration).some((x) => x.ruleId === "endpoint-policy/fsi-declaration-required"));
  const direct = 'void fetch(`' + PREFIX + '/by-key/account?templateId=G&actor=${encodeURIComponent(sdk.wallet.address ?? "")}&limit=${encodeURIComponent("100")}`, ' + SAFE_OPTIONS + ');';
  const directResult = check(direct);
  assert.deepEqual(network(directResult), []);
  const directReview = directResult.review.externalEndpoints.find((x) => x.source === "fetch");
  assert.equal(directReview.dynamicQuery, true);
  assert.match(directReview.targetExpression, /sdk.wallet.address/);
  assert.deepEqual(network(check('void fetch("' + PREFIX + '/by-key/account?templateId=G&limit=100", ' + SAFE_OPTIONS + ');')), []);
  assert.deepEqual(network(check('void fetch("https://other.test/static");', "https://other.test")), [], "other static endpoints keep their existing policy");
  for (const bad of [
    direct.replace("/fsi/v1/", "/fsi/v10/"), direct.replace("/fsi/v1/", "/other/"),
    direct.replace("https:", "http:"), direct.replace("butterfly.army", "butterfly.army.evil.test"),
    direct.replace("https://", "https://user:pass@"), direct.replace("butterfly.army/", "butterfly.army:444/"),
    direct.replace("/by-key/account?", "/${context.vaultAddress}/G?"),
    'const url = "' + PREFIX + '/by-key/account"; void fetch(url);',
    'void fetch(`https://other.test/path?limit=${100}`);',
  ]) assert(network(check(bad, [PREFIX, "https://other.test"])).length > 0, bad);
  assert(network(check(direct, "https://other.test")).length > 0);
  assert(network(check('const url = "' + PREFIX + '/by-key/account"; return <img src={url} />;')).length > 0, "FSI declarations never authorize non-fetch media");
  assert(network(check('const fetch = () => null; ' + direct)).length > 0, "shadowed fetch remains blocked");
});

test("FSI fetch requires explicit immutable safe options for both static and dynamic targets", (t) => {
  const check = fixture(t);
  const targets = ['"' + PREFIX + '/by-key/account?limit=100"', '`' + PREFIX + '/by-key/account?cursor=${encodeURIComponent(sdk.wallet.address ?? "")}`'];
  for (const target of targets) {
    assert.deepEqual(network(check(`void fetch(${target}, ${SAFE_OPTIONS});`)), []);
    assert.deepEqual(network(check(`void fetch(${target}, ${SAFE_OPTIONS.slice(0, -2)}, cache: "no-store" });`)), []);
    for (const options of [
      undefined, "undefined", "options", "{...options}",
      SAFE_OPTIONS.replace('"GET"', '"POST"'),
      SAFE_OPTIONS.replace('"omit"', '"include"'),
      SAFE_OPTIONS.replace('"omit"', '"same-origin"'),
      SAFE_OPTIONS.replace('"error"', '"follow"'),
      SAFE_OPTIONS.replace('"error"', '"manual"'),
      SAFE_OPTIONS.replace('"no-referrer"', '"unsafe-url"'),
      SAFE_OPTIONS.replace('method: "GET", ', ''),
      SAFE_OPTIONS.replace('credentials: "omit", ', ''),
      SAFE_OPTIONS.replace('redirect: "error", ', ''),
      SAFE_OPTIONS.replace(', referrerPolicy: "no-referrer"', ''),
      SAFE_OPTIONS.replace('method: "GET"', 'method: context.tokenSymbol'),
      SAFE_OPTIONS.replace('method: "GET"', 'get method() { return "GET"; }'),
      SAFE_OPTIONS.replace('method: "GET"', '["method"]: "GET"'),
      SAFE_OPTIONS.replace('method: "GET"', 'method'),
      SAFE_OPTIONS.replace('method: "GET"', '...options, method: "GET"'),
      SAFE_OPTIONS.replace('redirect: "error"', 'redirect: "follow", redirect: "error"'),
      SAFE_OPTIONS.replace('redirect: "error"', 'redirect: "error", redirect: "follow"'),
      SAFE_OPTIONS.slice(0, -2) + ', body: "payload" }',
      SAFE_OPTIONS.slice(0, -2) + ', headers: { Authorization: "Bearer token" } }',
    ]) {
      const source = `const options = ${SAFE_OPTIONS}; const method = "GET"; void fetch(${target}${options === undefined ? "" : `, ${options}`});`;
      assert(network(check(source)).some((x) => x.ruleId === "endpoint-policy/direct-fetch"), source);
    }
  }
});

test("FSI fetch accepts only encoded query values and rejects shadowed encoders and normalized path syntax", (t) => {
  const check = fixture(t);
  const good = 'void fetch(`' + PREFIX + '/by-key/account?cursor=${encodeURIComponent(sdk.wallet.address ?? "")}`, ' + SAFE_OPTIONS + ');';
  assert.deepEqual(network(check(good)), []);
  assert.deepEqual(network(check(good.replace('encodeURIComponent(sdk.wallet.address ?? "")', '(encodeURIComponent)((sdk.wallet.address ?? ""))'))), []);
  for (const source of [
    good.replace('encodeURIComponent(sdk.wallet.address ?? "")', 'sdk.wallet.address'),
    good.replace('encodeURIComponent', 'encodeURI'),
    good.replace('encodeURIComponent(sdk.wallet.address ?? "")', 'encodeURIComponent(...["cursor"])'),
    'const encodeURIComponent = (value: string) => value; ' + good,
    'function encodeURIComponent(value: string) { return value; } ' + good,
    good.replace('?cursor=', '?'),
    good.replace('?cursor=', '?limit=100&'),
    good.replace('}`,', '}#fragment`,'),
    good.replace('}`,', '}#`,'),
    good.replace('/by-key/account?', '/${encodeURIComponent(context.vaultAddress)}/G?'),
    'void fetch(`' + PREFIX + '/by-key/account?cursor=${sdk.wallet.address}`);',
  ]) assert(network(check(source)).some((x) => x.ruleId === "endpoint-policy/direct-fetch"), source);
  for (const path of ['vault/../other/G', 'vault/./G', 'vault/%2e%2e/other/G', 'vault/.%2E/other/G', 'vault/%2e./other/G', 'vault/%2E/G', 'vault/%2fG', 'vault/%5cG', 'vault/%25G', 'vault/G#fragment', 'vault/G#']) {
    for (const target of ['"' + PREFIX + '/' + path + '"', '`' + PREFIX + '/' + path + '?cursor=${encodeURIComponent(sdk.wallet.address ?? "")}`']) {
      const source = `void fetch(${target}, ${SAFE_OPTIONS});`;
      assert(network(check(source)).some((x) => x.ruleId === "endpoint-policy/direct-fetch"), source);
    }
  }
});

test("encoded fetch query values preserve opaque cursors and cannot inject parameters or fragments", async () => {
  const cursor = "a/b+c==&limit=999?#你好";
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++;
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, PREFIX + "/by-key/account");
    assert.deepEqual(Object.fromEntries(parsed.searchParams), { cursor });
    assert.equal(parsed.hash, "");
    assert.deepEqual(init, { method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
  };
  const call = new Function("fetch", "cursor", 'return fetch(`' + PREFIX + '/by-key/account?cursor=${encodeURIComponent(cursor)}`, ' + SAFE_OPTIONS + ');');
  await call(fetchImpl, cursor);
  assert.equal(calls, 1);
});
