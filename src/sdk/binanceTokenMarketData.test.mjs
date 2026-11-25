import assert from "node:assert/strict";
import test from "node:test";
import { buildSync } from "esbuild";
import { BINANCE_TOKEN_DYNAMIC_INFO_ENDPOINT as endpoint, BINANCE_TOKEN_MARKET_OPERATIONS as operations } from "./binanceTokenPolicy.mjs";

const compiled = buildSync({
  entryPoints: ["src/sdk/binanceTokenMarketData.ts"], bundle: true, platform: "node", format: "esm", write: false,
});
const { createBinanceTokenMarketSdk, fetchBinanceTokenDynamicInfo } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);
const request = { chainId: 56, contractAddress: "0x55d398326f99059fF775485246999027B3197955" };
const data = { price: "0.999999999999999999", volume24h: "123456789.123456789", aggPrice: null, binanceDexSwitch: false };

test("reads public market data with fixed HTTPS GET, query encoding and optional abort signal", async () => {
  const signal = new AbortController().signal;
  const encodedRequest = { chainId: "8453", contractAddress: "token/a+b==&chainId=56#test" };
  const result = await fetchBinanceTokenDynamicInfo(["https://example.com/other", endpoint], encodedRequest, { signal }, async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, endpoint);
    assert.equal(parsed.hash, "");
    assert.deepEqual([...parsed.searchParams], Object.entries(encodedRequest));
    assert.deepEqual(init, { method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal });
    return Response.json({ code: "000000", message: null, data });
  });
  assert.deepEqual(result, data);
});

test("rejects other host, path and query declarations and invalid input before fetching", async () => {
  const fetchImpl = async () => assert.fail("Ineligible requests must not reach fetch.");
  for (const declaration of [undefined, "https://web3.binance.com", `${endpoint}/`, `${endpoint}?`, `${endpoint}?chainId=56`, endpoint.replace("web3.binance.com", "web3.binance.com.example.com"), endpoint.replace("/info", "/%69nfo")]) {
    await assert.rejects(fetchBinanceTokenDynamicInfo(declaration, request, undefined, fetchImpl), /manifest\.endpoints/);
  }
  for (const chainId of [0, -56, 1.2, Number.NaN, Number.MAX_SAFE_INTEGER + 1, "56&foo=bar", "1e3", " 56", "CT_501", undefined]) {
    await assert.rejects(fetchBinanceTokenDynamicInfo(endpoint, { ...request, chainId }, undefined, fetchImpl), /positive decimal chainId/);
  }
  for (const contractAddress of [undefined, null, "", " ", 42]) {
    await assert.rejects(fetchBinanceTokenDynamicInfo(endpoint, { ...request, contractAddress }, undefined, fetchImpl), /nonempty contractAddress/);
  }
});

test("surfaces HTTP, Binance API and malformed data failures", async () => {
  const read = (response) => fetchBinanceTokenDynamicInfo(endpoint, request, undefined, async () => response);
  await assert.rejects(read(new Response(null, { status: 429 })), /HTTP 429/);
  await assert.rejects(read(Response.json({ code: "100001", data })), /API code 100001/);
  await assert.rejects(read(Response.json({ data })), /invalid response/);
  await assert.rejects(read(Response.json({ code: "000000", data: null })), /invalid market data/);
  await assert.rejects(read(Response.json({ code: "000000", data: { price: Number.NaN, volume24h: 42 } })), /invalid market data/);
  await assert.rejects(read(new Response("<html>")), SyntaxError);
});

const baseToken = { chainId: "8453", contractAddress: "0x4200000000000000000000000000000000000006" };
const baseTokenData = { ...baseToken, name: "Wrapped Ether", symbol: "WETH", decimals: 18, links: [{ label: "website", link: "https://base.org" }] };
const candles = { decimals: 18, klineInfos: [[1700000000000, "0.999", "1.002", "0.998", "1.001", "0", 1700003599999]], cursor: "test" };
const marketReads = [
  ["readBinanceTokenDynamicInfo", baseToken, baseToken, data],
  ["searchBinanceTokens", { keyword: "USDT&chainIds=1", chainIds: [56, "8453"], orderBy: "volume24h" },
    { keyword: "USDT&chainIds=1", chainIds: "56,8453", orderBy: "volume24h" }, [{ symbol: "USDT", chainId: "56", price: "1.001", tagsInfo: [] }]],
  ["readBinanceTokenMetadata", baseToken, baseToken, baseTokenData],
  ["readBinanceTokenKlines", { ...request, interval: "1h", limit: 300, startTime: 1700000000000, endTime: 1700003599999 },
    { ...request, interval: "1h", limit: 300, startTime: 1700000000000, endTime: 1700003599999 }, candles],
];

