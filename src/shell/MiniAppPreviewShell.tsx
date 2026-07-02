"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useChainId, usePublicClient } from "wagmi";
import type { Address, PaymentToken, TokenMarketPhase, VaultHostContext, VaultManifest, VaultRuntimeContextOverrides } from "@/src/sdk";
import { createLocalOracleReader, VaultRuntimeProvider } from "@/src/sdk";
import type { HostRuntimePolicy, HostRuntimeResult, TokenRuntimeSnapshot } from "@/src/sdk/host";
import {
  createVaultRuntimeContext,
  isValidAddress,
  parsePortalTokenInfo,
  resolveManifestBinding,
  runHostRuntime,
  ZERO_ADDRESS,
} from "@/src/sdk/host";
import { createLocalHostPresentationFetcher } from "@/src/sdk/hostPresentation";
import { useLang } from "@/src/i18n/useLang";
import { FlapNavbar } from "./FlapNavbar";
import { ManifestPanel } from "./ManifestPanel";
import { MiniAppPreviewFrame } from "./MiniAppPreviewFrame";
import { getDefaultMiniAppPreviewTokenAddress } from "./previewCoinDetail";
import { getPreviewRuntimeDefaults } from "./previewRuntimeDefaults";

interface MiniAppPreviewShellProps {
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

function readBooleanParam(searchParams: SearchParamsLike, ...keys: string[]) {
  const value = readStringParam(searchParams, ...keys);
  if (value === undefined) return undefined;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return undefined;
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

function hasMiniAppPreviewHostOverride(searchParams: SearchParamsLike) {
  return Boolean(
    readMarketPhaseParam(searchParams) !== undefined ||
      readBooleanParam(searchParams, "isListed", "listed") !== undefined ||
      readNumberParam(searchParams, "tokenStatusCode", "status") !== undefined ||
      readNumberParam(searchParams, "tokenVersion") !== undefined ||
      readAddressParam(searchParams, "quoteTokenAddress", "quoteToken") !== undefined,
  );
}

function buildMiniAppPreviewHostContext(
  searchParams: SearchParamsLike,
  runtimeSnapshot?: TokenRuntimeSnapshot | null,
): VaultHostContext {
  const baseTokenInfo = runtimeSnapshot?.tokenInfo ?? undefined;
  const tokenStatus = readNumberParam(searchParams, "tokenStatusCode", "status");
  const marketPhase = readMarketPhaseParam(searchParams);
  const listed = readBooleanParam(searchParams, "isListed", "listed");
  const tokenVersion = readNumberParam(searchParams, "tokenVersion");
  const quoteTokenAddress = readAddressParam(searchParams, "quoteTokenAddress", "quoteToken");
  const marketPhaseStatus = tokenStatusFromMarketPhase(marketPhase);
  const listedStatus = listed === undefined ? undefined : listed ? 2 : 1;
  const resolvedStatus = tokenStatus ?? marketPhaseStatus ?? listedStatus ?? baseTokenInfo?.status ?? 1;
  const parsedTokenInfo =
    parsePortalTokenInfo({
      status: resolvedStatus,
      tokenVersion: tokenVersion ?? baseTokenInfo?.tokenVersion ?? 7,
      taxRate: 0n,
      quoteTokenAddress: quoteTokenAddress ?? baseTokenInfo?.quoteTokenAddress ?? ZERO_ADDRESS,
    }) ?? baseTokenInfo ?? undefined;
  const tokenInfo = parsedTokenInfo
    ? {
        ...parsedTokenInfo,
        exists: true,
        isTaxToken: false,
        taxRate: 0,
        taxRateRaw: 0n,
        quoteTokenAddress: parsedTokenInfo.quoteTokenAddress ?? quoteTokenAddress ?? ZERO_ADDRESS,
      }
    : undefined;
  const effectiveMarketPhase = marketPhase ?? (resolvedStatus >= 2 ? "dex-listed" : "internal-market");

  return {
    tokenInfo,
    taxInfo: null,
    vaultInfo: null,
    feeMode: "unknown",
    renderSurface: "feeinfo",
    copyScope: "fee",
    isListed: listed ?? resolvedStatus >= 2,
    marketPhase: effectiveMarketPhase,
  };
}

function isValidTokenAddress(address?: string) {
  return isValidAddress(address) && address !== ZERO_ADDRESS;
}

function isManifestBindingMismatch(manifest: VaultManifest, input: { chainId: number; tokenAddress?: Address }) {
  if (!input.tokenAddress) return false;
  return !resolveManifestBinding(manifest, input);
}

export function MiniAppPreviewShell({ folderName, manifest, i18n, children }: MiniAppPreviewShellProps) {
  const { languageCode } = useLang();
  const searchParams = useSearchParams();
  const connectedChainId = useChainId();
  const previewDefaults = getPreviewRuntimeDefaults(folderName);
  const defaultChainId = previewDefaults?.chainId ?? manifest.match.bindings[0]?.chainId ?? 56;
  const requestedChainId = readNumberParam(searchParams, "chainId");
  const requestedTokenAddress = readAddressParam(searchParams, "tokenAddress", "token", "ca");
  const previewChainId = (requestedChainId && requestedChainId > 0 ? requestedChainId : undefined) ?? defaultChainId ?? connectedChainId ?? 56;
  const resolvedBinding = useMemo(
    () =>
      resolveManifestBinding(manifest, {
        chainId: previewChainId,
        tokenAddress: requestedTokenAddress,
      }) ?? manifest.match.bindings.find((binding) => binding.chainId === previewChainId && binding.tokenAddresses?.length) ?? manifest.match.bindings[0] ?? null,
    [manifest, previewChainId, requestedTokenAddress],
  );
  const publicClient = usePublicClient({ chainId: previewChainId });
  const [hostRuntime, setHostRuntime] = useState<HostRuntimeResult | null>(null);
  const runtimeTokenAddress =
    requestedTokenAddress ?? previewDefaults?.tokenAddress ?? resolvedBinding?.tokenAddresses?.[0] ?? getDefaultMiniAppPreviewTokenAddress(previewChainId);
  const runtimeFactoryAddress = ZERO_ADDRESS;
  const runtimeVaultAddress = ZERO_ADDRESS;
  const runtimePolicy: HostRuntimePolicy = "prefer-full-host";
  const runtimeSnapshot = hostRuntime?.snapshot ?? null;
  const manifestBindingMismatch = useMemo(
    () =>
      isManifestBindingMismatch(manifest, {
        chainId: previewChainId,
        tokenAddress: runtimeTokenAddress,
      }),
    [manifest, previewChainId, runtimeTokenAddress],
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
  }, [hostPresentationFetcher, publicClient, previewChainId, runtimePolicy, runtimeTokenAddress]);

  const hostOverrideActive = useMemo(() => hasMiniAppPreviewHostOverride(searchParams), [searchParams]);

  const runtimeContextOverrides = useMemo<VaultRuntimeContextOverrides>(() => {
    const tokenName = hostRuntime?.tokenName ?? undefined;
    const tokenAddress = runtimeTokenAddress;
    const tokenImageUrl = readStringParam(searchParams, "tokenImageUrl") ?? hostRuntime?.tokenImageUrl;
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
      factoryAddress: runtimeFactoryAddress,
      tokenAddress,
      vaultAddress: runtimeVaultAddress,
      userAddress: previewWallet?.address,
      tokenSymbol: hostRuntime?.tokenSymbol ?? "TOKEN",
      tokenName,
      tokenImageUrl,
      explorerBaseUrl: readStringParam(searchParams, "explorerBaseUrl", "explorer"),
      paymentToken,
      previewWallet,
      host: buildMiniAppPreviewHostContext(searchParams, runtimeSnapshot),
      extraConfig: {
        ...(manifestBindingMismatch
          ? {
              tokenUnavailable: true,
              tokenUnavailableReason: "manifest-binding-mismatch",
              manifestFactoryAddress: runtimeFactoryAddress,
              manifestVaultAddress: runtimeVaultAddress,
            }
          : {}),
        ...(tokenName ? { tokenName } : {}),
        ...(tokenImageUrl ? { tokenImageUrl } : {}),
        ...(tokenDetailHref ? { tokenDetailHref } : {}),
        ...(chainHref ? { chainHref } : {}),
      },
    };
  }, [
    hostRuntime,
    manifestBindingMismatch,
    previewChainId,
    runtimeFactoryAddress,
    runtimeSnapshot,
    runtimeTokenAddress,
    runtimeVaultAddress,
    searchParams,
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
        <MiniAppPreviewFrame>{children}</MiniAppPreviewFrame>
        <ManifestPanel
          manifest={manifest}
          folderName={folderName}
          placement="footer"
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
