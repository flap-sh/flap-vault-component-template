import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runVaultCheck } from "./vault-check.mjs";

const ENDPOINT = "https://gc.taxed.fun/api";
const SAFE_OPTIONS = '{ method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" }';
const network = (result) => result.issues.filter((issue) => issue.severity === "blocking" &&
  (issue.ruleId.startsWith("endpoint-policy/") || issue.ruleId.startsWith("forbidden-api/")));
const dynamicFetch = (endpoint = ENDPOINT, options = SAFE_OPTIONS) =>
  'void fetch(`' + endpoint + '/records?cursor=${encodeURIComponent(sdk.wallet.address ?? "")}&limit=${encodeURIComponent("100")}`, ' + options + ');';

function fixture(t) {
  const folder = `taxed-query-test-${process.pid}`;
  const dir = path.resolve("src/vaults", folder);
  mkdirSync(dir);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const manifest = {
    artifactId: `vaultui_${folder}_01K9V9Z0P0AAAAAAAAAAAAAAAA`, name: "taxed.fun policy test", i18n: ["en"],
    match: { bindings: [{ chainId: 56, factoryAddress: "0xc3e4ee8f3c616d16297fafcb9daab122d31efa9e", tokenAddresses: ["0x286184b2660a2822671a33f24c4517f593947777"] }] },
  };
  writeFileSync(path.join(dir, "VaultABI.ts"), "export const vaultAbi = [] as const;");
  writeFileSync(path.join(dir, "i18n.json"), JSON.stringify({ en: { title: "Test" } }));
  return (body, endpoints = ENDPOINT, abiSource = "export const vaultAbi = [] as const;") => {
    writeFileSync(path.join(dir, "VaultABI.ts"), abiSource);
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...manifest, ...(endpoints === null ? {} : { endpoints }) }));
    writeFileSync(path.join(dir, "Component.tsx"), `"use client";
import { useFlapSdk } from "@/src/sdk";
export default function Component() {
  const sdk = useFlapSdk();
  ${body}
  return <div>{sdk.i18n.t("title")}</div>;
}`);
    return runVaultCheck(folder, { silent: true });
  };
}