test("routes all market reads to their individual declared endpoints with safe query values and request options", async (t) => {
  let endpoints;
  let responseData;
  const sdk = createBinanceTokenMarketSdk(() => endpoints);
  const { signal } = new AbortController();
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ code: "000000", data: responseData }));
  for (const [method, args, query, result] of marketReads) {
    const url = operations[method].url;
    endpoints = Object.values(operations).filter((operation) => operation.url !== url).map((operation) => operation.url);
    const count = fetch.mock.callCount();
    const read = sdk[method];
    await assert.rejects(read(args), /manifest\.endpoints/);
    assert.equal(fetch.mock.callCount(), count);

    endpoints = [url];
    responseData = result;
    assert.deepEqual(await read(args, { signal }), result);
    const [raw, options] = fetch.mock.calls.at(-1).arguments;
    const requestUrl = new URL(raw);
    assert.equal(requestUrl.origin + requestUrl.pathname, url);
    assert.deepEqual([...requestUrl.searchParams], Object.entries(query).map(([key, value]) => [key, String(value)]));
    assert.deepEqual(options, { method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal });

    endpoints = undefined;
    await assert.rejects(read(args), /manifest\.endpoints/);
    assert.equal(fetch.mock.callCount(), count + 1);
  }
});

test("supports optional search/K-line parameters and rejects invalid queries before fetching", async (t) => {
  const sdk = createBinanceTokenMarketSdk(() => Object.values(operations).map(({ url }) => url));
  const searchData = [];
  const fetch = t.mock.method(globalThis, "fetch", async (raw) => {
    return Response.json({ code: "000000", data: raw.startsWith(operations.searchBinanceTokens.url) ? searchData : candles });
  });
  assert.deepEqual(await sdk.searchBinanceTokens({ keyword: "USDT" }), searchData);
  assert.deepEqual(await sdk.searchBinanceTokens({ keyword: "WETH", chainIds: "56,8453" }), searchData);
  assert.deepEqual(await sdk.readBinanceTokenKlines({ ...baseToken, interval: "12h", endTime: 0 }), candles);
  assert.deepEqual(fetch.mock.calls.map(({ arguments: [raw] }) => [...new URL(raw).searchParams]), [
    [["keyword", "USDT"]], [["keyword", "WETH"], ["chainIds", "56,8453"]],
    [...Object.entries(baseToken), ["interval", "12h"], ["endTime", "0"]],
  ]);
  for (const args of [{ keyword: "  " }, { keyword: "test", orderBy: "" }, { keyword: "test", orderBy: 100 },
    { keyword: "test", chainIds: [] }, { keyword: "test", chainIds: "56,," }, { keyword: "test", chainIds: "56,CT_501" }]) {
    await assert.rejects(sdk.searchBinanceTokens(args), /keyword|orderBy|chainIds/);
  }
  for (const args of [{ interval: "2m" }, { limit: 0 }, { limit: 301 }, { limit: 1.5 }, { limit: "5" },
    { startTime: -1 }, { startTime: 1.5 }, { endTime: Number.MAX_SAFE_INTEGER + 1 }, { startTime: 2, endTime: 1 }]) {
    await assert.rejects(sdk.readBinanceTokenKlines({ ...request, interval: "1m", ...args }), /interval|limit|startTime|endTime/);
  }
  await assert.rejects(sdk.readBinanceTokenMetadata({ ...baseToken, chainId: "CT_501" }), /chainId/);
  assert.equal(fetch.mock.callCount(), 3);
});

test("validates token search, metadata, and K-line response shapes", async (t) => {
  const sdk = createBinanceTokenMarketSdk(() => Object.values(operations).map(({ url }) => url));
  let response;
  t.mock.method(globalThis, "fetch", async () => response);
  for (const [method, args, invalidData, error] of [
    ["searchBinanceTokens", { keyword: "USDT" }, { symbol: "USDT" }, /invalid search results/],
    ["searchBinanceTokens", { keyword: "USDT" }, [{ chainId: "56", price: 1 }], /invalid search results/],
    ["readBinanceTokenMetadata", baseToken, { decimals: "9" }, /invalid metadata/],
    ["readBinanceTokenKlines", { ...request, interval: "1m" }, { decimals: 18, klineInfos: [[1, "1", "1", "1", "1", 0, 2]] }, /invalid K-line data/],
    ["readBinanceTokenKlines", { ...request, interval: "1m" }, { decimals: 18, klineInfos: [[1, "1", "1", "1", "1", "0"]] }, /invalid K-line data/],
  ]) {
    response = Response.json({ code: "000000", data: invalidData });
    await assert.rejects(sdk[method](args), error);
  }
});


test("omitted search chain IDs retain only numeric chain results", async (t) => {
  const sdk = createBinanceTokenMarketSdk(() => operations.searchBinanceTokens.url);
  const bnb = { chainId: "56", symbol: "USDT" };
  const base = { chainId: "8453", symbol: "WETH" };
  t.mock.method(globalThis, "fetch", async (raw) => {
    const url = new URL(raw);
    assert.equal(url.searchParams.has("chainIds"), false);
    return Response.json({ code: "000000", data: [
      bnb, { chainId: "CT_501", symbol: "SOL" }, { chainId: 1, symbol: "ETH" }, { symbol: "UNKNOWN" }, base,
    ] });
  });
  assert.deepEqual(await sdk.searchBinanceTokens({ keyword: "token" }), [bnb, base]);
});
