import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the source extension here.
// @ts-expect-error allowImportingTsExtensions is intentionally not global.
import { loadBnbUsdFromBinance } from "./binanceRuntimeOracle.ts";

const BINANCE_BNB_AVG_PRICE_ENDPOINT =
  "https://api.binance.com/api/v3/avgPrice?symbol=BNBUSDT";

test("loads the built-in BNB/USD price from Binance avgPrice", async () => {
  const calls: Array<{ endpoint: string; init?: RequestInit }> = [];
  const fetchImpl = (async (endpoint: string | URL | Request, init?: RequestInit) => {
    calls.push({ endpoint: String(endpoint), init });
    return new Response(
      JSON.stringify({ mins: 5, price: "687.01439139", closeTime: 1_788_166_351_723 }),
      { status: 200 },
    );
  }) as typeof fetch;

  const result = await loadBnbUsdFromBinance(fetchImpl);

  assert.deepEqual(result, {
    price: 687.01439139,
    source: "binance",
    symbol: "BNBUSDT",
    timestamp: 1_788_166_351,
  });
  assert.deepEqual(calls, [
    {
      endpoint: BINANCE_BNB_AVG_PRICE_ENDPOINT,
      init: { cache: "no-store", method: "GET" },
    },
  ]);
});

test("fails closed when Binance is unavailable instead of falling back to Pyth", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response("unavailable", { status: 503 });
  }) as typeof fetch;

  await assert.rejects(
    loadBnbUsdFromBinance(fetchImpl),
    /returned 503/i,
  );
  assert.equal(calls, 1);
});

test("rejects invalid Binance prices", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ price: "0", closeTime: 1_788_166_351_723 }), {
      status: 200,
    })) as typeof fetch;

  await assert.rejects(
    loadBnbUsdFromBinance(fetchImpl),
    /positive price/i,
  );
});
