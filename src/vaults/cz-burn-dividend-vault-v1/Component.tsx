"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import type { ActionAvailabilityStage, Address, VaultComponentProps } from "@/src/sdk";
import {
  erc20Abi,
  formatTokenAmount,
  handleTxError,
  isActionAvailableForPhase,
  parseTokenAmount,
  readTaxVaultHostContext,
  shortenAddress,
  useFlapSdk,
} from "@/src/sdk";
import { AddressLink, Alert, Button, Card, CardContent, CardHeader, CardTitle, DetailTile, Input, TxButton, type TxButtonState } from "@/src/ui";
import { vaultAbi } from "./VaultABI";

const actionStage: ActionAvailabilityStage = "both";
const nativeDecimals = 18;

interface FrontendUserInfo {
  account: Address;
  tokenBalance: bigint;
  burnedAmount: bigint;
  pendingReward: bigint;
  claimedReward: bigint;
  shareBps: bigint;
}

interface FrontendVaultInfo {
  taxToken: Address;
  czWallet: Address;
  minimumBurnAmount: bigint;
  totalBurned: bigint;
  totalBurners: bigint;
  totalBuybackBNB: bigint;
  totalBuybackToken: bigint;
  totalDistributedBNB: bigint;
  totalClaimedBNB: bigint;
  pendingBuybackBNB: bigint;
  pendingDustBNB: bigint;
  burnStarted: boolean;
  bnbBalance: bigint;
}

interface VaultState {
  user: FrontendUserInfo | null;
  vault: FrontendVaultInfo | null;
  paused: boolean;
  tokenSymbol: string;
  tokenDecimals: number | null;
  allowance: bigint;
}

const initialState: VaultState = {
  user: null,
  vault: null,
  paused: false,
  tokenSymbol: "",
  tokenDecimals: null,
  allowance: 0n,
};

const txBusyStates: TxButtonState[] = ["validating", "approving", "approval_confirming", "simulating", "writing", "confirming"];

function isTxBusy(state: TxButtonState) {
  return txBusyStates.includes(state);
}

function formatBurnInputAmount(value: bigint, decimals: number) {
  const formatted = formatUnits(value, decimals);
  const trimmed = formatted.includes(".") ? formatted.replace(/\.?0+$/, "") : formatted;
  return trimmed || "0";
}

