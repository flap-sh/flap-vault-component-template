import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { BINANCE_TOKEN_DYNAMIC_INFO_ENDPOINT as ENDPOINT, BINANCE_TOKEN_MARKET_OPERATIONS } from "../src/sdk/binanceTokenPolicy.mjs";
import { runVaultCheck } from "./vault-check.mjs";

const TOKEN = "0x55d398326f99059fF775485246999027B3197955";
const QUERY = `chainId=56&contractAddress=${TOKEN}`;
const DYNAMIC_QUERY = "chainId=${encodeURIComponent(context.chainId)}&contractAddress=${encodeURIComponent(context.tokenAddress)}";
const SAFE_OPTIONS = '{ method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" }';
const nativeFetch = (target, options = SAFE_OPTIONS) => `void fetch(${target}, ${options});`;
const staticFetch = (target, options) => nativeFetch(JSON.stringify(target), options);
const dynamicFetch = (target, options) => nativeFetch(`\`${target}\``, options);

function networkBlockers(result) {
  return result.issues.filter((issue) => issue.severity === "blocking" &&
    (issue.ruleId.startsWith("endpoint-policy/") || issue.ruleId.startsWith("forbidden-api/")));
}

function fixture(t, { standalone = false } = {}) {
  const folder = `binance-query-test-${process.pid}`;
  const dir = path.resolve("src/vaults", folder);
  mkdirSync(dir);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, "VaultABI.ts"), "export const vaultAbi = [] as const;");
  const translations = {
    en: { title: "Market data" },
    ...(standalone ? { zh: { title: "行情数据" }, ko: { title: "시장 데이터" } } : {}),
  };
  writeFileSync(path.join(dir, "i18n.json"), JSON.stringify(translations));
  return (source, endpoints) => {
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
      artifactId: `vaultui_${folder}_01K9V9Z0P0AAAAAAAAAAAAAAAA`,
      name: "Binance query policy test",
      i18n: Object.keys(translations),
      ...(standalone ? {
        schemaVersion: 2, appModel: "standalone", mode: "mini-app", slug: folder,
        displayTitle: { en: "Market data", zh: "行情数据" }, match: { bindings: [] },
      } : {
        match: { bindings: [{ chainId: 56, factoryAddress: "0xc3e4ee8f3c616d16297fafcb9daab122d31efa9e", tokenAddresses: ["0x286184b2660a2822671a33f24c4517f593947777"] }] },
      }),
      endpoints,
    }));
    writeFileSync(path.join(dir, "Component.tsx"), `"use client";
import { useFlapSdk } from "@/src/sdk";
export default function Component() {
  const sdk = useFlapSdk(${standalone ? "{ chainId: 56 }" : ""});
  ${standalone ? "" : "const context = sdk.context;"}
  ${source}
  return <div className="min-h-screen">{sdk.i18n.t("title")}</div>;
}`);
    return runVaultCheck(folder, { silent: true });
  };
}

test("Binance SDK reads require the reviewed exact endpoint declaration and record query use", (t) => {
  const check = fixture(t);
  const source = "void sdk.readBinanceTokenDynamicInfo({ chainId: context.chainId, contractAddress: context.tokenAddress });";
  const approved = check(source, ["https://data.example.com/fixed", ENDPOINT]);
  assert.deepEqual(networkBlockers(approved), []);
  const review = approved.review.externalEndpoints.find((item) => item.source === "sdk.readBinanceTokenDynamicInfo");
  assert.equal(review.url, ENDPOINT);
  assert.equal(review.dynamicQuery, true);
  assert.match(review.paramsExpression, /chainId: context\.chainId, contractAddress: context\.tokenAddress/);

  for (const declaration of [undefined, new URL(ENDPOINT).origin, `${ENDPOINT}/`, `${ENDPOINT}?${QUERY}`]) {
    assert(networkBlockers(check(source, declaration)).some((issue) => issue.ruleId === "endpoint-policy/binance-declaration-required"));
  }
  for (const alias of [
    'void sdk["readBinanceTokenDynamicInfo"]({ chainId: 56, contractAddress: context.tokenAddress });',
    "const { readBinanceTokenDynamicInfo: read } = sdk; void read({ chainId: 56, contractAddress: context.tokenAddress });",
    'const { ["readBinanceTokenDynamicInfo"]: read } = sdk; void read({ chainId: 56, contractAddress: context.tokenAddress });',
  ]) {
    assert(networkBlockers(check(alias)).some((issue) => issue.ruleId === "endpoint-policy/binance-declaration-required"));
    assert.deepEqual(networkBlockers(check(alias, ENDPOINT)), []);
  }
});

