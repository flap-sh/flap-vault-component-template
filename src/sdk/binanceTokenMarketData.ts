import { BINANCE_TOKEN_MARKET_OPERATIONS, hasBinanceTokenMarketDeclaration } from "./binanceTokenPolicy.mjs";
import type { VaultManifest } from "./types";

export const BINANCE_TOKEN_DYNAMIC_INFO_VERSION = 1;
export const BINANCE_TOKEN_MARKET_DATA_VERSION = 1;

export type BinanceTokenChainId = string | number;

export interface BinanceTokenDynamicInfoRequest {
  chainId: BinanceTokenChainId;
  contractAddress: string;
}

export interface BinanceTokenMarketOptions {
  signal?: AbortSignal;
}

export type BinanceTokenDynamicInfoOptions = BinanceTokenMarketOptions;

export interface BinanceTokenDynamicInfo {
  price?: string | null;
  aggPrice?: string | null;
  nativeTokenPrice?: string | null;
  volume24h?: string | null;
  volume24hBuy?: string | null;
  volume24hSell?: string | null;
  [key: string]: unknown;
}

export interface BinanceTokenSearchRequest {
  keyword: string;
  chainIds?: string | readonly BinanceTokenChainId[];
  orderBy?: string;
}

interface BinanceTokenSummary {
  chainId?: string | null;
  contractAddress?: string | null;
  tokenId?: string | null;
  name?: string | null;
  symbol?: string | null;
  icon?: string | null;
  [key: string]: unknown;
}

export interface BinanceTokenSearchResult extends BinanceTokenSummary {
  chainId: string;
  price?: string | null;
  percentChange24h?: string | null;
  volume24h?: string | null;
  marketCap?: string | null;
  liquidity?: string | null;
}

export interface BinanceTokenMetadata extends BinanceTokenSummary {
  chainName?: string | null;
  chainIconUrl?: string | null;
  creatorAddress?: string | null;
  decimals?: number | null;
  description?: string | null;
}

export type BinanceTokenMetadataRequest = BinanceTokenDynamicInfoRequest;

const KLINE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "12h", "1d"] as const;
export type BinanceTokenKlineInterval = (typeof KLINE_INTERVALS)[number];

export interface BinanceTokenKlinesRequest extends BinanceTokenDynamicInfoRequest {
  interval: BinanceTokenKlineInterval;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

export type BinanceTokenKline = [
  openTimeMs: number,
  open: string,
  high: string,
  low: string,
  close: string,
  reserved: string,
  closeTimeMs: number,
];

export interface BinanceTokenKlines {
  decimals: number;
  klineInfos: BinanceTokenKline[];
  [key: string]: unknown;
}

export interface BinanceTokenMarketSdk {
  /** Reads public Binance Web3 token market data from the manifest-declared endpoint. */
  readBinanceTokenDynamicInfo(request: BinanceTokenDynamicInfoRequest, options?: BinanceTokenDynamicInfoOptions): Promise<BinanceTokenDynamicInfo>;
  searchBinanceTokens(request: BinanceTokenSearchRequest, options?: BinanceTokenMarketOptions): Promise<BinanceTokenSearchResult[]>;
  readBinanceTokenMetadata(request: BinanceTokenMetadataRequest, options?: BinanceTokenMarketOptions): Promise<BinanceTokenMetadata>;
  readBinanceTokenKlines(request: BinanceTokenKlinesRequest, options?: BinanceTokenMarketOptions): Promise<BinanceTokenKlines>;
}

const DYNAMIC_INFO_FIELDS = ["price", "aggPrice", "nativeTokenPrice", "volume24h", "volume24hBuy", "volume24hSell"];
const TOKEN_SUMMARY_FIELDS = ["chainId", "contractAddress", "tokenId", "name", "symbol", "icon"];
const SEARCH_FIELDS = [...TOKEN_SUMMARY_FIELDS, "price", "percentChange24h", "volume24h", "marketCap", "liquidity"];
const METADATA_FIELDS = [...TOKEN_SUMMARY_FIELDS, "chainName", "chainIconUrl", "creatorAddress", "description"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasStringFields(value: unknown, fields: string[]): value is Record<string, unknown> {
  return isRecord(value) && fields.every((field) => value[field] == null || typeof value[field] === "string");
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isKline(value: unknown): value is BinanceTokenKline {
  return Array.isArray(value) && value.length === 7
    && isNonnegativeInteger(value[0]) && value.slice(1, 6).every((field) => typeof field === "string")
    && isNonnegativeInteger(value[6]);
}

function isDecimalChainId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value);
}

function chainIdValue(value: unknown, label: string, parameter = "chainId") {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (isDecimalChainId(value)) return value;
  throw new Error(`${label} requires a positive decimal ${parameter}.`);
}

function tokenQuery(request: BinanceTokenDynamicInfoRequest, label: string) {
  const chainId = chainIdValue(request?.chainId, label);
  const contractAddress = request?.contractAddress;
  if (typeof contractAddress !== "string" || !contractAddress.trim()) {
    throw new Error(`${label} requires a nonempty contractAddress.`);
  }
  return { chainId, contractAddress };
}

function searchQuery(request: BinanceTokenSearchRequest, label: string) {
  const keyword = request?.keyword;
  if (typeof keyword !== "string" || !keyword.trim()) throw new Error(`${label} requires a nonempty keyword.`);
  const params: Record<string, string> = { keyword };
  const { chainIds, orderBy } = request;
  if (chainIds !== undefined) {
    const values = typeof chainIds === "string" ? chainIds.split(",") : chainIds;
    if (!Array.isArray(values) || !values.length) throw new Error(`${label} requires at least one chain ID in chainIds.`);
    params.chainIds = values.map((value) => chainIdValue(value, label, "chainIds value")).join(",");
  }
  if (orderBy !== undefined) {
    if (typeof orderBy !== "string" || !orderBy.trim()) throw new Error(`${label} requires a nonempty orderBy string.`);
    params.orderBy = orderBy;
  }
  return params;
}

function klinesQuery(request: BinanceTokenKlinesRequest, label: string) {
  const params: Record<string, string> = tokenQuery(request, label);
  const { interval, limit, startTime, endTime } = request;
  if (!KLINE_INTERVALS.includes(interval)) throw new Error(`${label} requires a supported interval.`);
  params.interval = interval;
  if (limit !== undefined) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 300) throw new Error(`${label} requires an integer limit between 1 and 300.`);
    params.limit = String(limit);
  }
  for (const [name, value] of [["startTime", startTime], ["endTime", endTime]] as const) {
    if (value === undefined) continue;
    if (!isNonnegativeInteger(value)) throw new Error(`${label} requires ${name} to be a safe nonnegative millisecond timestamp.`);
    params[name] = String(value);
  }
  if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
    throw new Error(`${label} requires startTime to be no later than endTime.`);
  }
  return params;
}

