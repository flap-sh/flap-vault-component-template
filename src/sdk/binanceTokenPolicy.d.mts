type BinanceTokenMarketOperation = {
  readonly url: string;
  readonly requiredQueryKeys: readonly string[];
  readonly optionalQueryKeys: readonly string[];
  readonly runtimeFeature: "binanceTokenDynamicInfo" | "binanceTokenMarketData";
};

export const BINANCE_TOKEN_MARKET_OPERATIONS: Readonly<Record<
  "readBinanceTokenDynamicInfo" | "searchBinanceTokens" | "readBinanceTokenMetadata" | "readBinanceTokenKlines",
  BinanceTokenMarketOperation
>>;
export const BINANCE_TOKEN_DYNAMIC_INFO_ENDPOINT: string;
export function hasBinanceTokenMarketDeclaration(endpoints: unknown, url: string): boolean;
