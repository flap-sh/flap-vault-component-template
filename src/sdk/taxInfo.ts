import type {
  ActionAvailabilityStage,
  Address,
  FeeMode,
  FlapFeeVaultInfo,
  FlapTaxInfo,
  FlapTokenInfo,
  FlapVaultPortalInfo,
  ManifestBindingEntry,
  TokenMarketPhase,
  VaultHostContext,
  VaultManifest,
  VaultRenderSurface,
} from "./types";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

type TupleLike = (Record<string, unknown> & readonly unknown[]) | Record<string, unknown> | readonly unknown[] | null | undefined;

export interface VaultBindingPolicy {
  name: string;
  chainId: number;
  factoryAddress: Address;
  vaultAddresses?: Address[];
  extra?: Record<string, unknown>;
  isAiPowered?: boolean;
}

export interface RuntimeMatchInput {
  chainId?: number;
  factoryAddress?: string | null;
  tokenAddress?: string | null;
}

export interface CreateTaxInfoHostContextInput {
  tokenInfo?: FlapTokenInfo | null;
  taxInfo?: FlapTaxInfo | null;
  vaultInfo?: FlapVaultPortalInfo | null;
  feeMode?: FeeMode | null;
  giftVaultFactory?: string | null;
  hasTaxVaults?: boolean;
  vaultType?: string;
  copyScope?: "tax" | "fee";
}

export interface ResolveRenderSurfaceInput {
  tokenInfo?: FlapTokenInfo | null;
  taxInfo?: FlapTaxInfo | null;
  hasTaxVaults?: boolean;
  isNonTaxFeeToken?: boolean;
}

export interface TaxVaultHostSnapshot {
  tokenInfo?: FlapTokenInfo;
  taxInfo?: FlapTaxInfo | null;
  vaultInfo?: FlapVaultPortalInfo | null;
  feeMode: FeeMode;
  renderSurface: VaultRenderSurface;
  vaultType?: string;
  copyScope: "tax" | "fee";
  marketPhase: TokenMarketPhase;
  isListed: boolean;
  isTaxToken: boolean;
  isSupportedCustomVaultToken: boolean;
}

export function getTupleField(data: TupleLike, name: string, index: number) {
  if (!data) return undefined;
  const record = data as Record<string, unknown>;
  const tuple = data as readonly unknown[];
  return record[name] ?? tuple[index];
}

export function isValidAddress(value?: string | null): value is Address {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}

export function normalizeAddress(value?: string | null): Address | undefined {
  return isValidAddress(value) ? (value as Address) : undefined;
}

export function isSameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toBigInt(value: unknown, fallback = 0n) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function toBooleanOrNull(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return null;
  return Boolean(value);
}

function toAddressOrNull(value: unknown): Address | null {
  return typeof value === "string" && isValidAddress(value) ? (value as Address) : null;
}

