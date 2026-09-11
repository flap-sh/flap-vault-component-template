const BNB_USD_BINANCE_ENDPOINT =
  "https://api.binance.com/api/v3/avgPrice?symbol=BNBUSDT";

interface RuntimePriceOracleData {
  price: number;
  symbol: string;
  timestamp: number;
  source: "binance";
}

function readPositiveNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function loadBnbUsdFromBinance(
  fetchImpl: typeof fetch = fetch,
): Promise<RuntimePriceOracleData> {
  const response = await fetchImpl(BNB_USD_BINANCE_ENDPOINT, {
    cache: "no-store",
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`Runtime oracle request returned ${response.status}.`);
  }

  const data = (await response.json()) as {
    closeTime?: unknown;
    price?: unknown;
  } | null;
  const price = readPositiveNumber(data?.price);
  if (price === null) {
    throw new Error("BNB/USD Binance oracle response did not include a positive price.");
  }

  const closeTime = readPositiveNumber(data?.closeTime);
  return {
    price,
    symbol: "BNBUSDT",
    timestamp: Math.floor(closeTime === null ? Date.now() / 1000 : closeTime / 1000),
    source: "binance",
  };
}
