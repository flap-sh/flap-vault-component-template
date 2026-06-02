import { fetchProvisionedOracle } from "./oracle";
import type { Address, OracleProvision, RuntimeOracleRegistry } from "./types";

export const FLAP_RUNTIME_ORACLE_REGISTRY_ENV = "FLAP_RUNTIME_ORACLE_REGISTRY";
const DEFAULT_EXAMPLE_ORACLE_SIGNATURE = "0x000000000000000000000000000000000000dEaD" as Address;
const BNB_USD_ORACLE_ID = "bnb-usd-price";
const BNB_USD_BINANCE_ENDPOINT = "https://api.binance.com/api/v3/avgPrice?symbol=BNBUSDT";
const BNB_USD_PYTH_ENDPOINT =
  "https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f&encoding=base64&parsed=true";

interface RuntimePriceOracleData {
  price: number;
  symbol: string;
  timestamp: number;
  source: "binance" | "pyth";
}

function normalizeHeaders(headers: unknown) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return undefined;
  const entries = Object.entries(headers)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => value);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizeAllowedParams(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const params = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return params.length ? params : undefined;
}

function normalizeProvision(value: unknown): OracleProvision | null {
  if (typeof value === "string") {
    return value.trim() ? { endpoint: value.trim() } : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.endpoint !== "string" || !record.endpoint.trim()) return null;

  return {
    endpoint: record.endpoint.trim(),
    headers: normalizeHeaders(record.headers),
    allowedParams: normalizeAllowedParams(record.allowedParams),
  };
}

export function parseRuntimeOracleRegistry(raw: string | undefined): RuntimeOracleRegistry {
  if (!raw?.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${FLAP_RUNTIME_ORACLE_REGISTRY_ENV} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${FLAP_RUNTIME_ORACLE_REGISTRY_ENV} must be a JSON object keyed by oracle id.`);
  }

  return Object.fromEntries(
    Object.entries(parsed)
      .map(([oracleId, provision]) => [oracleId, normalizeProvision(provision)] as const)
      .filter((entry): entry is [string, OracleProvision] => Boolean(entry[1])),
  );
}

export function resolveRuntimeOracleProvision(oracleId: string, registry: RuntimeOracleRegistry): OracleProvision | null {
  const provision = registry[oracleId];
  if (!provision) return null;
  return typeof provision === "string" ? { endpoint: provision } : provision;
}

export function loadDefaultRuntimeOracle<T>(oracleId: string): T | null {
  if (oracleId === "example-reward-oracle") {
    return {
      rewardMultiplierBps: 175,
      timestamp: Math.floor(Date.now() / 1000),
      signature: DEFAULT_EXAMPLE_ORACLE_SIGNATURE,
    } as T;
  }

  return null;
}

function readPositiveNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fetchJson(endpoint: string, fetchImpl?: typeof fetch): Promise<unknown> {
  const response = await (fetchImpl ?? fetch)(endpoint, {
    cache: "no-store",
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`Runtime oracle request returned ${response.status}.`);
  }
  return response.json();
}

async function loadBnbUsdFromBinance(fetchImpl?: typeof fetch): Promise<RuntimePriceOracleData> {
  const data = await fetchJson(BNB_USD_BINANCE_ENDPOINT, fetchImpl);
  const price = readPositiveNumber((data as { price?: unknown } | null)?.price);
  if (price === null) {
    throw new Error("BNB/USD Binance oracle response did not include a positive price.");
  }

  return {
    price,
    symbol: "BNBUSDT",
    timestamp: Math.floor(Date.now() / 1000),
    source: "binance",
  };
}

async function loadBnbUsdFromPyth(fetchImpl?: typeof fetch): Promise<RuntimePriceOracleData> {
  const data = await fetchJson(BNB_USD_PYTH_ENDPOINT, fetchImpl);
  const priceData = (data as { parsed?: Array<{ price?: { price?: unknown; expo?: unknown; publish_time?: unknown } }> } | null)?.parsed?.[0]?.price;
  const rawPrice = readPositiveNumber(priceData?.price);
  const exponent = typeof priceData?.expo === "number" ? priceData.expo : typeof priceData?.expo === "string" ? Number(priceData.expo) : NaN;
  if (rawPrice === null || !Number.isFinite(exponent)) {
    throw new Error("BNB/USD Pyth oracle response did not include a usable price.");
  }

  const price = rawPrice * 10 ** exponent;
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("BNB/USD Pyth oracle response produced an invalid price.");
  }

  return {
    price,
    symbol: "BNBUSD",
    timestamp: Math.floor(readPositiveNumber(priceData?.publish_time) ?? Date.now() / 1000),
    source: "pyth",
  };
}

async function loadBuiltinRuntimeOracle<T>(oracleId: string, fetchImpl?: typeof fetch): Promise<T | null> {
  if (oracleId !== BNB_USD_ORACLE_ID) return null;

  try {
    return (await loadBnbUsdFromBinance(fetchImpl)) as T;
  } catch {
    return (await loadBnbUsdFromPyth(fetchImpl)) as T;
  }
}

export async function loadRuntimeOracle<T>({
  oracleId,
  params,
  registry,
  fetchImpl,
}: {
  oracleId: string;
  params?: Record<string, string>;
  registry: RuntimeOracleRegistry;
  fetchImpl?: typeof fetch;
}): Promise<T | null> {
  const provision = resolveRuntimeOracleProvision(oracleId, registry);
  if (provision) {
    return fetchProvisionedOracle<T>({
      provision,
      params,
      fetchImpl,
    });
  }
  return loadBuiltinRuntimeOracle<T>(oracleId, fetchImpl);
}
