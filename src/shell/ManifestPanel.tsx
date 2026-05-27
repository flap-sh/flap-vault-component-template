"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Address, TokenMarketPhase, VaultHostContext, VaultManifest } from "@/src/sdk";
import { readTaxVaultHostContext } from "@/src/sdk";
import type { HostRuntimeDataSource, HostRuntimeResult, HostRuntimeStatus, TokenRuntimeSnapshot } from "@/src/sdk/host";
import { resolveManifestBinding } from "@/src/sdk/host";
import { useLang } from "@/src/i18n/useLang";
import { Button } from "@/src/ui/Button";
import { StatusBadge } from "@/src/ui/StatusBadge";
import { PREVIEW_TOKEN_ADDRESS } from "./previewCoinDetail";

interface ManifestPanelProps {
  manifest: VaultManifest;
  folderName?: string;
  host?: VaultHostContext;
  chainId?: number;
  tokenAddress?: Address;
  factoryAddress?: Address;
  vaultAddress?: Address;
  tokenSymbol?: string;
  tokenName?: string;
  runtimeSnapshot?: TokenRuntimeSnapshot | null;
  hostRuntimeResult?: HostRuntimeResult | null;
  hostOverrideActive?: boolean;
}

const phaseOptions: TokenMarketPhase[] = ["internal-market", "dex-listed"];
type PhasePreviewControl = TokenMarketPhase | "runtime";

function phaseTone(phase: TokenMarketPhase) {
  if (phase === "dex-listed") return "success";
  if (phase === "internal-market") return "warning";
  return "neutral";
}