test("all taxed.fun subdomains accept fixed-path encoded queries and retain review evidence", (t) => {
  const check = fixture(t);
  for (const endpoint of [ENDPOINT, "https://api.gc.taxed.fun/api", "https://future-service.taxed.fun", "https://GC.TAXED.FUN:443/api"]) {
    const result = check(dynamicFetch(endpoint), endpoint);
    assert.deepEqual(network(result), [], endpoint);
    const review = result.review.externalEndpoints.find((item) => item.source === "fetch");
    assert.equal(review.dynamicQuery, true);
    assert.equal(review.origin, new URL(endpoint).origin);
    assert.match(review.targetExpression, /encodeURIComponent\(sdk.wallet.address/);
    assert(result.issues.some((item) => item.ruleId === "manual-review/external-endpoint" && item.severity === "warning"));
    assert.deepEqual(network(check(`void fetch("${endpoint}/records?limit=100", ${SAFE_OPTIONS});`, endpoint)), []);
  }
  assert.deepEqual(network(check(dynamicFetch(ENDPOINT, SAFE_OPTIONS.slice(0, -2) + ', cache: "no-store" }'))), []);
});

test("taxed.fun query permission still requires the concrete declared origin and path", (t) => {
  const check = fixture(t);
  for (const declaration of [null, "https://*.taxed.fun", "https://taxed.fun", "https://other.taxed.fun/api", ENDPOINT + "/elsewhere", ENDPOINT + "/records?cursor=fixed", ENDPOINT + "/records?cursor="]) {
    assert(network(check(dynamicFetch(), declaration)).length > 0, String(declaration));
  }
  assert.deepEqual(network(check(dynamicFetch(), ["https://other.test", ENDPOINT])), []);
  assert(network(check(dynamicFetch(ENDPOINT.replace("/api", "/api-other")))).length > 0, "path prefixes must end at a path boundary");
  assert(network(check('return <img src="' + ENDPOINT + '/records" />;')).length > 0, "manifest endpoints do not authorize media");
  const exact = ENDPOINT + "/records?cursor=fixed";
  assert.deepEqual(network(check(`void fetch("${exact}", ${SAFE_OPTIONS});`, exact)), [], "fixed query declarations still authorize the exact static request");
});

test("query interpolation cannot change hosts, paths, keys or inject raw query syntax", (t) => {
  const check = fixture(t);
  const good = dynamicFetch();
  for (const source of [
    good.replace('encodeURIComponent(sdk.wallet.address ?? "")', 'sdk.wallet.address'),
    good.replace("encodeURIComponent", "encodeURI"),
    good.replace('encodeURIComponent(sdk.wallet.address ?? "")', 'encodeURIComponent(...["cursor"])'),
    'const encodeURIComponent = (value: string) => value; ' + good,
    'function encodeURIComponent(value: string) { return value; } ' + good,
    'var encodeURIComponent = (value: string) => value; var encodeURIComponent = (value: string) => value; ' + good,
    'const fetch = () => null; ' + good,
    'var fetch = () => null; var fetch = () => null; ' + good,
    good.replace("?cursor=", "?"),
    good.replace("?cursor=", "?limit=1&"),
    good.replace("/records?", '/${encodeURIComponent("records")}?'),
    good.replace("gc.taxed.fun", '${encodeURIComponent("gc")}.taxed.fun'),
    'const url = "' + ENDPOINT + '/records"; void fetch(url, ' + SAFE_OPTIONS + ');',
    'void fetch(`https://taxed.fun/api?cursor=${encodeURIComponent("x")}`, ' + SAFE_OPTIONS + ');',
    'void fetch(`https://not-taxed.fun/api?cursor=${encodeURIComponent("x")}`, ' + SAFE_OPTIONS + ');',
    'void fetch(`https://gc.taxed.fun.evil.test/api?cursor=${encodeURIComponent("x")}`, ' + SAFE_OPTIONS + ');',
  ]) assert(network(check(source, [ENDPOINT, "https://taxed.fun", "https://not-taxed.fun", "https://gc.taxed.fun.evil.test"])).length > 0, source);
});

test("query encoders cannot be replaced globally, including from another source module", (t) => {
  const check = fixture(t);
  for (const mutation of [
    'encodeURIComponent = (value: string) => value;',
    'encodeURIComponent ||= (value: string) => value;',
    'encodeURIComponent &&= (value: string) => value;',
    'encodeURIComponent ??= (value: string) => value;',
    'encodeURIComponent += "unsafe";',
    '({ encodeURIComponent } = { encodeURIComponent: (value: string) => value });',
    '({ encoder: encodeURIComponent } = { encoder: (value: string) => value });',
    '[encodeURIComponent] = [(value: string) => value];',
    'for (encodeURIComponent of [(value: string) => value]) {}',
    'encodeURIComponent++;',
  ]) {
    assert(network(check(mutation + dynamicFetch())).some((item) => item.ruleId === "forbidden-api/browser-global-escape"), mutation);
    assert(network(check(dynamicFetch(), ENDPOINT, mutation + "export const vaultAbi = [] as const;")).some((item) => item.ruleId === "forbidden-api/browser-global-escape" && item.file.endsWith("VaultABI.ts")), "imported module: " + mutation);
  }
  const local = 'function unrelated(encodeURIComponent: (value: string) => string) { encodeURIComponent = (value: string) => value; return encodeURIComponent("local"); }';
  assert.deepEqual(network(check(local + dynamicFetch())), [], "local assignments in an unrelated scope cannot replace the global encoder");
});

test("named function expressions cannot impersonate the global query encoder", (t) => {
  const check = fixture(t);
  for (const endpoint of [ENDPOINT, "https://fsi.taxed.fun/fsi/v1", "https://bsc-debug.butterfly.army/fsi/v1"]) {
    const source = `const request = function encodeURIComponent(value?: string) {
      if (value !== undefined) return value;
      ${dynamicFetch(endpoint)}
    }; request();`;
    assert(network(check(source, endpoint)).some((item) => item.ruleId === "endpoint-policy/direct-fetch"), endpoint);
  }
  const unrelated = 'const local = function encodeURIComponent(value: string) { return value; };';
  assert.deepEqual(network(check(unrelated + dynamicFetch())), [], "a named expression only shadows its own function body");
});

test("unsafe taxed.fun URLs cannot fall back to ordinary static-fetch rules", (t) => {
  const check = fixture(t);
  for (const endpoint of [
    "http://gc.taxed.fun/api", "https://user:pass@gc.taxed.fun/api", "https://gc.taxed.fun:444/api",
    "https://gc.taxed.fun./api", "https://gc..taxed.fun/api", "https://-gc.taxed.fun/api",
    "https://gc_.taxed.fun/api", "https://%67c.taxed.fun/api",
    ENDPOINT + "/../private", ENDPOINT + "/./records", ENDPOINT + "/%2e%2e/private",
    ENDPOINT + "/%2fprivate", ENDPOINT + "/%5cprivate", ENDPOINT + "/%25private",
    ENDPOINT + "/%0arecords", ENDPOINT + "#fragment", ENDPOINT + "#",
    "https://gc.\ttaxed.fun/api",
  ]) {
    for (const source of [dynamicFetch(endpoint), `void fetch(${JSON.stringify(endpoint)}, ${SAFE_OPTIONS});`]) {
      assert(network(check(source, endpoint)).some((item) => item.ruleId === "endpoint-policy/direct-fetch"), source);
    }
  }
});

test("static and dynamic taxed.fun requests require literal safe read-only options", (t) => {
  const check = fixture(t);
  for (const options of [
    undefined, "undefined", "options", "{ ...options }", "{}",
    SAFE_OPTIONS.replace('"GET"', '"POST"'), SAFE_OPTIONS.replace('"omit"', '"include"'),
    SAFE_OPTIONS.replace('"error"', '"follow"'), SAFE_OPTIONS.replace('"no-referrer"', '"unsafe-url"'),
    SAFE_OPTIONS.replace('method: "GET", ', ''), SAFE_OPTIONS.replace('credentials: "omit", ', ''),
    SAFE_OPTIONS.replace('redirect: "error", ', ''), SAFE_OPTIONS.replace(', referrerPolicy: "no-referrer"', ''),
    SAFE_OPTIONS.replace('method: "GET"', '["method"]: "GET"'),
    SAFE_OPTIONS.replace('method: "GET"', 'get method() { return "GET"; }'),
    SAFE_OPTIONS.replace('method: "GET"', 'method: method'),
    SAFE_OPTIONS.replace('redirect: "error"', 'redirect: "follow", redirect: "error"'),
    SAFE_OPTIONS.slice(0, -2) + ', headers: { Authorization: "token" } }',
    SAFE_OPTIONS.slice(0, -2) + ', body: "payload" }',
  ]) {
    for (const target of ['"' + ENDPOINT + '/records"', '`' + ENDPOINT + '/records?cursor=${encodeURIComponent("x")}`']) {
      const source = `const options = ${SAFE_OPTIONS}; const method = "GET"; void fetch(${target}${options === undefined ? "" : `, ${options}`});`;
      assert(network(check(source)).some((item) => item.ruleId === "endpoint-policy/direct-fetch"), source);
    }
  }
});

test("FSI routing and other domains retain their existing request policy", (t) => {
  const check = fixture(t);
  assert(network(check('void sdk.readFsi("by-key/account", { limit: "100" });')).some((item) => item.ruleId === "endpoint-policy/fsi-declaration-required"));
  const fsi = "https://fsi.taxed.fun/fsi/v1";
  assert(network(check(`void fetch("${fsi}/by-key/account");`, fsi)).some((item) => item.ruleId === "endpoint-policy/direct-fetch"));
  const exactFsi = fsi + "/by-key/account?cursor=";
  assert(network(check('void fetch(`' + exactFsi + '${encodeURIComponent("x")}`, ' + SAFE_OPTIONS + ');', exactFsi)).some((item) => item.ruleId === "endpoint-policy/direct-fetch"));
  assert.deepEqual(network(check('void fetch("https://other.test/static");', "https://other.test")), []);
  assert(network(check(dynamicFetch("https://other.test"), "https://other.test")).length > 0);
});
