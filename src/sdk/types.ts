import type { Abi, PublicClient } from "viem";

export type Address = `0x${string}`;

export interface PaymentToken {
  address: Address;
  symbol: string;
  decimals: number;
  isNative?: boolean;
}

export type FeeMode = "creator" | "holder" | "gift" | "unknown";

export type VaultRenderSurface = "standard-taxinfo" | "vault-taxinfo" | "feeinfo" | "unavailable";

export type TokenMarketPhase = "unknown" | "internal-market" | "dex-listed";

export type ActionAvailabilityStage = "internal-market" | "dex-listed" | "both" | "read-only";

export interface FlapTokenInfo {
  exists: boolean;
  isTaxToken: boolean;
  taxRate: number;
  taxRateRaw?: bigint;
  quoteTokenAddress?: Address;
  status: number;
  tokenVersion: number;
}

export interface FlapFeeVaultInfo {
  addr?: Address | null;
  factory?: Address | null;
  riskLevel?: number | null;
  isOfficialVault?: boolean | null;
  isVault?: boolean | null;
  isAIConsumer?: boolean | null;
}

export interface FlapTaxInfo {
  marketBps: number;
  deflationBps: number;
  lpBps: number;
  dividendBps: number;
  feeRate: number;
  buyTaxRate?: number;
  sellTaxRate?: number;
  burntTokenAmount?: bigint;
  totalQuoteSentToDividend?: bigint;
  totalQuoteAddedToLiquidity?: bigint;
  totalTokenAddedToLiquidity?: bigint;
  totalQuoteSentToMarketing?: bigint;
  marketingWallet?: Address;
  dividendToken?: Address;
  quoteToken?: Address;
  minimumShareBalance?: bigint;
  vaultInfo?: FlapFeeVaultInfo | null;
}

export interface FlapVaultPortalInfo {
  found: boolean;
  vault?: Address;
  vaultFactory?: Address;
  description?: string;
  isOfficial?: boolean;
  riskLevel?: number;
}

export interface VaultHostContext {
  tokenInfo?: FlapTokenInfo;
  taxInfo?: FlapTaxInfo | null;
  vaultInfo?: FlapVaultPortalInfo | null;
  feeMode?: FeeMode;
  renderSurface?: VaultRenderSurface;
  vaultType?: string;
  copyScope?: "tax" | "fee";
  isListed?: boolean;
  marketPhase?: TokenMarketPhase;
}

export interface TokenMetadataSnapshot {
  tokenSymbol?: string;
  tokenName?: string;
}

export interface TokenRuntimeSnapshot extends TokenMetadataSnapshot {
  tokenInfo?: FlapTokenInfo | null;
  taxInfo?: FlapTaxInfo | null;
  vaultInfo?: FlapVaultPortalInfo | null;
  host?: VaultHostContext;
  giftVaultFactory?: Address;
  paymentToken?: PaymentToken;
  copyScope: "tax";
  hasTaxVaults: boolean;
  hostReadSupported: boolean;
  hostReadFromChain: boolean;
}

export type HostRuntimeStatus = "full-host" | "onchain" | "unavailable";

export type HostRuntimePolicy = "prefer-full-host" | "require-full-host";

export type HostRuntimeDegradeReason =
  | "invalid-token-address"
  | "unsupported-chain"
  | "chain-read-unavailable"
  | "token-not-found"
  | "token-not-tax"
  | "host-presentation-not-configured"
  | "host-presentation-unavailable"
  | "host-presentation-required";

export type HostRuntimeWarning =
  | "tax-info-unavailable"
  | "payment-token-unavailable"
  | "vault-address-unavailable"
  | "factory-address-unavailable";

export type HostRuntimeDataSource = "host-proxy" | "onchain" | "unavailable";

export interface HostRuntimeSources {
  tokenMetadata: HostRuntimeDataSource;
  taxState: HostRuntimeDataSource;
  vaultState: HostRuntimeDataSource;
  presentation: HostRuntimeDataSource;
}

export interface HostTokenPresentation {
  tokenSymbol?: string;
  tokenName?: string;
  tokenImageUrl?: string;
  tokenDetailHref?: string;
  chainHref?: string;
  extraConfig?: Record<string, unknown>;
}

export interface HostRuntimeAddresses {
  chainId: number;
  tokenAddress: Address;
  factoryAddress?: Address;
  vaultAddress?: Address;
  factoryAddressHint?: Address;
  vaultAddressHint?: Address;
}

export interface HostRuntimePresentationRequest {
  chainId: number;
  tokenAddress: Address;
  factoryAddress?: Address;
  vaultAddress?: Address;
  snapshot: TokenRuntimeSnapshot;
}

export type HostRuntimePresentationFetcher = (request: HostRuntimePresentationRequest) => Promise<HostTokenPresentation | null>;

export interface HostRuntimeInput {
  publicClient: PublicClient;
  chainId: number;
  tokenAddress: Address;
  factoryAddressHint?: Address;
  vaultAddressHint?: Address;
  policy?: HostRuntimePolicy;
  presentationFetcher?: HostRuntimePresentationFetcher;
}