async function fetchBinanceMarketData(
  endpoints: VaultManifest["endpoints"],
  endpoint: string,
  label: string,
  query: Record<string, string>,
  options: BinanceTokenMarketOptions | undefined,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  if (!hasBinanceTokenMarketDeclaration(endpoints, endpoint)) {
    throw new Error(`${label} requires ${endpoint} in manifest.endpoints for review.`);
  }
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetchImpl(url.href, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal: options?.signal,
  });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);

  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.code !== "string") throw new Error(`${label} returned an invalid response.`);
  if (body.code !== "000000") throw new Error(`${label} returned API code ${body.code}.`);
  return body.data;
}

export async function fetchBinanceTokenDynamicInfo(
  endpoints: VaultManifest["endpoints"],
  request: BinanceTokenDynamicInfoRequest,
  options?: BinanceTokenDynamicInfoOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<BinanceTokenDynamicInfo> {
  const label = "Binance token dynamic info";
  const data = await fetchBinanceMarketData(endpoints, BINANCE_TOKEN_MARKET_OPERATIONS.readBinanceTokenDynamicInfo.url, label, tokenQuery(request, label), options, fetchImpl);
  if (!hasStringFields(data, DYNAMIC_INFO_FIELDS)) throw new Error(`${label} returned invalid market data.`);
  return data;
}

/** Bind all four readers to a host-owned manifest, including across provider updates. */
export function createBinanceTokenMarketSdk(getEndpoints: () => VaultManifest["endpoints"]): BinanceTokenMarketSdk {
  return {
    readBinanceTokenDynamicInfo: (request, options) => fetchBinanceTokenDynamicInfo(getEndpoints(), request, options),
    async searchBinanceTokens(request, options) {
      const label = "Binance token search";
      const data = await fetchBinanceMarketData(getEndpoints(), BINANCE_TOKEN_MARKET_OPERATIONS.searchBinanceTokens.url, label, searchQuery(request, label), options, fetch);
      if (!Array.isArray(data) || !data.every(isRecord)) throw new Error(`${label} returned invalid search results.`);
      const results = data.filter((item): item is Record<string, unknown> & { chainId: string } => isDecimalChainId(item.chainId));
      if (!results.every((item) => hasStringFields(item, SEARCH_FIELDS))) throw new Error(`${label} returned invalid search results.`);
      return results;
    },
    async readBinanceTokenMetadata(request, options) {
      const label = "Binance token metadata";
      const data = await fetchBinanceMarketData(getEndpoints(), BINANCE_TOKEN_MARKET_OPERATIONS.readBinanceTokenMetadata.url, label, tokenQuery(request, label), options, fetch);
      if (!hasStringFields(data, METADATA_FIELDS) || (data.decimals != null && !isNonnegativeInteger(data.decimals))) {
        throw new Error(`${label} returned invalid metadata.`);
      }
      return data;
    },
    async readBinanceTokenKlines(request, options) {
      const label = "Binance token K-lines";
      const data = await fetchBinanceMarketData(getEndpoints(), BINANCE_TOKEN_MARKET_OPERATIONS.readBinanceTokenKlines.url, label, klinesQuery(request, label), options, fetch);
      if (!isRecord(data) || !isNonnegativeInteger(data.decimals) || !Array.isArray(data.klineInfos) || !data.klineInfos.every(isKline)) {
        throw new Error(`${label} returned invalid K-line data.`);
      }
      return { ...data, decimals: data.decimals, klineInfos: data.klineInfos };
    },
  };
}