test("Binance native fetch permits safe literal requests and encoded dynamic query values", (t) => {
  const check = fixture(t);
  assert.deepEqual(networkBlockers(check(staticFetch(`${ENDPOINT}?${QUERY}`), ENDPOINT)), []);
  const dynamic = check(dynamicFetch(`${ENDPOINT}?${DYNAMIC_QUERY}`), ENDPOINT);
  assert.deepEqual(networkBlockers(dynamic), []);
  const review = dynamic.review.externalEndpoints.find((item) => item.source === "fetch");
  assert.equal(review.origin, new URL(ENDPOINT).origin);
  assert.equal(review.pathname, new URL(ENDPOINT).pathname);
  assert.equal(review.dynamicQuery, true);
  assert.match(review.targetExpression, /chainId=.*context\.chainId.*contractAddress=.*context\.tokenAddress/);
  const encoded = `${ENDPOINT}?contractAddress=a%2fb%2Bc%3D%3D&chainId=56`;
  assert.deepEqual(networkBlockers(check(staticFetch(encoded), ENDPOINT)), []);
  assert.deepEqual(networkBlockers(check('void fetch("https://data.example.com/fixed");', "https://data.example.com/fixed")), []);
});

test("standalone Mini Apps share the Binance declaration and review rules", (t) => {
  const check = fixture(t, { standalone: true });
  const sdkSource = `void sdk.readBinanceTokenDynamicInfo({ chainId: 56, contractAddress: "${TOKEN}" });`;
  const nativeSource = dynamicFetch(`${ENDPOINT}?chainId=56&contractAddress=\${encodeURIComponent("${TOKEN}")}`);
  const approved = check(`${sdkSource}\n${nativeSource}`, ENDPOINT);
  assert.deepEqual(networkBlockers(approved), []);
  const sources = approved.review.externalEndpoints.map((item) => item.source);
  assert(sources.includes("sdk.readBinanceTokenDynamicInfo"));
  assert(sources.includes("fetch"));
  const missing = networkBlockers(check(`${sdkSource}\n${nativeSource}`));
  assert(missing.some((issue) => issue.ruleId === "endpoint-policy/binance-declaration-required"));
  assert(missing.some((issue) => issue.ruleId === "endpoint-policy/direct-fetch"));
});

test("new Binance readers and native requests require each operation's own endpoint and query", (t) => {
  const check = fixture(t, { standalone: true });
  const requests = [
    {
      method: "searchBinanceTokens",
      args: '{ keyword: "USDC" }',
      query: 'keyword=${encodeURIComponent("USDC")}&chainIds=56&orderBy=volume24h',
      invalid: ["chainIds=56", "keyword=USDC&keyword=USDT", "keyword=USDC&contractAddress=0x123"],
    },
    {
      method: "readBinanceTokenMetadata",
      args: `{ chainId: 56, contractAddress: "${TOKEN}" }`,
      query: `chainId=56&contractAddress=\${encodeURIComponent("${TOKEN}")}`,
      invalid: ["chainId=56", `${QUERY}&interval=1h`],
    },
    {
      method: "readBinanceTokenKlines",
      args: `{ chainId: 56, contractAddress: "${TOKEN}", interval: "1h" }`,
      query: `${QUERY}&interval=\${encodeURIComponent("1h")}&limit=4&startTime=1&endTime=10`,
      invalid: [QUERY, `${QUERY}&interval=1h&limit=1&limit=2`, `${QUERY}&interval=1h&orderBy=volume24h`],
    },
  ];

  for (const { method, args, query, invalid } of requests) {
    const { url } = BINANCE_TOKEN_MARKET_OPERATIONS[method];
    const sdk = `void sdk.${method}(${args});`;
    const direct = dynamicFetch(`${url}?${query}`);
    const approved = check(`${sdk}\n${direct}`, [ENDPOINT, url]);
    assert.deepEqual(networkBlockers(approved), []);
    assert(approved.review.externalEndpoints.some((item) => item.source === `sdk.${method}` && item.url === url));
    assert(approved.review.externalEndpoints.some((item) => item.source === "fetch" && item.pathname === new URL(url).pathname && item.dynamicQuery));
    const missing = networkBlockers(check(`${sdk}\n${direct}`, ENDPOINT));
    assert(missing.some((issue) => issue.ruleId === "endpoint-policy/binance-declaration-required"));
    assert(missing.some((issue) => issue.ruleId === "endpoint-policy/direct-fetch"));
    for (const invalidQuery of invalid) {
      assert(networkBlockers(check(staticFetch(`${url}?${invalidQuery}`), url)).length > 0, invalidQuery);
    }
  }
});