export interface HostRuntimeResult {
  status: HostRuntimeStatus;
  policy: HostRuntimePolicy;
  degradeReason?: HostRuntimeDegradeReason;
  warnings: HostRuntimeWarning[];
  addresses: HostRuntimeAddresses;
  snapshot: TokenRuntimeSnapshot | null;
  host?: VaultHostContext;
  paymentToken?: PaymentToken;
  tokenSymbol?: string;
  tokenName?: string;
  tokenImageUrl?: string;
  tokenDetailHref?: string;
  chainHref?: string;
  presentation?: HostTokenPresentation | null;
  sources: HostRuntimeSources;
}

export interface VaultRuntimeExtraConfig extends Record<string, unknown> {
  previewFixture?: boolean;
  tokenUnavailable?: boolean;
  tokenDetailHref?: string;
  chainHref?: string;
  /** Legacy preview-only fallback. Prefer runtime-level oracleReader provisioning. */
  oracleEndpoints?: Record<string, string>;
  hostRuntimeStatus?: HostRuntimeStatus;
  hostRuntimePolicy?: HostRuntimePolicy;
  hostRuntimeDegradeReason?: HostRuntimeDegradeReason;
  hostRuntimeWarnings?: HostRuntimeWarning[];
}

export interface ManifestBindingEntry {
  chainId: number;
  factoryAddress?: Address;
  vaultAddresses?: Address[];
  tokenAddresses?: Address[];
  externalContracts?: ManifestExternalContract[];
}

export interface ManifestExternalContract {
  address: Address;
  label: string;
}

export interface VaultManifest {
  artifactId: string;
  name: string;
  match: {
    bindings: ManifestBindingEntry[];
  };
  endpoints?: EndpointPolicy;
  i18n: string[];
}

export type EndpointPolicy = string | string[];

export interface VaultRuntimeContext {
  chainId: number;
  factoryAddress: Address;
  tokenAddress: Address;
  vaultAddress: Address;
  userAddress?: Address;
  tokenSymbol?: string;
  tokenName?: string;
  tokenImageUrl?: string;
  explorerBaseUrl?: string;
  paymentToken?: PaymentToken;
  host?: VaultHostContext;
  extraConfig?: VaultRuntimeExtraConfig;
  manifest: VaultManifest;
}

export interface VaultRuntimeContextOverrides extends Partial<Omit<VaultRuntimeContext, "manifest" | "extraConfig">> {
  extraConfig?: VaultRuntimeExtraConfig;
}

export interface OracleProvision {
  endpoint: string;
  headers?: Record<string, string>;
  allowedParams?: string[];
}

export type RuntimeOracleRegistry = Record<string, OracleProvision | string>;

export interface OracleReadRequest {
  oracleId: string;
  params?: Record<string, string>;
  context: VaultRuntimeContext;
}

export type OracleReader = <T = unknown>(request: OracleReadRequest) => Promise<T>;

export interface CreateVaultRuntimeContextInput {
  manifest: VaultManifest;
  connectedChainId?: number;
  hostRuntimeResult?: HostRuntimeResult | null;
  runtimeOverrides?: VaultRuntimeContextOverrides;
}

export interface ContractReadRequest {
  /** Optional human-readable label for the target contract (e.g. "vault", "token"). Advisory only; the runtime keys off `address` + `abi`. */
  contract?: string;
  address?: Address;
  abi?: Abi;
  functionName: string;
  args?: unknown[];
  /** Optional call account for view functions that depend on msg.sender. */
  account?: Address;
}

export interface ContractWriteRequest extends ContractReadRequest {
  value?: bigint;
}

export interface SimulateResult {
  request: ContractWriteRequest;
  result?: unknown;
}

export interface TxReceipt {
  hash: Address;
  status: "success" | "reverted";
}

export interface FlapNotify {
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export interface FlapI18n {
  locale: string;
  t(key: string, fallback?: string, params?: Record<string, string | number>): string;
}

export interface FlapWallet {
  address?: Address;
  chainId?: number;
  chainLabel?: string;
  requiredChainId: number;
  requiredChainLabel: string;
  isConnected: boolean;
  isWrongNetwork: boolean;
  canSwitchChain: boolean;
  isSwitchingChain: boolean;
  balance: string;
  connect(): void;
  disconnect(): void;
  switchChain(): Promise<void>;
}

export interface FlapVaultSdk {
  context: VaultRuntimeContext;
  i18n: FlapI18n;
  notify: FlapNotify;
  wallet: FlapWallet;
  readContract<T = unknown>(request: ContractReadRequest): Promise<T>;
  simulateContract(request: ContractWriteRequest): Promise<SimulateResult>;
  writeContract(request: ContractWriteRequest): Promise<Address>;
  waitForTx(hash: Address): Promise<TxReceipt>;
  readOracle<T = unknown>(oracleId: string, params?: Record<string, string>): Promise<T>;
  /**
   * Triggers a reload by incrementing `refetchNonce`. Components that want
   * automatic reloads should include `sdk.refetchNonce` in their effect deps.
   * The optional `keys` argument is reserved for future scoped invalidation and
   * is currently advisory only.
   */
  refetch(keys?: string[]): Promise<void>;
  /**
   * Monotonic counter that changes every time `refetch()` is called. Add it to a
   * `useEffect` dependency array to re-run reads after `refetch()`.
   */
  refetchNonce: number;
  openExplorerTx(hash: Address): void;
}

export interface VaultComponentProps {
  sdk?: FlapVaultSdk;
  context?: VaultRuntimeContext;
}