export default function CZBurnDividendVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const { context, i18n } = sdk;
  const t = i18n.t;

  const [state, setState] = useState<VaultState>(initialState);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [burnAmount, setBurnAmount] = useState("100");
  const [burnTxState, setBurnTxState] = useState<TxButtonState>("idle");
  const [claimTxState, setClaimTxState] = useState<TxButtonState>("idle");

  const host = readTaxVaultHostContext(context.host);
  const marketPhase = host.marketPhase;
  const actionAvailableForPhase = isActionAvailableForPhase(actionStage, marketPhase);
  const riskLevel = host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel ?? null;
  const riskLabel =
    riskLevel === 1
      ? t("states.riskLow")
      : riskLevel === 2
        ? t("states.riskLowMedium")
        : riskLevel === 3
          ? t("states.riskMedium")
          : riskLevel === 4
            ? t("states.riskHigh")
            : riskLevel === 0
              ? t("states.riskUnverified")
              : t("states.riskMissing");
  const tokenSymbol = state.tokenSymbol || context.tokenSymbol || shortenAddress(context.tokenAddress);
  const tokenDecimals = state.tokenDecimals;
  const hasWallet = Boolean(context.userAddress);
  const pendingReward = state.user?.pendingReward ?? 0n;
  const userTokenBalance = state.user?.tokenBalance ?? 0n;
  const modeLabel = state.vault?.burnStarted ? t("states.modeDividend") : t("states.modeBuyback");

  const parsedBurnAmount = useMemo(() => {
    if (tokenDecimals === null) {
      return { value: 0n, error: t("disabled.tokenMetaMissing") };
    }
    try {
      return { value: parseTokenAmount(burnAmount, tokenDecimals), error: null };
    } catch {
      return { value: 0n, error: t("disabled.amountInvalid") };
    }
  }, [burnAmount, t, tokenDecimals]);

  const needsApproval = parsedBurnAmount.value > 0n && parsedBurnAmount.value > state.allowance;
  const amountDisplayDecimals = tokenDecimals ?? 18;
  const canUseBalanceShortcuts = hasWallet && tokenDecimals !== null && userTokenBalance > 0n;

  const txErrorMessages = useMemo(
    () => ({
      userRejected: t("errors.txFailed"),
      walletDisconnected: t("disabled.connectWallet"),
      wrongNetwork: t("disabled.switchNetwork"),
      insufficientFunds: t("disabled.balanceLow"),
      simulationFailed: t("errors.txFailed"),
      reverted: t("errors.txFailed"),
      unknown: t("errors.txFailed"),
    }),
    [t],
  );

  const burnDisabledReason = !hasWallet
    ? t("disabled.connectWallet")
    : sdk.wallet.isWrongNetwork
      ? t("disabled.switchNetwork")
      : !actionAvailableForPhase
        ? t("disabled.phase")
        : state.paused
          ? t("disabled.paused")
          : parsedBurnAmount.error
            ? parsedBurnAmount.error
            : parsedBurnAmount.value === 0n
              ? t("disabled.amountRequired")
              : state.vault && parsedBurnAmount.value < state.vault.minimumBurnAmount
                ? t("disabled.belowMinimum")
                : hasWallet && parsedBurnAmount.value > userTokenBalance
                  ? t("disabled.balanceLow")
                  : null;

  const claimDisabledReason = !hasWallet
    ? t("disabled.connectWallet")
    : sdk.wallet.isWrongNetwork
      ? t("disabled.switchNetwork")
      : !actionAvailableForPhase
        ? t("disabled.phase")
        : state.paused
          ? t("disabled.paused")
          : pendingReward <= 0n
            ? t("disabled.noReward")
            : null;

  const loadData = useCallback(async () => {
    setLoading(true);
    setReadError(null);
    try {
      const [vault, paused, tokenSymbolResult, tokenDecimalsResult] = await Promise.all([
        sdk.readContract<FrontendVaultInfo>({
          contract: "vault",
          address: context.vaultAddress,
          abi: vaultAbi,
          functionName: "getFrontendVaultInfo",
        }),
        sdk.readContract<boolean>({
          contract: "vault",
          address: context.vaultAddress,
          abi: vaultAbi,
          functionName: "paused",
        }),
        sdk
          .readContract<string>({
            contract: "token",
            address: context.tokenAddress,
            abi: erc20Abi,
            functionName: "symbol",
          })
          .catch(() => context.tokenSymbol ?? shortenAddress(context.tokenAddress)),
        sdk
          .readContract<number>({
            contract: "token",
            address: context.tokenAddress,
            abi: erc20Abi,
            functionName: "decimals",
          })
          .catch(() => null),
      ]);

      let user: FrontendUserInfo | null = null;
      let allowance = 0n;
      if (context.userAddress) {
        [user, allowance] = await Promise.all([
          sdk.readContract<FrontendUserInfo>({
            contract: "vault",
            address: context.vaultAddress,
            abi: vaultAbi,
            functionName: "getFrontendUserInfo",
            args: [context.userAddress],
          }),
          sdk.readContract<bigint>({
            contract: "token",
            address: context.tokenAddress,
            abi: erc20Abi,
            functionName: "allowance",
            args: [context.userAddress, context.vaultAddress],
          }),
        ]);
      }

      setState({
        user,
        vault,
        paused,
        tokenSymbol: tokenSymbolResult,
        tokenDecimals: tokenDecimalsResult,
        allowance,
      });
    } catch (error) {
      setReadError(handleTxError(error, { unknown: t("errors.readFailed"), reverted: t("errors.readFailed"), simulationFailed: t("errors.readFailed") }));
    } finally {
      setLoading(false);
    }
  }, [context.tokenAddress, context.tokenSymbol, context.userAddress, context.vaultAddress, sdk, t]);

  useEffect(() => {
    void loadData();
  }, [loadData, sdk.refetchNonce]);

  async function burnToken() {
    setTxError(null);
    try {
      if (needsApproval) {
        setBurnTxState("approving");
        const approvalSimulation = await sdk.simulateContract({
          contract: "token",
          address: context.tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [context.vaultAddress, parsedBurnAmount.value],
        });
        const approvalHash = await sdk.writeContract(approvalSimulation.request);
        setBurnTxState("approval_confirming");
        await sdk.waitForTx(approvalHash);
        await sdk.refetch(["token"]);
      }
      setBurnTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "burn",
        args: [parsedBurnAmount.value],
      });
      setBurnTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setBurnTxState("confirming");
      await sdk.waitForTx(hash);
      await sdk.refetch(["vault", "token"]);
      await loadData();
      sdk.notify.success(t("messages.burnSuccess"));
      setBurnTxState("success");
    } catch (error) {
      setTxError(handleTxError(error, txErrorMessages));
      setBurnTxState("failed");
    }
  }

  async function claimReward() {
    setTxError(null);
    try {
      setClaimTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "claim",
        args: [],
      });
      setClaimTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setClaimTxState("confirming");
      await sdk.waitForTx(hash);
      await sdk.refetch(["vault"]);
      await loadData();
      sdk.notify.success(t("messages.claimSuccess"));
      setClaimTxState("success");
    } catch (error) {
      setTxError(handleTxError(error, txErrorMessages));
      setClaimTxState("failed");
    }
  }

  async function switchNetwork() {
    setTxError(null);
    try {
      await sdk.wallet.switchChain();
    } catch (error) {
      setTxError(handleTxError(error, { unknown: t("errors.switchFailed"), wrongNetwork: t("errors.switchFailed") }));
    }
  }

  function setBurnAmountFromBalance(percent: 25 | 50 | 75 | 100) {
    if (!canUseBalanceShortcuts || tokenDecimals === null) return;
    const nextAmount = percent === 100 ? userTokenBalance : (userTokenBalance * BigInt(percent)) / 100n;
    setBurnAmount(formatBurnInputAmount(nextAmount, tokenDecimals));
  }

  return (
    <div className="w-full space-y-3 rounded-lg border border-[#1f2937] bg-[#05070f] p-3 text-[#e5e7eb] shadow-[0_18px_60px_-42px_rgba(0,0,0,0.9)] sm:p-4">
      <Card className="overflow-hidden border-[#243044] bg-[#0b1220] text-[#e5e7eb] shadow-[0_14px_38px_-34px_rgba(0,0,0,0.85)]">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <CardTitle className="text-base text-[#f8fafc] sm:text-lg">{t("sections.intro")}</CardTitle>
              <div className="max-w-3xl space-y-2 text-sm font-semibold leading-6 text-[#cbd5e1]">
                <p>{t("intro.buyback")}</p>
                <p>{t("intro.threshold")}</p>
                <p>{t("intro.toCz")}</p>
                <p className="pt-1 text-[#f8fafc]">{t("intro.distributionTitle")}</p>
                <p>{t("intro.dividendMode")}</p>
                <p>{t("intro.share")}</p>
                <p>{t("intro.claim")}</p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <InfoRow label={t("labels.risk")} value={riskLabel} tone={riskLevel === null || riskLevel === 0 || riskLevel >= 4 ? "danger" : riskLevel >= 3 ? "warning" : "success"} />
              <InfoRow label={t("labels.mode")} value={modeLabel} tone="success" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <AddressRow label={t("labels.vault")} value={<AddressLink address={context.vaultAddress} explorerBaseUrl={context.explorerBaseUrl} />} />
            <AddressRow label={t("labels.factory")} value={<AddressLink address={context.factoryAddress} explorerBaseUrl={context.explorerBaseUrl} />} />
            <AddressRow label={t("labels.czWallet")} value={<AddressLink address={state.vault?.czWallet} explorerBaseUrl={context.explorerBaseUrl} />} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#243044] bg-[#0b1220] text-[#e5e7eb] shadow-[0_12px_34px_-34px_rgba(0,0,0,0.8)]">
        <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
          <CardTitle className="text-base text-[#f8fafc]">{t("sections.vaultInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DetailTile className="border-[#92400e] bg-[#2a1909]" tone="warning" label={t("labels.minimumBurn")} value={formatTokenAmount(state.vault?.minimumBurnAmount, amountDisplayDecimals, 4)} detail={tokenSymbol} valueClassName="font-bold text-[#fb923c]" />
            <DetailTile className="border-[#243044] bg-[#111827]" tone="muted" label={t("labels.totalBurned")} value={formatTokenAmount(state.vault?.totalBurned, amountDisplayDecimals, 2)} detail={tokenSymbol} valueClassName="font-bold text-[#e5e7eb]" />
            <DetailTile className="border-[#243044] bg-[#111827]" tone="muted" label={t("labels.totalBurners")} value={state.vault?.totalBurners?.toString() ?? "-"} valueClassName="font-bold text-[#e5e7eb]" />
            <DetailTile className="border-[#243044] bg-[#111827]" tone="muted" label={t("labels.totalBuybackToken")} value={formatTokenAmount(state.vault?.totalBuybackToken, amountDisplayDecimals, 2)} detail={tokenSymbol} valueClassName="font-bold text-[#e5e7eb]" />
            <DetailTile className="border-[#065f46] bg-[#052e2b]" tone="success" label={t("labels.totalDistributedBNB")} value={formatTokenAmount(state.vault?.totalDistributedBNB, nativeDecimals, 4)} detail="BNB" valueClassName="font-bold text-[#34d399]" />
            <DetailTile className="border-[#243044] bg-[#111827]" tone="muted" label={t("labels.bnbBalance")} value={formatTokenAmount(state.vault?.bnbBalance, nativeDecimals, 4)} detail="BNB" valueClassName="font-bold text-[#e5e7eb]" />
          </div>

          {riskLevel === null ? <Alert tone="danger" className="border-[#7f1d1d] bg-[#2a0f12] text-[#fecaca]">{t("notices.riskMissing")}</Alert> : null}
        </CardContent>
      </Card>

      <Card className="border-[#243044] bg-[#0b1220] text-[#e5e7eb] shadow-[0_12px_34px_-34px_rgba(0,0,0,0.8)]">
        <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
          <CardTitle className="text-base text-[#f8fafc]">{t("sections.personalInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailTile className="border-[#0e7490] bg-[#082f49]" tone="primary" label={t("labels.tokenBalance")} value={hasWallet ? formatTokenAmount(state.user?.tokenBalance, amountDisplayDecimals, 4) : t("states.noWalletValue")} detail={tokenSymbol} valueClassName="font-bold text-[#7dd3fc]" />
            <DetailTile className={pendingReward > 0n ? "border-[#065f46] bg-[#052e2b]" : "border-[#243044] bg-[#111827]"} tone={pendingReward > 0n ? "success" : "muted"} label={t("labels.pendingReward")} value={formatTokenAmount(pendingReward, nativeDecimals, 6)} detail="BNB" valueClassName={pendingReward > 0n ? "font-bold text-[#34d399]" : "font-bold text-[#cbd5e1]"} />
            <DetailTile className="border-[#243044] bg-[#111827]" tone="muted" label={t("labels.burnedAmount")} value={formatTokenAmount(state.user?.burnedAmount, amountDisplayDecimals, 4)} detail={tokenSymbol} valueClassName="font-bold text-[#e5e7eb]" />
            <DetailTile className="border-[#065f46] bg-[#052e2b]" tone="success" label={t("labels.claimedReward")} value={formatTokenAmount(state.user?.claimedReward, nativeDecimals, 6)} detail="BNB" valueClassName="font-bold text-[#34d399]" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#243044] bg-[#0b1220] text-[#e5e7eb] shadow-[0_12px_34px_-34px_rgba(0,0,0,0.8)]">
        <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
          <CardTitle className="text-base text-[#f8fafc]">{t("sections.interaction")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-[#cbd5e1]">
              <span>{t("labels.burnAmount")}</span>
              <span className="text-xs font-bold text-[#94a3b8]">
                {t("labels.availableBalance")}: {hasWallet ? formatTokenAmount(userTokenBalance, amountDisplayDecimals, 4) : t("states.noWalletValue")} {tokenSymbol}
              </span>
            </div>
            <Input className="h-12 border-[#334155] bg-[#020617] text-center text-lg font-bold text-[#f8fafc] placeholder:text-[#64748b] focus:border-[#0d9488] focus:bg-[#020617] focus:ring-[#0d9488]/30" inputMode="decimal" value={burnAmount} onChange={(event) => setBurnAmount(event.target.value)} />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map((percent) => (
                <Button key={percent} type="button" variant="outline" className="border-[#334155] bg-[#111827] text-xs font-bold text-[#cbd5e1] hover:bg-[#172033]" disabled={!canUseBalanceShortcuts} onClick={() => setBurnAmountFromBalance(percent as 25 | 50 | 75 | 100)}>
                  {percent === 100 ? t("actions.max") : `${percent}%`}
                </Button>
              ))}
            </div>
          </div>
          {burnDisabledReason ? <Alert tone="info" className="border-[#243044] bg-[#111827] text-[#cbd5e1]">{burnDisabledReason}</Alert> : null}
          {claimDisabledReason ? <Alert tone={pendingReward > 0n ? "warning" : "info"} className={pendingReward > 0n ? "border-[#92400e] bg-[#2a1909] text-[#fed7aa]" : "border-[#243044] bg-[#111827] text-[#cbd5e1]"}>{claimDisabledReason}</Alert> : null}
          {readError ? <Alert tone="danger" className="border-[#7f1d1d] bg-[#2a0f12] text-[#fecaca]">{readError}</Alert> : null}
          {txError ? <Alert tone="danger" className="border-[#7f1d1d] bg-[#2a0f12] text-[#fecaca]">{txError}</Alert> : null}
          {loading ? <Alert tone="info" className="border-[#075985] bg-[#082f49] text-[#bae6fd]">{t("states.loading")}</Alert> : null}

          <div className="grid gap-2 sm:grid-cols-2">
            {sdk.wallet.isWrongNetwork ? (
              <Button variant="outline" className="w-full border-[#334155] bg-[#111827] text-[#cbd5e1] hover:bg-[#172033] sm:col-span-2" loading={sdk.wallet.isSwitchingChain} onClick={() => void switchNetwork()}>
                {t("actions.switchNetwork")}
              </Button>
            ) : null}
            <TxButton className="w-full bg-[#0f766e] text-white hover:bg-[#0d9488]" idleLabel={t("actions.burn")} state={burnTxState} disabled={Boolean(burnDisabledReason) || isTxBusy(burnTxState)} onClick={() => void burnToken()} />
            <TxButton className="w-full border-[#334155] bg-[#111827] text-[#cbd5e1] hover:bg-[#172033]" variant="outline" idleLabel={t("actions.claim")} state={claimTxState} disabled={Boolean(claimDisabledReason) || isTxBusy(claimTxState)} onClick={() => void claimReward()} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const toneClass =
    tone === "success"
      ? "border-[#065f46] bg-[#052e2b] text-[#34d399]"
      : tone === "warning"
        ? "border-[#92400e] bg-[#2a1909] text-[#fb923c]"
        : tone === "danger"
          ? "border-[#7f1d1d] bg-[#2a0f12] text-[#fca5a5]"
          : "border-[#243044] bg-[#111827] text-[#cbd5e1]";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${toneClass}`}>
      <span className="text-[#94a3b8]">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function AddressRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-[#243044] bg-[#111827] p-3 text-sm">
      <span className="min-w-0 text-xs font-bold text-[#94a3b8]">{label}</span>
      <div className="min-w-0 break-words font-semibold text-[#dbeafe]">{value}</div>
    </div>
  );
}