function toStringOrUndefined(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parsePortalTokenInfo(tokenData: TupleLike): FlapTokenInfo | null {
  if (!tokenData) return null;

  const status = toNumber(getTupleField(tokenData, "status", 0));
  const taxRateRaw = toBigInt(getTupleField(tokenData, "taxRate", 12));
  const quoteTokenAddress = toAddressOrNull(getTupleField(tokenData, "quoteTokenAddress", 9)) ?? ZERO_ADDRESS;

  return {
    exists: status !== 0,
    isTaxToken: taxRateRaw > 0n,
    taxRate: Number(taxRateRaw),
    taxRateRaw,
    quoteTokenAddress,
    status,
    tokenVersion: toNumber(getTupleField(tokenData, "tokenVersion", 4)),
  };
}

export function parseFeeVaultInfo(vaultInfo: TupleLike): FlapFeeVaultInfo | null {
  if (!vaultInfo) return null;

  return {
    addr: toAddressOrNull(getTupleField(vaultInfo, "addr", 0)),
    factory: toAddressOrNull(getTupleField(vaultInfo, "factory", 1)),
    riskLevel: toNumber(getTupleField(vaultInfo, "riskLevel", 2)),
    isOfficialVault: toBooleanOrNull(getTupleField(vaultInfo, "isOfficialVault", 3)),
    isVault: toBooleanOrNull(getTupleField(vaultInfo, "isVault", 4)),
    isAIConsumer: toBooleanOrNull(getTupleField(vaultInfo, "isAIConsumer", 5)),
  };
}

export function parseTaxTokenInfo(
  taxInfo: TupleLike,
  taxInfoV2?: TupleLike,
  options: { wrappedNativeTokenAddress?: Address } = {},
): FlapTaxInfo | null {
  if (!taxInfo) return null;

  const quoteToken = toAddressOrNull(getTupleField(taxInfo, "quoteToken", 11)) ?? ZERO_ADDRESS;
  const rawDividendToken = toAddressOrNull(getTupleField(taxInfoV2, "dividendToken", 11)) ?? quoteToken;
  const dividendToken =
    quoteToken === ZERO_ADDRESS && rawDividendToken === ZERO_ADDRESS && options.wrappedNativeTokenAddress
      ? options.wrappedNativeTokenAddress
      : rawDividendToken;

  return {
    marketBps: toNumber(getTupleField(taxInfo, "marketBps", 0)),
    deflationBps: toNumber(getTupleField(taxInfo, "deflationBps", 1)),
    lpBps: toNumber(getTupleField(taxInfo, "lpBps", 2)),
    dividendBps: toNumber(getTupleField(taxInfo, "dividendBps", 3)),
    feeRate: toNumber(getTupleField(taxInfo, "feeRate", 4)),
    buyTaxRate: taxInfoV2 ? toNumber(getTupleField(taxInfoV2, "buyTaxRate", 4)) : undefined,
    sellTaxRate: taxInfoV2 ? toNumber(getTupleField(taxInfoV2, "sellTaxRate", 5)) : undefined,
    burntTokenAmount: toBigInt(getTupleField(taxInfo, "burntTokenAmount", 5)),
    totalQuoteSentToDividend: toBigInt(getTupleField(taxInfo, "totalQuoteSentToDividend", 6)),
    totalQuoteAddedToLiquidity: toBigInt(getTupleField(taxInfo, "totalQuoteAddedToLiquidity", 7)),
    totalTokenAddedToLiquidity: toBigInt(getTupleField(taxInfo, "totalTokenAddedToLiquidity", 8)),
    totalQuoteSentToMarketing: toBigInt(getTupleField(taxInfo, "totalQuoteSentToMarketing", 9)),
    marketingWallet: toAddressOrNull(getTupleField(taxInfo, "marketingWallet", 10)) ?? ZERO_ADDRESS,
    dividendToken,
    quoteToken,
    minimumShareBalance: toBigInt(getTupleField(taxInfo, "minimumShareBalance", 12)),
    vaultInfo: parseFeeVaultInfo(getTupleField(taxInfoV2, "vaultInfo", 14) as TupleLike),
  };
}

export function parseVaultPortalInfo(vaultData: TupleLike): FlapVaultPortalInfo | null {
  if (!vaultData) return null;

  const found = Boolean(getTupleField(vaultData, "found", 0));
  const info = getTupleField(vaultData, "info", 1) as TupleLike;

  if (!found || !info) return { found: false };

  return {
    found: true,
    vault: toAddressOrNull(getTupleField(info, "vault", 0)) ?? ZERO_ADDRESS,
    vaultFactory: toAddressOrNull(getTupleField(info, "vaultFactory", 1)) ?? ZERO_ADDRESS,
    description: toStringOrUndefined(getTupleField(info, "description", 2)),
    isOfficial: Boolean(getTupleField(info, "isOfficial", 3)),
    riskLevel: toNumber(getTupleField(info, "riskLevel", 4)),
  };
}

export function resolveManifestBinding(manifest: Pick<VaultManifest, "match">, input: RuntimeMatchInput): ManifestBindingEntry | null {
  const bindings = manifest.match.bindings;
  if (!bindings.length) return null;

  const resolveUnique = (candidates: ManifestBindingEntry[]) => {
    if (candidates.length === 1) return candidates[0];
    return null;
  };

  if (input.chainId && input.factoryAddress) {
    return resolveUnique(bindings.filter((binding) => binding.chainId === input.chainId && isSameAddress(binding.factoryAddress, input.factoryAddress)));
  }

  if (input.chainId) {
    return resolveUnique(bindings.filter((binding) => binding.chainId === input.chainId));
  }

  if (input.factoryAddress) {
    return resolveUnique(bindings.filter((binding) => isSameAddress(binding.factoryAddress, input.factoryAddress)));
  }

  return null;
}

export function isManifestRuntimeMatch(manifest: Pick<VaultManifest, "match">, input: RuntimeMatchInput) {
  if (!input.chainId || !input.factoryAddress) return false;
  const matchingBinding = resolveManifestBinding(manifest, input);
  if (!matchingBinding) return false;
  return matchingBinding.chainId === input.chainId && isSameAddress(matchingBinding.factoryAddress, input.factoryAddress);
}

export function isVaultBindingMatch(binding: VaultBindingPolicy, input: RuntimeMatchInput) {
  if (!input.chainId || binding.chainId !== input.chainId) return false;
  if (!input.factoryAddress || !isSameAddress(binding.factoryAddress, input.factoryAddress)) return false;
  return true;
}

export function resolveVaultBinding(bindings: VaultBindingPolicy[], input: RuntimeMatchInput) {
  return bindings.find((binding) => isVaultBindingMatch(binding, input)) ?? null;
}

export function resolveFeeMode(taxInfo: FlapTaxInfo | TupleLike | null | undefined, giftVaultFactory?: string | null): FeeMode {
  if (!taxInfo) return "unknown";

  const marketBps = toNumber(getTupleField(taxInfo as TupleLike, "marketBps", 0));
  const dividendBps = toNumber(getTupleField(taxInfo as TupleLike, "dividendBps", 3));

  if (dividendBps > 0) return "holder";
  if (marketBps <= 0) return "unknown";

  const parsedVaultInfo =
    "vaultInfo" in Object(taxInfo)
      ? (taxInfo as FlapTaxInfo).vaultInfo
      : parseFeeVaultInfo(getTupleField(taxInfo as TupleLike, "vaultInfo", 14) as TupleLike);

  if (parsedVaultInfo?.isVault === true) {
    return isSameAddress(parsedVaultInfo.factory, giftVaultFactory) ? "gift" : "unknown";
  }

  return "creator";
}

export function resolveTaxInfoRenderSurface({
  tokenInfo,
  taxInfo,
  hasTaxVaults = false,
  isNonTaxFeeToken = false,
}: ResolveRenderSurfaceInput): VaultRenderSurface {
  if (!tokenInfo?.exists) return "unavailable";
  if (!tokenInfo.isTaxToken) return isNonTaxFeeToken ? "feeinfo" : "unavailable";
  if (taxInfo?.marketBps === 10000 && hasTaxVaults) return "vault-taxinfo";
  return "standard-taxinfo";
}

export function resolveTokenMarketPhase(tokenInfo?: FlapTokenInfo | null): TokenMarketPhase {
  if (!tokenInfo?.exists) return "unknown";
  return tokenInfo.status >= 2 ? "dex-listed" : "internal-market";
}

export function isCustomVaultTaxToken(tokenInfo?: FlapTokenInfo | null) {
  return Boolean(tokenInfo?.exists && tokenInfo.isTaxToken);
}

export function isActionAvailableForPhase(stage: ActionAvailabilityStage, marketPhase: TokenMarketPhase = "unknown") {
  if (stage === "read-only") return false;
  if (stage === "both") return true;
  if (marketPhase === "unknown") return false;
  return stage === marketPhase;
}

export function createTaxInfoHostContext({
  tokenInfo,
  taxInfo,
  vaultInfo,
  feeMode,
  giftVaultFactory,
  hasTaxVaults,
  vaultType,
  copyScope = "tax",
}: CreateTaxInfoHostContextInput): VaultHostContext {
  const resolvedFeeMode = feeMode ?? resolveFeeMode(taxInfo, giftVaultFactory);
  const renderSurface = resolveTaxInfoRenderSurface({
    tokenInfo,
    taxInfo,
    hasTaxVaults: hasTaxVaults ?? Boolean(vaultInfo?.found),
    isNonTaxFeeToken: copyScope === "fee",
  });
  const marketPhase = resolveTokenMarketPhase(tokenInfo);

  return {
    tokenInfo: tokenInfo ?? undefined,
    taxInfo: taxInfo ?? null,
    vaultInfo: vaultInfo ?? null,
    feeMode: resolvedFeeMode,
    renderSurface,
    vaultType,
    copyScope,
    isListed: tokenInfo ? tokenInfo.status >= 2 : undefined,
    marketPhase,
  };
}

export function readTaxVaultHostContext(host?: VaultHostContext | null): TaxVaultHostSnapshot {
  const tokenInfo = host?.tokenInfo;
  const marketPhase = host?.marketPhase ?? resolveTokenMarketPhase(tokenInfo);
  const isListed = host?.isListed ?? Boolean(tokenInfo && tokenInfo.status >= 2);
  const isTaxToken = tokenInfo?.isTaxToken === true;

  return {
    tokenInfo,
    taxInfo: host?.taxInfo ?? null,
    vaultInfo: host?.vaultInfo ?? null,
    feeMode: host?.feeMode ?? "unknown",
    renderSurface: host?.renderSurface ?? "unavailable",
    vaultType: host?.vaultType,
    copyScope: host?.copyScope ?? "tax",
    marketPhase,
    isListed,
    isTaxToken,
    isSupportedCustomVaultToken: isCustomVaultTaxToken(tokenInfo),
  };
}
