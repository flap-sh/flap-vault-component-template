const walletApi = "https://web3.binance.com/bapi/defi";

/** Fixed public reads. Each operation requires its own exact query-free manifest URL. */
export const BINANCE_TOKEN_MARKET_OPERATIONS = {
  readBinanceTokenDynamicInfo: {
    url: `${walletApi}/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info`,
    requiredQueryKeys: ["chainId", "contractAddress"],
    optionalQueryKeys: [],
    runtimeFeature: "binanceTokenDynamicInfo",
  },
  searchBinanceTokens: {
    url: `${walletApi}/v5/public/wallet-direct/buw/wallet/market/token/search/ai`,
    requiredQueryKeys: ["keyword"],
    optionalQueryKeys: ["chainIds", "orderBy"],
    runtimeFeature: "binanceTokenMarketData",
  },
  readBinanceTokenMetadata: {
    url: `${walletApi}/v1/public/wallet-direct/buw/wallet/dex/market/token/meta/info/ai`,
    requiredQueryKeys: ["chainId", "contractAddress"],
    optionalQueryKeys: [],
    runtimeFeature: "binanceTokenMarketData",
  },
  readBinanceTokenKlines: {
    url: `${walletApi}/v1/public/wallet-direct/buw/wallet/dex/market/token/kline/ai`,
    requiredQueryKeys: ["chainId", "contractAddress", "interval"],
    optionalQueryKeys: ["limit", "startTime", "endTime"],
    runtimeFeature: "binanceTokenMarketData",
  },
};

export const BINANCE_TOKEN_DYNAMIC_INFO_ENDPOINT = BINANCE_TOKEN_MARKET_OPERATIONS.readBinanceTokenDynamicInfo.url;

export function hasBinanceTokenMarketDeclaration(endpoints, url) {
  return endpoints === url || (Array.isArray(endpoints) && endpoints.includes(url));
}