export function ManifestPanel({
  manifest,
  folderName,
  host,
  chainId,
  tokenAddress,
  factoryAddress,
  vaultAddress,
  tokenSymbol,
  tokenName,
  runtimeSnapshot,
  hostRuntimeResult,
  hostOverrideActive = false,
}: ManifestPanelProps) {
  const { lang } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const manifestJson = JSON.stringify(manifest, null, 2);
  const hostSnapshot = readTaxVaultHostContext(host);
  const activePhase = hostSnapshot.marketPhase;
  const tokenInfo = runtimeSnapshot?.tokenInfo ?? host?.tokenInfo;
  const taxInfo = runtimeSnapshot?.taxInfo ?? host?.taxInfo ?? undefined;
  const vaultPortalInfo = runtimeSnapshot?.vaultInfo ?? host?.vaultInfo ?? undefined;
  const paymentToken = hostRuntimeResult?.paymentToken ?? runtimeSnapshot?.paymentToken;
  const listed = host?.isListed ?? (tokenInfo ? tokenInfo.status >= 2 : undefined);
  const runtimeStatus = hostRuntimeResult?.status ?? "unavailable";
  const runtimePolicy = hostRuntimeResult?.policy ?? "prefer-full-host";
  const runtimeSources = hostRuntimeResult?.sources;
  const phaseOverrideActive = Boolean(
    searchParams.get("marketPhase") ||
      searchParams.get("phase") ||
      searchParams.get("isListed") ||
      searchParams.get("listed") ||
      searchParams.get("tokenStatusCode") ||
      searchParams.get("status") ||
      searchParams.get("tokenStatus"),
  );

  function statusLabel(status: HostRuntimeStatus) {
    if (status === "full-host") return lang.preview.hostRuntimeStatusFullHost;
    if (status === "onchain") return lang.preview.hostRuntimeStatusOnchain;
    return lang.preview.hostRuntimeStatusUnavailable;
  }

  function statusTone(status: HostRuntimeStatus) {
    if (status === "full-host") return "success";
    if (status === "onchain") return "warning";
    return "neutral";
  }

  function dataSourceLabel(source?: HostRuntimeDataSource) {
    if (source === "host-proxy") return lang.preview.hostReadSourceHostProxy;
    if (source === "onchain") return lang.preview.hostReadSourceOnchain;
    return lang.preview.hostReadSourceUnavailable;
  }

  function policyLabel(policy: HostRuntimeResult["policy"]) {
    if (policy === "require-full-host") return lang.preview.hostRuntimePolicyRequireFullHost;
    return lang.preview.hostRuntimePolicyPreferFullHost;
  }

  function phaseLabel(phase: TokenMarketPhase) {
    if (phase === "internal-market") return lang.preview.phaseInternalMarket;
    if (phase === "dex-listed") return lang.preview.phaseDexListed;
    return lang.preview.phaseUnknown;
  }

  function phaseControlLabel(control: PhasePreviewControl) {
    if (control === "runtime") return lang.preview.phaseRuntime;
    return phaseLabel(control);
  }

  function boolLabel(value?: boolean | null) {
    if (value === true) return lang.preview.hostReadYes;
    if (value === false) return lang.preview.hostReadNo;
    return "-";
  }

  function shortAddress(address?: string | null) {
    if (!address) return "-";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function line(label: string, value: string) {
    return (
      <div className="flex items-start justify-between gap-3">
        <span className="text-white/46">{label}</span>
        <span className="min-w-0 break-all text-right text-white/76">{value}</span>
      </div>
    );
  }

  function fillPreviewRuntimeParams(nextParams: URLSearchParams) {
    const fallbackChainId = chainId && chainId > 0 ? chainId : undefined;
    const fallbackFactoryAddress = factoryAddress ?? undefined;
    const fallbackVaultAddress = vaultAddress ?? undefined;
    const hasRuntimeHints = Boolean(fallbackChainId || fallbackFactoryAddress);
    const resolvedBinding =
      resolveManifestBinding(manifest, {
        chainId: fallbackChainId,
        factoryAddress: fallbackFactoryAddress,
      }) ?? (hasRuntimeHints ? null : manifest.match.bindings[0]);
    const previewChainId = fallbackChainId ?? resolvedBinding?.chainId;
    const previewFactoryAddress = fallbackFactoryAddress ?? resolvedBinding?.factoryAddress;

    if (previewChainId) {
      nextParams.set("chainId", String(previewChainId));
    }
    if (previewFactoryAddress) {
      nextParams.set("factoryAddress", previewFactoryAddress);
    }
    const previewTokenAddress = tokenAddress ?? PREVIEW_TOKEN_ADDRESS;
    if (!nextParams.get("tokenAddress") && !nextParams.get("token") && !nextParams.get("ca")) {
      nextParams.set("tokenAddress", previewTokenAddress);
    }
    if (fallbackVaultAddress) {
      nextParams.set("vaultAddress", fallbackVaultAddress);
    }
  }

  function setPreviewPhase(phase: TokenMarketPhase) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("marketPhase", phase);
    nextParams.delete("status");
    nextParams.delete("tokenStatusCode");
    nextParams.delete("isListed");
    nextParams.delete("listed");
    nextParams.delete("tokenStatus");
    nextParams.delete("invalidToken");

    fillPreviewRuntimeParams(nextParams);

    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }

  function clearPreviewPhase() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("marketPhase");
    nextParams.delete("phase");
    nextParams.delete("status");
    nextParams.delete("tokenStatusCode");
    nextParams.delete("isListed");
    nextParams.delete("listed");
    nextParams.delete("tokenStatus");
    nextParams.delete("invalidToken");

    fillPreviewRuntimeParams(nextParams);

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  return (
    <aside className="mx-auto w-full max-w-[768px] px-4 pb-6 sm:px-0 xl:fixed xl:right-6 xl:top-[92px] xl:z-30 xl:max-h-[calc(100vh-116px)] xl:w-[360px] xl:max-w-none xl:overflow-hidden xl:px-0 xl:pb-0">
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#101522] shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{lang.preview.manifestPanelLabel}</p>
              <h2 className="mt-1 truncate text-sm font-semibold text-white">{manifest.name}</h2>
            </div>
            {folderName ? <span className="shrink-0 rounded-md border border-white/10 bg-black/25 px-2 py-1 font-mono text-[11px] text-white/58">{folderName}</span> : null}
          </div>
        </div>
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{lang.preview.phasePanelLabel}</p>
              <p className="mt-1 text-xs leading-5 text-white/54">{lang.preview.phasePanelDescription}</p>
            </div>
            <StatusBadge tone={phaseTone(activePhase)}>{phaseLabel(activePhase)}</StatusBadge>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["runtime", ...phaseOptions] as PhasePreviewControl[]).map((control) => (
              <Button
                key={control}
                type="button"
                size="sm"
                variant={
                  control === "runtime"
                    ? !phaseOverrideActive
                      ? "default"
                      : "outline"
                    : phaseOverrideActive && activePhase === control
                      ? "default"
                      : "outline"
                }
                onClick={() => (control === "runtime" ? clearPreviewPhase() : setPreviewPhase(control))}
                aria-pressed={control === "runtime" ? !phaseOverrideActive : phaseOverrideActive && activePhase === control}
              >
                {phaseControlLabel(control)}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-white/54">
            {phaseOverrideActive ? lang.preview.phasePanelSourceOverride : lang.preview.phasePanelSourceRuntime}
          </p>
          <p className="mt-3 text-xs leading-5 text-white/42">{lang.preview.phasePanelHint}</p>
        </div>
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{lang.preview.hostReadPanelLabel}</p>
              <p className="mt-1 text-xs leading-5 text-white/54">{lang.preview.hostReadPanelDescription}</p>
            </div>
            <StatusBadge tone={statusTone(runtimeStatus)}>{statusLabel(runtimeStatus)}</StatusBadge>
          </div>
          <div className="mt-3 space-y-2 text-xs leading-5">
            {line(lang.preview.hostReadFieldRuntimeStatus, statusLabel(runtimeStatus))}
            {line(lang.preview.hostReadFieldRuntimePolicy, policyLabel(runtimePolicy))}
            {line(lang.preview.hostReadFieldOverrideActive, boolLabel(hostOverrideActive))}
            {line(lang.preview.hostReadFieldDegradeReason, hostRuntimeResult?.degradeReason ?? "-")}
            {line(lang.preview.hostReadFieldChain, chainId ? String(chainId) : "-")}
            {line(lang.preview.hostReadFieldToken, shortAddress(tokenAddress))}
            {line(lang.preview.hostReadFieldTokenSymbol, tokenSymbol ?? "-")}
            {line(lang.preview.hostReadFieldTokenName, tokenName ?? "-")}
            {line(lang.preview.hostReadFieldFactory, shortAddress(factoryAddress))}
            {line(lang.preview.hostReadFieldVault, shortAddress(vaultAddress))}
            {line(lang.preview.hostReadFieldTokenMetadataSource, dataSourceLabel(runtimeSources?.tokenMetadata))}
            {line(lang.preview.hostReadFieldTaxSource, dataSourceLabel(runtimeSources?.taxState))}
            {line(lang.preview.hostReadFieldVaultSource, dataSourceLabel(runtimeSources?.vaultState))}
            {line(lang.preview.hostReadFieldPresentationSource, dataSourceLabel(runtimeSources?.presentation))}
            {line(lang.preview.hostReadFieldPhase, phaseLabel(activePhase))}
            {line(lang.preview.hostReadFieldListed, listed === undefined ? "-" : boolLabel(listed))}
            {line(lang.preview.hostReadFieldStatus, tokenInfo ? String(tokenInfo.status) : "-")}
            {line(lang.preview.hostReadFieldTokenVersion, tokenInfo ? String(tokenInfo.tokenVersion) : "-")}
            {line(lang.preview.hostReadFieldTaxToken, tokenInfo ? boolLabel(tokenInfo.isTaxToken) : "-")}
            {line(lang.preview.hostReadFieldQuoteToken, shortAddress(tokenInfo?.quoteTokenAddress))}
            {line(
              lang.preview.hostReadFieldPaymentToken,
              paymentToken ? `${paymentToken.symbol} (${paymentToken.isNative ? lang.preview.hostReadNative : shortAddress(paymentToken.address)})` : "-",
            )}
            {line(lang.preview.hostReadFieldSurface, host?.renderSurface ?? "-")}
            {line(lang.preview.hostReadFieldFeeMode, host?.feeMode ?? "-")}
            {line(lang.preview.hostReadFieldMarketBps, taxInfo ? String(taxInfo.marketBps) : "-")}
            {line(lang.preview.hostReadFieldDividendBps, taxInfo ? String(taxInfo.dividendBps) : "-")}
            {line(lang.preview.hostReadFieldVaultFound, vaultPortalInfo ? boolLabel(vaultPortalInfo.found) : "-")}
            {line(lang.preview.hostReadFieldVaultPortalVault, vaultPortalInfo?.found ? shortAddress(vaultPortalInfo.vault) : "-")}
            {line(lang.preview.hostReadFieldVaultPortalFactory, vaultPortalInfo?.found ? shortAddress(vaultPortalInfo.vaultFactory) : "-")}
          </div>
          <p className="mt-3 text-xs leading-5 text-white/42">{lang.preview.hostReadPanelHint}</p>
        </div>
        <pre className="max-h-[360px] overflow-auto p-4 text-xs leading-5 text-white/70 xl:max-h-[calc(100vh-348px)]">
          <code>{manifestJson}</code>
        </pre>
      </div>
    </aside>
  );
}
