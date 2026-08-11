"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Copy, ExternalLink, Maximize2, Minimize2, X } from "lucide-react";
import { useChainId, usePublicClient } from "wagmi";
import type { Address, FeeMode, PaymentToken, TokenMarketPhase, VaultHostContext, VaultManifest, VaultRenderSurface, VaultRuntimeContextOverrides } from "@/src/sdk";
import {
  createLocalOracleReader,
  shortenAddress,
  useVaultContext,
  VaultRuntimeProvider,
} from "@/src/sdk";
import type { HostRuntimePolicy, HostRuntimeResult, TokenRuntimeSnapshot } from "@/src/sdk/host";
import {
  createTaxInfoHostContext,
  createVaultRuntimeContext,
  isValidAddress,
  parsePortalTokenInfo,
  parseTaxTokenInfo,
  parseVaultPortalInfo,
  resolveManifestBinding,
  runHostRuntime,
  ZERO_ADDRESS,
} from "@/src/sdk/host";
import { createLocalHostPresentationFetcher } from "@/src/sdk/hostPresentation";
import { useLang } from "@/src/i18n/useLang";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/ui/Card";
import { FlapNavbar } from "./FlapNavbar";
import { ManifestPanel } from "./ManifestPanel";
import { getDefaultVaultPreviewTokenAddress, PREVIEW_TOKEN_ADDRESS, PREVIEW_TOKEN_IMAGE_URL, PREVIEW_VAULT_ADDRESS } from "./previewCoinDetail";
import { getPreviewRuntimeDefaults } from "./previewRuntimeDefaults";

interface FlapPreviewShellProps {
  folderName: string;
  manifest: VaultManifest;
  i18n: Record<string, Record<string, string>>;
  children: ReactNode;
}

type SearchParamsLike = Pick<URLSearchParams, "get">;

function readAddressParam(searchParams: SearchParamsLike, ...keys: string[]) {
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value?.match(/^0x[a-fA-F0-9]{40}$/)) return value as Address;
  }
  return undefined;
}

function readStringParam(searchParams: SearchParamsLike, ...keys: string[]) {
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) return value;
  }
  return undefined;
}