test("Binance native fetch blocks unsafe URLs, query pollution and request options", (t) => {
  const check = fixture(t);
  const declaredTarget = `${ENDPOINT}?${QUERY}`;
  const dynamicTarget = `${ENDPOINT}?${DYNAMIC_QUERY}`;
  const requests = [
    staticFetch(`${declaredTarget}&chainId=97`),
    staticFetch(`${ENDPOINT}?chainId=56&%63ontractAddress=${TOKEN}`),
    staticFetch(`${ENDPOINT}?chainId=56&other=${TOKEN}`),
    staticFetch(`${ENDPOINT}?chainId=56`),
    staticFetch(`${ENDPOINT}?chainId=56&contractAddress=a%2`),
    staticFetch(`${declaredTarget}\n`),
    staticFetch(`${declaredTarget}#fragment`),
    staticFetch(declaredTarget.replace("https://", "http://")),
    staticFetch(declaredTarget.replace("web3.binance.com", "web3.binance.com:443")),
    staticFetch(declaredTarget.replace("web3.binance.com", "web3.binance.com.attacker.invalid")),
    staticFetch(declaredTarget.replace("https://", "https://user:pass@")),
    staticFetch(declaredTarget.replace("/info?", "/%69nfo?")),
    staticFetch(declaredTarget.replace("/info?", "/other/../info?")),
    staticFetch(declaredTarget.replace("/info?", "/info/child?")),
    dynamicFetch(dynamicTarget.replace("/info?", "/other?")),
    dynamicFetch(dynamicTarget.replace("/info?", "/${context.chainId}?")),
    dynamicFetch(dynamicTarget.replace("encodeURIComponent(context.chainId)", "context.chainId")),
    dynamicFetch(dynamicTarget.replace("chainId=", "${encodeURIComponent('chainId')}=")),
    `const encodeURIComponent = (value: string) => value; ${dynamicFetch(dynamicTarget)}`,
    staticFetch(declaredTarget, SAFE_OPTIONS.replace('"GET"', '"POST"')),
    staticFetch(declaredTarget, SAFE_OPTIONS.replace('"omit"', '"include"')),
    staticFetch(declaredTarget, SAFE_OPTIONS.replace('"error"', '"follow"')),
    staticFetch(declaredTarget, SAFE_OPTIONS.replace('referrerPolicy: "no-referrer"', 'headers: {}')),
    staticFetch(declaredTarget, "{}"),
  ];
  for (const source of requests) assert(networkBlockers(check(source, ENDPOINT)).length > 0, source);
  for (const declaration of [undefined, new URL(ENDPOINT).origin, ` ${ENDPOINT}`, ENDPOINT.replace(".com/", ".com:443/"), declaredTarget]) {
    assert(networkBlockers(check(staticFetch(declaredTarget), declaration)).length > 0);
    assert(networkBlockers(check(dynamicFetch(dynamicTarget), declaration)).length > 0);
  }
});