function readNumberParam(searchParams: SearchParamsLike, ...keys: string[]) {
  const value = readStringParam(searchParams, ...keys);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readBigIntParam(searchParams: SearchParamsLike, ...keys: string[]) {
  const value = readStringParam(searchParams, ...keys);
  if (value === undefined) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function readBooleanParam(searchParams: SearchParamsLike, ...keys: string[]) {
  const value = readStringParam(searchParams, ...keys);
  if (value === undefined) return undefined;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return undefined;
}

function readFeeModeParam(searchParams: SearchParamsLike): FeeMode | undefined {
  const value = readStringParam(searchParams, "feeMode");
  return value === "creator" || value === "holder" || value === "gift" || value === "unknown" ? value : undefined;
}

function readRenderSurfaceParam(searchParams: SearchParamsLike): VaultRenderSurface | undefined {
  const value = readStringParam(searchParams, "renderSurface", "surface");
  return value === "standard-taxinfo" || value === "vault-taxinfo" || value === "feeinfo" || value === "unavailable" ? value : undefined;
}

function readMarketPhaseParam(searchParams: SearchParamsLike): TokenMarketPhase | undefined {
  const value = readStringParam(searchParams, "marketPhase", "phase");
  return value === "internal-market" || value === "dex-listed" || value === "unknown" ? value : undefined;
}

function tokenStatusFromMarketPhase(marketPhase?: TokenMarketPhase) {
  if (marketPhase === "internal-market") return 1;
  if (marketPhase === "dex-listed") return 2;
  if (marketPhase === "unknown") return 0;
  return undefined;
}

function readPreviewWalletParam(searchParams: SearchParamsLike): VaultRuntimeContextOverrides["previewWallet"] | undefined {
  const mode = readStringParam(searchParams, "previewWallet", "walletState");
  if (mode !== "wrong-network" && mode !== "connected") return undefined;
  return {
    address: readAddressParam(searchParams, "previewWalletAddress", "walletAddress"),
    chainId: readNumberParam(searchParams, "previewWalletChainId", "walletChainId") ?? (mode === "wrong-network" ? 1 : undefined),
    isConnected: true,
    canSwitchChain: mode !== "wrong-network",
  };
}

function hasPreviewHostOverride(searchParams: SearchParamsLike) {
  return Boolean(
    readMarketPhaseParam(searchParams) !== undefined ||
      readBooleanParam(searchParams, "isListed", "listed") !== undefined ||
      readNumberParam(searchParams, "tokenStatusCode", "status") !== undefined ||
      searchParams.get("taxInfo") === "1" ||
      readNumberParam(searchParams, "marketBps") !== undefined ||
      readStringParam(searchParams, "feeMode") !== undefined ||
      readStringParam(searchParams, "vaultType") !== undefined ||
      readRenderSurfaceParam(searchParams) !== undefined ||
      readBooleanParam(searchParams, "vaultNotFound") !== undefined ||
      readStringParam(searchParams, "vaultDescription") !== undefined ||
      readBooleanParam(searchParams, "vaultOfficial") !== undefined ||
      readNumberParam(searchParams, "riskLevel", "vaultRiskLevel") !== undefined ||
      readAddressParam(searchParams, "feeVaultAddress", "feeRecipient") !== undefined ||
      readAddressParam(searchParams, "feeVaultFactory", "giftVaultFactory") !== undefined ||
      readNumberParam(searchParams, "feeVaultRiskLevel") !== undefined ||
      readBooleanParam(searchParams, "feeVaultOfficial") !== undefined ||
      readBooleanParam(searchParams, "feeVaultIsVault") !== undefined ||
      readBooleanParam(searchParams, "feeVaultAI") !== undefined,
  );
}

function buildPreviewHostContext(
  searchParams: SearchParamsLike,
  runtimeAddresses: { factoryAddress?: Address; tokenAddress?: Address; vaultAddress?: Address },
  runtimeSnapshot?: TokenRuntimeSnapshot | null,
): VaultHostContext | undefined {
  const isNeutralPreviewFixture =
    runtimeAddresses.tokenAddress === PREVIEW_TOKEN_ADDRESS && runtimeAddresses.vaultAddress === PREVIEW_VAULT_ADDRESS;
  const baseTokenInfo = runtimeSnapshot?.tokenInfo ?? undefined;
  const baseTaxInfo = runtimeSnapshot?.taxInfo ?? undefined;
  const baseVaultInfo = runtimeSnapshot?.vaultInfo ?? undefined;

  const marketBps = readNumberParam(searchParams, "marketBps");
  const deflationBps = readNumberParam(searchParams, "deflationBps");
  const lpBps = readNumberParam(searchParams, "lpBps");
  const dividendBps = readNumberParam(searchParams, "dividendBps");
  const feeRate = readNumberParam(searchParams, "feeRate");
  const buyTaxRate = readNumberParam(searchParams, "buyTaxRate");
  const sellTaxRate = readNumberParam(searchParams, "sellTaxRate");
  const burntTokenAmount = readBigIntParam(searchParams, "burntTokenAmount");
  const totalQuoteSentToDividend = readBigIntParam(searchParams, "totalQuoteSentToDividend");
  const totalQuoteAddedToLiquidity = readBigIntParam(searchParams, "totalQuoteAddedToLiquidity");
  const totalTokenAddedToLiquidity = readBigIntParam(searchParams, "totalTokenAddedToLiquidity");
  const totalQuoteSentToMarketing = readBigIntParam(searchParams, "totalQuoteSentToMarketing");
  const marketingWallet = readAddressParam(searchParams, "marketingWallet");
  const minimumShareBalance = readBigIntParam(searchParams, "minimumShareBalance");
  const hasTaxInfoSeed = searchParams.get("taxInfo") === "1";
  const tokenStatus = readNumberParam(searchParams, "tokenStatusCode", "status");
  const marketPhase = readMarketPhaseParam(searchParams);
  const listed = readBooleanParam(searchParams, "isListed", "listed");
  const tokenVersion = readNumberParam(searchParams, "tokenVersion");
  const taxRate = readBigIntParam(searchParams, "taxRate");
  const quoteTokenAddress = readAddressParam(searchParams, "quoteTokenAddress", "quoteToken");
  const hasTokenAddress = isValidTokenAddress(runtimeAddresses.tokenAddress);
  const marketPhaseStatus = tokenStatusFromMarketPhase(marketPhase);
  const listedStatus = listed === undefined ? undefined : listed ? 2 : 1;
  const resolvedTokenStatus = tokenStatus ?? marketPhaseStatus ?? listedStatus;
  const shouldSeedSyntheticTokenInfo = hasTaxInfoSeed && hasTokenAddress && !baseTokenInfo;
  const hasTokenInfoInput =
    shouldSeedSyntheticTokenInfo ||
    tokenStatus !== undefined ||
    marketPhase !== undefined ||
    listed !== undefined ||
    tokenVersion !== undefined ||
    taxRate !== undefined ||
    quoteTokenAddress !== undefined;
  const tokenInfo = hasTokenInfoInput
    ? parsePortalTokenInfo({
        status: resolvedTokenStatus ?? baseTokenInfo?.status ?? (shouldSeedSyntheticTokenInfo ? 1 : 0),
        tokenVersion: tokenVersion ?? baseTokenInfo?.tokenVersion ?? 0,
        taxRate: taxRate ?? baseTokenInfo?.taxRateRaw ?? (shouldSeedSyntheticTokenInfo || isNeutralPreviewFixture ? 100n : 0n),
        quoteTokenAddress: quoteTokenAddress ?? baseTokenInfo?.quoteTokenAddress ?? ZERO_ADDRESS,
      })
    : baseTokenInfo;

  const feeVaultAddress = readAddressParam(searchParams, "feeVaultAddress", "feeRecipient");
  const feeVaultFactory = readAddressParam(searchParams, "feeVaultFactory", "giftVaultFactory");
  const dividendToken = readAddressParam(searchParams, "dividendToken");
  const wrappedNativeTokenAddress = readAddressParam(searchParams, "wrappedNativeTokenAddress", "wrappedNative");
  const feeVaultRiskLevel = readNumberParam(searchParams, "feeVaultRiskLevel");
  const feeVaultOfficial = readBooleanParam(searchParams, "feeVaultOfficial");
  const feeVaultIsVault = readBooleanParam(searchParams, "feeVaultIsVault");
  const feeVaultAI = readBooleanParam(searchParams, "feeVaultAI");
  const hasTaxInfoInput =
    hasTaxInfoSeed ||
    marketBps !== undefined ||
    deflationBps !== undefined ||
    lpBps !== undefined ||
    dividendBps !== undefined ||
    feeRate !== undefined ||
    buyTaxRate !== undefined ||
    sellTaxRate !== undefined ||
    burntTokenAmount !== undefined ||
    totalQuoteSentToDividend !== undefined ||
    totalQuoteAddedToLiquidity !== undefined ||
    totalTokenAddedToLiquidity !== undefined ||
    totalQuoteSentToMarketing !== undefined ||
    marketingWallet !== undefined ||
    quoteTokenAddress !== undefined ||
    minimumShareBalance !== undefined ||
    dividendToken !== undefined ||
    feeVaultAddress !== undefined ||
    feeVaultFactory !== undefined ||
    feeVaultRiskLevel !== undefined ||
    feeVaultOfficial !== undefined ||
    feeVaultIsVault !== undefined ||
    feeVaultAI !== undefined ||
    wrappedNativeTokenAddress !== undefined;
  const taxInfo = hasTaxInfoInput
    ? parseTaxTokenInfo(
        {
          marketBps: marketBps ?? baseTaxInfo?.marketBps ?? 10000,
          deflationBps: deflationBps ?? baseTaxInfo?.deflationBps ?? 0,
          lpBps: lpBps ?? baseTaxInfo?.lpBps ?? 0,
          dividendBps: dividendBps ?? baseTaxInfo?.dividendBps ?? 0,
          feeRate: feeRate ?? baseTaxInfo?.feeRate ?? 0,
          burntTokenAmount: burntTokenAmount ?? baseTaxInfo?.burntTokenAmount ?? 0n,
          totalQuoteSentToDividend: totalQuoteSentToDividend ?? baseTaxInfo?.totalQuoteSentToDividend ?? 0n,
          totalQuoteAddedToLiquidity: totalQuoteAddedToLiquidity ?? baseTaxInfo?.totalQuoteAddedToLiquidity ?? 0n,
          totalTokenAddedToLiquidity: totalTokenAddedToLiquidity ?? baseTaxInfo?.totalTokenAddedToLiquidity ?? 0n,
          totalQuoteSentToMarketing: totalQuoteSentToMarketing ?? baseTaxInfo?.totalQuoteSentToMarketing ?? 0n,
          marketingWallet: marketingWallet ?? baseTaxInfo?.marketingWallet ?? ZERO_ADDRESS,
          quoteToken: quoteTokenAddress ?? baseTaxInfo?.quoteToken ?? ZERO_ADDRESS,
          minimumShareBalance: minimumShareBalance ?? baseTaxInfo?.minimumShareBalance ?? 0n,
        },
        {
          buyTaxRate: buyTaxRate ?? baseTaxInfo?.buyTaxRate ?? undefined,
          sellTaxRate: sellTaxRate ?? baseTaxInfo?.sellTaxRate ?? undefined,
          dividendToken: dividendToken ?? baseTaxInfo?.dividendToken ?? quoteTokenAddress ?? baseTaxInfo?.quoteToken ?? ZERO_ADDRESS,
          vaultInfo: feeVaultAddress
            ? {
                addr: feeVaultAddress,
                factory: feeVaultFactory ?? runtimeAddresses.factoryAddress ?? ZERO_ADDRESS,
                riskLevel: feeVaultRiskLevel ?? 0,
                isOfficialVault: feeVaultOfficial ?? false,
                isVault: feeVaultIsVault ?? true,
                isAIConsumer: feeVaultAI ?? false,
              }
            : baseTaxInfo?.vaultInfo,
        },
        { wrappedNativeTokenAddress: wrappedNativeTokenAddress ?? undefined },
      )
    : baseTaxInfo;

  const vaultNotFound = readBooleanParam(searchParams, "vaultNotFound");
  const vaultDescription = readStringParam(searchParams, "vaultDescription");
  const vaultOfficial = readBooleanParam(searchParams, "vaultOfficial");
  const vaultRiskLevel = readNumberParam(searchParams, "riskLevel", "vaultRiskLevel");
  const hasVaultInfoInput =
    vaultNotFound !== undefined ||
    vaultDescription !== undefined ||
    vaultOfficial !== undefined ||
    vaultRiskLevel !== undefined;
  const vaultInfo = hasVaultInfoInput
    ? vaultNotFound
      ? { found: false as const }
      : runtimeAddresses.vaultAddress && isValidAddress(runtimeAddresses.vaultAddress)
        ? parseVaultPortalInfo({
            found: true,
            info: {
              vault: baseVaultInfo?.vault ?? runtimeAddresses.vaultAddress,
              vaultFactory: baseVaultInfo?.vaultFactory ?? runtimeAddresses.factoryAddress ?? ZERO_ADDRESS,
              description: vaultDescription ?? baseVaultInfo?.description ?? "",
              isOfficial: vaultOfficial ?? baseVaultInfo?.isOfficial ?? false,
              riskLevel: vaultRiskLevel ?? baseVaultInfo?.riskLevel ?? 0,
            },
          })
        : undefined
    : baseVaultInfo;

  const explicitFeeMode = readFeeModeParam(searchParams);
  const renderSurface = readRenderSurfaceParam(searchParams);
  const vaultType = readStringParam(searchParams, "vaultType");
  const copyScope = renderSurface === "feeinfo" || searchParams.get("copyScope") === "fee" ? "fee" : runtimeSnapshot?.copyScope ?? "tax";
  const hasTaxVaults = runtimeSnapshot?.hasTaxVaults ?? Boolean(vaultInfo?.found);
  const shouldCreateHost =
    tokenInfo || taxInfo || vaultInfo || explicitFeeMode || renderSurface || vaultType || copyScope === "fee";

  if (!shouldCreateHost) return undefined;

  const host = createTaxInfoHostContext({
    tokenInfo,
    taxInfo,
    vaultInfo,
    feeMode: explicitFeeMode,
    giftVaultFactory: feeVaultFactory ?? runtimeSnapshot?.giftVaultFactory,
    hasTaxVaults,
    vaultType,
    copyScope,
  });

  return renderSurface ? { ...host, renderSurface } : host;
}

export function FlapPreviewShell({ folderName, manifest, i18n, children }: FlapPreviewShellProps) {
  const { languageCode } = useLang();
  const searchParams = useSearchParams();
  const connectedChainId = useChainId();
  const previewDefaults = getPreviewRuntimeDefaults(folderName);
  const defaultChainId = previewDefaults?.chainId ?? manifest.match.bindings[0]?.chainId ?? 56;
  const requestedChainId = readNumberParam(searchParams, "chainId");
  const requestedFactoryAddress = readAddressParam(searchParams, "factoryAddress", "factory");
  const requestedVaultAddress = readAddressParam(searchParams, "vaultAddress", "vault");
  const requestedTokenAddress = readAddressParam(searchParams, "tokenAddress", "token", "ca");
  const shouldUseDefaultBinding = !requestedChainId && !requestedFactoryAddress && !requestedVaultAddress && !previewDefaults?.factoryAddress && !previewDefaults?.vaultAddress;
  const previewChainId = (requestedChainId && requestedChainId > 0 ? requestedChainId : undefined) ?? defaultChainId ?? connectedChainId ?? 56;
  const bindingFactoryHint = requestedFactoryAddress ?? previewDefaults?.factoryAddress;
  const bindingVaultHint = requestedVaultAddress ?? previewDefaults?.vaultAddress;
  const resolvedBinding = useMemo(
    () =>
      resolveManifestBinding(manifest, {
        chainId: previewChainId,
        factoryAddress: bindingFactoryHint,
        vaultAddress: bindingVaultHint,
        tokenAddress: requestedTokenAddress,
      }) ?? (shouldUseDefaultBinding ? manifest.match.bindings[0] : null),
    [bindingFactoryHint, bindingVaultHint, manifest, previewChainId, requestedTokenAddress, shouldUseDefaultBinding],
  );
  const publicClient = usePublicClient({ chainId: previewChainId });
  const [hostRuntime, setHostRuntime] = useState<HostRuntimeResult | null>(null);
  const runtimeTokenAddress =
    requestedTokenAddress ?? previewDefaults?.tokenAddress ?? resolvedBinding?.tokenAddresses?.[0] ?? getDefaultVaultPreviewTokenAddress(previewChainId);
  const usingNeutralPreviewFixture =
    runtimeTokenAddress === PREVIEW_TOKEN_ADDRESS && !requestedVaultAddress && !previewDefaults?.vaultAddress && !resolvedBinding?.vaultAddresses?.[0];
  const runtimePolicy: HostRuntimePolicy = "prefer-full-host";
  const runtimeFactoryHint = bindingFactoryHint ?? (shouldUseDefaultBinding ? resolvedBinding?.factoryAddress : undefined);
  const runtimeSnapshot = hostRuntime?.snapshot ?? null;
  const runtimeFactoryAddress = hostRuntime?.addresses.factoryAddress ?? requestedFactoryAddress ?? previewDefaults?.factoryAddress ?? resolvedBinding?.factoryAddress;
  const chainFactoryAddress = useMemo(() => resolveChainFactoryAddress(runtimeSnapshot), [runtimeSnapshot]);
  const runtimeVaultAddress =
    hostRuntime?.addresses.vaultAddress ??
    requestedVaultAddress ??
    previewDefaults?.vaultAddress ??
    resolvedBinding?.vaultAddresses?.[0] ??
    (usingNeutralPreviewFixture ? PREVIEW_VAULT_ADDRESS : undefined);
  const chainVaultAddress = useMemo(() => resolveChainVaultAddress(runtimeSnapshot), [runtimeSnapshot]);
  const factoryAddressForManifestCheck = chainFactoryAddress ?? runtimeFactoryAddress;
  const vaultAddressForManifestCheck = chainVaultAddress ?? requestedVaultAddress ?? previewDefaults?.vaultAddress ?? (requestedFactoryAddress ? undefined : runtimeVaultAddress);
  const manifestBindingMismatch = useMemo(
    () =>
      isManifestBindingMismatch(manifest, {
        chainId: previewChainId,
        factoryAddress: factoryAddressForManifestCheck,
        vaultAddress: vaultAddressForManifestCheck,
        tokenAddress: runtimeTokenAddress,
      }),
    [factoryAddressForManifestCheck, manifest, previewChainId, runtimeTokenAddress, vaultAddressForManifestCheck],
  );
  const hostPresentationFetcher = useMemo(() => createLocalHostPresentationFetcher(), []);

  useEffect(() => {
    if (!publicClient || !isValidTokenAddress(runtimeTokenAddress)) {
      setHostRuntime(null);
      return;
    }

    let cancelled = false;
    void runHostRuntime({
      publicClient,
      chainId: previewChainId,
      tokenAddress: runtimeTokenAddress,
      factoryAddressHint: runtimeFactoryHint,
      vaultAddressHint: requestedVaultAddress,
      policy: runtimePolicy,
      presentationFetcher: hostPresentationFetcher,
    })
      .then((result) => {
        if (cancelled) return;
        setHostRuntime(result);
      })
      .catch(() => {
        if (cancelled) return;
        setHostRuntime(null);
      });

    return () => {
      cancelled = true;
    };
  }, [hostPresentationFetcher, publicClient, previewChainId, requestedVaultAddress, runtimeFactoryHint, runtimePolicy, runtimeTokenAddress]);

  const hostOverrideActive = useMemo(() => hasPreviewHostOverride(searchParams), [searchParams]);

  const runtimeContextOverrides = useMemo<VaultRuntimeContextOverrides>(() => {
    const tokenName = hostRuntime?.tokenName ?? undefined;
    const tokenAddress = runtimeTokenAddress;
    const factoryAddress = runtimeFactoryAddress;
    const vaultAddress = runtimeVaultAddress;
    const previewFixture = tokenAddress === PREVIEW_TOKEN_ADDRESS && vaultAddress === PREVIEW_VAULT_ADDRESS;
    const tokenImageUrl = readStringParam(searchParams, "tokenImageUrl") ?? hostRuntime?.tokenImageUrl ?? (previewFixture ? PREVIEW_TOKEN_IMAGE_URL : undefined);
    const tokenDetailHref = readStringParam(searchParams, "tokenDetailHref") ?? hostRuntime?.tokenDetailHref;
    const chainHref = readStringParam(searchParams, "chainHref") ?? hostRuntime?.chainHref;
    const paymentTokenAddress = readAddressParam(searchParams, "paymentTokenAddress", "paymentToken");
    const paymentTokenSymbol = readStringParam(searchParams, "paymentTokenSymbol", "paymentSymbol");
    const paymentTokenDecimals = readNumberParam(searchParams, "paymentTokenDecimals", "paymentDecimals");
    const previewWallet = readPreviewWalletParam(searchParams);
    const paymentToken: PaymentToken | undefined = paymentTokenAddress
      ? {
          address: paymentTokenAddress,
          symbol: paymentTokenSymbol ?? "TOKEN",
          decimals: paymentTokenDecimals ?? 18,
          isNative: readBooleanParam(searchParams, "paymentTokenNative"),
        }
      : hostRuntime?.paymentToken;
    return {
      chainId: previewChainId,
      factoryAddress,
      tokenAddress,
      vaultAddress,
      userAddress: previewWallet?.address,
      tokenSymbol: hostRuntime?.tokenSymbol ?? "TOKEN",
      tokenName,
      tokenImageUrl,
      explorerBaseUrl: readStringParam(searchParams, "explorerBaseUrl", "explorer"),
      paymentToken,
      previewWallet,
      host: buildPreviewHostContext(searchParams, { factoryAddress, tokenAddress, vaultAddress }, runtimeSnapshot),
      extraConfig: {
        previewFixture,
        ...(manifestBindingMismatch
          ? {
              tokenUnavailable: true,
              tokenUnavailableReason: "manifest-binding-mismatch",
              manifestFactoryAddress: factoryAddressForManifestCheck,
              manifestVaultAddress: vaultAddressForManifestCheck,
            }
          : {}),
        ...(tokenName ? { tokenName } : {}),
        ...(tokenImageUrl ? { tokenImageUrl } : {}),
        ...(tokenDetailHref ? { tokenDetailHref } : {}),
        ...(chainHref ? { chainHref } : {}),
      },
    };
  }, [
    factoryAddressForManifestCheck,
    hostRuntime,
    manifestBindingMismatch,
    previewChainId,
    runtimeFactoryAddress,
    runtimeSnapshot,
    runtimeTokenAddress,
    runtimeVaultAddress,
    searchParams,
    vaultAddressForManifestCheck,
  ]);

  const runtimeContext = useMemo(
    () =>
      createVaultRuntimeContext({
        manifest,
        connectedChainId,
        hostRuntimeResult: hostRuntime,
        runtimeOverrides: runtimeContextOverrides,
      }),
    [connectedChainId, hostRuntime, manifest, runtimeContextOverrides],
  );
  const isFullscreenLayout = manifest.layout === "fullscreen";

  return (
    <VaultRuntimeProvider
      manifest={manifest}
      i18n={i18n}
      runtimeContext={runtimeContextOverrides}
      hostRuntimeResult={hostRuntime}
      locale={languageCode}
      oracleReader={createLocalOracleReader()}
    >
      <div className="min-h-screen bg-background">
        <FlapNavbar manifest={manifest} />
        <div className={isFullscreenLayout ? undefined : "xl:pr-[408px]"}>
          <div data-vault-e2e-scope="vault-preview">
            <PreviewTaxInfoFrame fullscreen={isFullscreenLayout}>{children}</PreviewTaxInfoFrame>
          </div>
        </div>
        <ManifestPanel
          manifest={manifest}
          folderName={folderName}
          placement={isFullscreenLayout ? "footer" : "sidebar"}
          host={runtimeContext.host}
          chainId={previewChainId}
          tokenAddress={runtimeContext.tokenAddress}
          factoryAddress={runtimeContext.factoryAddress}
          vaultAddress={runtimeContext.vaultAddress}
          tokenSymbol={runtimeContext.tokenSymbol}
          tokenName={runtimeContext.tokenName}
          runtimeSnapshot={runtimeSnapshot}
          hostRuntimeResult={hostRuntime}
          hostOverrideActive={hostOverrideActive}
        />
      </div>
    </VaultRuntimeProvider>
  );
}

function readExtraString(extraConfig: Record<string, unknown> | undefined, key: string) {
  const value = extraConfig?.[key];
  return typeof value === "string" ? value : undefined;
}

function readExtraBoolean(extraConfig: Record<string, unknown> | undefined, key: string) {
  return extraConfig?.[key] === true;
}

function isValidTokenAddress(address?: string) {
  return isValidAddress(address) && address !== ZERO_ADDRESS;
}

function resolveChainFactoryAddress(snapshot?: TokenRuntimeSnapshot | null) {
  const vaultFactory = snapshot?.vaultInfo?.found ? snapshot.vaultInfo.vaultFactory : undefined;
  const helperFactory = snapshot?.taxInfo?.vaultInfo?.isVault === true ? snapshot.taxInfo.vaultInfo.factory : undefined;
  if (vaultFactory && isValidTokenAddress(vaultFactory)) return vaultFactory;
  if (helperFactory && isValidTokenAddress(helperFactory)) return helperFactory;
  return undefined;
}

function resolveChainVaultAddress(snapshot?: TokenRuntimeSnapshot | null) {
  const portalVault = snapshot?.vaultInfo?.found ? snapshot.vaultInfo.vault : undefined;
  const helperVault = snapshot?.taxInfo?.vaultInfo?.isVault === true ? snapshot.taxInfo.vaultInfo.addr : undefined;
  if (portalVault && isValidTokenAddress(portalVault)) return portalVault;
  if (helperVault && isValidTokenAddress(helperVault)) return helperVault;
  return undefined;
}

function isManifestBindingMismatch(
  manifest: VaultManifest,
  input: { chainId: number; factoryAddress?: Address; vaultAddress?: Address; tokenAddress?: Address },
) {
  if (!input.factoryAddress && !input.vaultAddress && !input.tokenAddress) return false;
  return !resolveManifestBinding(manifest, input);
}

function PreviewTaxInfoFrame({ children, fullscreen = false }: { children: ReactNode; fullscreen?: boolean }) {
  const { lang } = useLang();
  const searchParams = useSearchParams();
  const context = useVaultContext();
  const shellRef = useRef<HTMLElement | null>(null);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const homeHref = "/";
  const tokenSymbol = context.tokenSymbol || "TOKEN";
  const tokenName = context.tokenName || readExtraString(context.extraConfig, "tokenName") || `${tokenSymbol} Preview Token`;
  const tokenImageUrl = context.tokenImageUrl || readExtraString(context.extraConfig, "tokenImageUrl");
  const tokenDetailHref = readExtraString(context.extraConfig, "tokenDetailHref");
  const explorerAddressUrl = context.explorerBaseUrl
    ? `${context.explorerBaseUrl.replace(/\/$/, "")}/address/${context.tokenAddress}`
    : "#";
  const isTokenUnavailable =
    searchParams.get("tokenStatus") === "invalid" ||
    searchParams.get("invalidToken") === "1" ||
    readExtraBoolean(context.extraConfig, "tokenUnavailable") ||
    context.host?.tokenInfo?.exists === false ||
    context.host?.renderSurface === "unavailable" ||
    !isValidTokenAddress(context.tokenAddress);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(context.tokenAddress);
    } catch {
      // Clipboard can be blocked in restricted preview contexts.
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsBrowserFullscreen(document.fullscreenElement === shellRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    handleFullscreenChange();

    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleBrowserFullscreen = async () => {
    const shell = shellRef.current;
    if (!fullscreen || !shell) return;

    try {
      if (document.fullscreenElement === shell) {
        await document.exitFullscreen();
      } else {
        await shell.requestFullscreen();
      }
    } catch {
      // Browser fullscreen can be blocked outside direct user gestures.
    }
  };

  return (
    <main
      ref={shellRef}
      data-vault-layout={fullscreen ? "fullscreen" : "standard"}
      className={fullscreen ? "vault-preview-taxinfo-shell mx-auto h-full w-full min-w-0 overflow-y-auto overflow-x-hidden bg-[#010202] font-mono" : "mx-auto h-full w-full min-w-0 overflow-y-auto overflow-x-hidden bg-[#010202] px-3 pb-6 pt-8 font-mono sm:px-4 sm:py-8"}
    >
      <Card
        className={
          fullscreen
            ? "mx-auto w-full max-w-full overflow-visible rounded-none border-0 bg-transparent text-white shadow-none"
            : "mx-auto w-full max-w-full overflow-visible rounded-none border-0 bg-transparent text-white shadow-none sm:max-w-[800px]"
        }
      >
        <CardHeader className={fullscreen ? "px-3 pt-3 sm:px-4 sm:pt-4" : "px-0 pb-5 pt-0"}>
          <div className="border border-[#484B51] bg-[#010202] px-3 py-3 sm:px-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {tokenImageUrl ? (
                  <Image src={tokenImageUrl} alt={tokenSymbol} width={44} height={44} className="h-11 w-11 shrink-0 border border-[#484B51] bg-[#1d1d1d] object-cover" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#484B51] bg-[#1d1d1d] text-sm font-black uppercase text-white">
                    {tokenSymbol.slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0 space-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px] uppercase leading-[1.4] text-[#9A9A9A]">
                    <Link href={homeHref} className="hover:text-white">
                      {lang.preview.tokens}
                    </Link>
                    <span>/</span>
                    {tokenDetailHref ? (
                      <Link href={tokenDetailHref} className="min-w-0 max-w-[180px] truncate hover:text-white sm:max-w-[260px]">
                        {tokenSymbol}
                      </Link>
                    ) : (
                      <span className="min-w-0 max-w-[180px] truncate sm:max-w-[260px]">{tokenSymbol}</span>
                    )}
                    <span>/</span>
                    <span className="text-white">{lang.preview.vault}</span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1">
                    <CardTitle className="min-w-0 break-words text-[22px] font-semibold uppercase leading-[1.15] text-[#EEEEEE] sm:text-[28px]">{tokenSymbol}</CardTitle>
                    <span className="min-w-0 break-words pb-1 text-[13px] font-semibold text-[#9A9A9A]">({tokenName})</span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 break-all text-[12px] text-[#8D8D8D]">{shortenAddress(context.tokenAddress)}</span>
                    <button type="button" onClick={copyAddress} className="text-[#8D8D8D] transition-colors hover:text-[#D0FF00]" title={lang.preview.copyAddress}>
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <Link href={explorerAddressUrl} target="_blank" rel="noopener noreferrer" className="text-[#8D8D8D] transition-colors hover:text-[#D0FF00]" title={lang.preview.viewOnExplorer}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {fullscreen ? (
                  <button
                    type="button"
                    onClick={toggleBrowserFullscreen}
                    className="grid h-9 w-9 place-items-center border border-[#484B51] bg-black/80 text-white transition-colors hover:border-[#D0FF00] hover:text-[#D0FF00]"
                    title={isBrowserFullscreen ? lang.preview.exitFullscreen : lang.preview.fullscreen}
                    aria-label={isBrowserFullscreen ? lang.preview.exitFullscreen : lang.preview.fullscreen}
                  >
                    {isBrowserFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                ) : null}
                <Link href={homeHref} className="grid h-9 w-9 place-items-center border border-[#484B51] text-[#8D8D8D] transition-colors hover:border-white hover:text-white" title={lang.preview.close}>
                  <X className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className={fullscreen ? "px-0 pb-0 pt-0" : "px-0 pb-0 pt-0"}>
          <div className={fullscreen ? "space-y-0" : "space-y-4"}>
            <div className="border-b border-[#484B51]">
              <div className="flex h-[43px] w-full items-end px-4 sm:px-6">
                <h3 className="relative pb-[11px] text-[14px] font-semibold uppercase leading-[1.4] text-white">
                  {lang.preview.vaultInformation}
                  <span aria-hidden="true" className="absolute bottom-0 left-1/2 h-[3px] w-[27px] -translate-x-1/2 bg-white" />
                </h3>
              </div>
            </div>
            {isTokenUnavailable ? (
              <div data-vault-token-unavailable="true" className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-yellow-100">{lang.preview.tokenUnavailableTitle}</p>
                    <p className="text-sm leading-6 text-yellow-100/76">{lang.preview.tokenUnavailableDescription}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className={fullscreen ? "min-h-[420px] w-full min-w-0" : "border border-[#484B51] p-4 sm:p-6"}>{children}</div>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
