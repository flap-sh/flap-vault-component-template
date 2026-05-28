"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionAvailabilityStage, VaultComponentProps } from "@/src/sdk";
import { erc20Abi, formatTokenAmount, handleTxError, isActionAvailableForPhase, parseTokenAmount, readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Countdown, DetailTile, Input, Metric, StatusBadge, TxButton } from "@/src/ui";
import type { TxButtonState } from "@/src/ui/TxButton";
import { actionGalleryExampleVaultAbi } from "./VaultABI";

interface GalleryState {
  totalReserved: bigint;
  available: bigint;
  claimableRewards: bigint;
  refundable: bigint;
  deadline: number;
}

interface PositionInfo {
  reserved: bigint;
  claimed: bigint;
  refunded: bigint;
}

type ActionId = "reserve" | "claim" | "refund" | "refresh";

export default function ActionGalleryExampleVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const { context, i18n } = sdk;
  const t = i18n.t;
  const [galleryState, setGalleryState] = useState<GalleryState | null>(null);
  const [position, setPosition] = useState<PositionInfo | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [amount, setAmount] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActionId | null>(null);
  const [txState, setTxState] = useState<TxButtonState>("idle");
  const [usingPreviewData, setUsingPreviewData] = useState(false);

  const decimals = context.paymentToken?.decimals ?? 18;
  const tokenSymbol = context.paymentToken?.symbol ?? context.tokenSymbol;
  const paymentTokenAddress = context.paymentToken?.address ?? context.tokenAddress;
  const previewFixture = context.extraConfig?.previewFixture === true;
  const host = readTaxVaultHostContext(context.host);
  const marketPhase = host.marketPhase;
  const txErrorMessages = useMemo(
    () => ({
      userRejected: t("errors.userRejected"),
      walletDisconnected: t("errors.walletDisconnected"),
      insufficientFunds: t("errors.insufficientFunds"),
      simulationFailed: t("errors.simulationFailed"),
      reverted: t("errors.txReverted"),
      unknown: t("errors.txFailed"),
    }),
    [t],
  );
  const readErrorMessages = useMemo(
    () => ({
      ...txErrorMessages,
      simulationFailed: t("errors.readFailed"),
      reverted: t("errors.readFailed"),
      unknown: t("errors.readFailed"),
    }),
    [t, txErrorMessages],
  );
  const parsedAmount = useMemo(() => {
    try {
      return parseTokenAmount(amount || "0", decimals);
    } catch {
      return 0n;
    }
  }, [amount, decimals]);
  const needsApproval = parsedAmount > 0n && allowance < parsedAmount;

  const marketPhaseLabel =
    marketPhase === "internal-market"
      ? t("states.marketPhaseInternal")
      : marketPhase === "dex-listed"
        ? t("states.marketPhaseDexListed")
        : t("states.marketPhaseUnknown");

  const applyPreviewData = useCallback(() => {
    setGalleryState({
      totalReserved: parseTokenAmount("72500", decimals),
      available: parseTokenAmount("27500", decimals),
      claimableRewards: parseTokenAmount("1280", decimals),
      refundable: parseTokenAmount("340", decimals),
      deadline: Math.floor(Date.now() / 1000) + 86_400,
    });
    setPosition({
      reserved: parseTokenAmount("1500", decimals),
      claimed: parseTokenAmount("220", decimals),
      refunded: 0n,
    });
    setBalance(parseTokenAmount("5000", decimals));
    setAllowance(0n);
    setUsingPreviewData(true);
  }, [decimals]);

  const loadData = useCallback(async () => {
    if (previewFixture) {
      applyPreviewData();
      setError(null);
      return;
    }

    const nextGalleryState = await sdk.readContract<GalleryState>({
      contract: "vault",
      address: context.vaultAddress,
      abi: actionGalleryExampleVaultAbi,
      functionName: "galleryState",
    });
    setGalleryState(nextGalleryState);
    setUsingPreviewData(false);

    if (!context.userAddress) {
      setPosition(null);
      setBalance(0n);
      setAllowance(0n);
      return;
    }

    const [nextPosition, nextBalance, nextAllowance] = await Promise.all([
      sdk.readContract<PositionInfo>({
        contract: "vault",
        address: context.vaultAddress,
        abi: actionGalleryExampleVaultAbi,
        functionName: "positionOf",
        args: [context.userAddress],
      }),
      sdk.readContract<bigint>({
        contract: "token",
        address: paymentTokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [context.userAddress],
      }),
      sdk.readContract<bigint>({
        contract: "token",
        address: paymentTokenAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [context.userAddress, context.vaultAddress],
      }),
    ]);
    setPosition(nextPosition);
    setBalance(nextBalance);
    setAllowance(nextAllowance);
  }, [applyPreviewData, context.userAddress, context.vaultAddress, paymentTokenAddress, previewFixture, sdk]);

  useEffect(() => {
    void loadData().catch((nextError) => setError(handleTxError(nextError, readErrorMessages)));
    const timer = setInterval(() => {
      void loadData().catch(() => undefined);
    }, 15_000);
    return () => clearInterval(timer);
  }, [loadData, readErrorMessages]);

  function isAvailable(stage: ActionAvailabilityStage) {
    return isActionAvailableForPhase(stage, marketPhase);
  }

  function disabledReason(
    stage: ActionAvailabilityStage,
    options: { requireAmount?: boolean; requireWalletBalance?: boolean; requireClaimable?: boolean; requireRefundable?: boolean } = {},
  ) {
    if (!isAvailable(stage)) return t("states.stageUnavailable");
    if (!context.userAddress) return t("states.connectWallet");
    if (options.requireAmount && parsedAmount <= 0n) return t("errors.amountRequired");
    if (options.requireWalletBalance && balance < parsedAmount) return t("errors.insufficientBalance");
    if (options.requireClaimable && (!galleryState?.claimableRewards || galleryState.claimableRewards <= 0n)) return t("states.noClaimable");
    if (options.requireRefundable) {
      if (!galleryState?.refundable || galleryState.refundable <= 0n) return t("states.noRefundable");
      if (parsedAmount > galleryState.refundable) return t("errors.exceedsRefundable");
    }
    return null;
  }

  async function approve() {
    setTxState("approving");
    const hash = await sdk.writeContract({
      contract: "token",
      address: paymentTokenAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [context.vaultAddress, parsedAmount],
    });
    setTxState("approval_confirming");
    await sdk.waitForTx(hash);
    sdk.notify.success(t("messages.approveSuccess"));
    await loadData();
  }

  async function reserve() {
    const reason = disabledReason("internal-market", { requireAmount: true, requireWalletBalance: true });
    if (reason) {
      setError(reason);
      setTxState("failed");
      return;
    }
    setError(null);
    setActiveAction("reserve");
    try {
      if (needsApproval) {
        await approve();
        setTxState("idle");
        return;
      }
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: actionGalleryExampleVaultAbi,
        functionName: "reserve",
        args: [parsedAmount],
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.reserveSuccess"));
      await loadData();
      setTxState("idle");
    } catch (nextError) {
      setError(handleTxError(nextError, txErrorMessages));
      setTxState("failed");
    } finally {
      setActiveAction(null);
    }
  }

  async function claim() {
    const reason = disabledReason("dex-listed", { requireClaimable: true });
    if (reason) {
      setError(reason);
      setTxState("failed");
      return;
    }
    setError(null);
    setActiveAction("claim");
    try {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: actionGalleryExampleVaultAbi,
        functionName: "claimRewards",
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.claimSuccess"));
      await loadData();
      setTxState("idle");
    } catch (nextError) {
      setError(handleTxError(nextError, txErrorMessages));
      setTxState("failed");
    } finally {
      setActiveAction(null);
    }
  }

  async function refund() {
    const reason = disabledReason("both", { requireAmount: true, requireRefundable: true });
    if (reason) {
      setError(reason);
      setTxState("failed");
      return;
    }
    setError(null);
    setActiveAction("refund");
    try {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: actionGalleryExampleVaultAbi,
        functionName: "requestRefund",
        args: [parsedAmount],
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.refundSuccess"));
      await loadData();
      setTxState("idle");
    } catch (nextError) {
      setError(handleTxError(nextError, txErrorMessages));
      setTxState("failed");
    } finally {
      setActiveAction(null);
    }
  }

  async function refresh() {
    setError(null);
    setActiveAction("refresh");
    try {
      await loadData();
      sdk.notify.success(t("messages.refreshSuccess"));
    } catch (nextError) {
      setError(handleTxError(nextError, txErrorMessages));
    } finally {
      setActiveAction(null);
    }
  }

  const reserveReason = disabledReason("internal-market", { requireAmount: true, requireWalletBalance: true });
  const claimReason = disabledReason("dex-listed", { requireClaimable: true });
  const refundReason = disabledReason("both", { requireAmount: true, requireRefundable: true });
  const deadlineMs = galleryState?.deadline ? galleryState.deadline * 1000 : undefined;

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>{t("sections.flowStatus")}</CardTitle>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#a8b5c7]">{t("sections.flowStatusDescription")}</p>
          </div>
          <StatusBadge tone={marketPhase === "unknown" ? "warning" : "success"}>{marketPhaseLabel}</StatusBadge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[#3d4f68] bg-[#121b2b] p-5 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.32em] text-[#9facbf]">{t("labels.deadline")}</div>
            <div className="mt-4 text-4xl font-semibold leading-none text-white">
              <Countdown targetTimeMs={deadlineMs} />
            </div>
            <p className="mx-auto mt-4 max-w-2xl text-sm font-medium leading-6 text-[#9facbf]">{t("sections.deadlineHint")}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label={t("labels.totalReserved")} value={formatTokenAmount(galleryState?.totalReserved, decimals)} hint={tokenSymbol} />
            <Metric label={t("labels.available")} value={formatTokenAmount(galleryState?.available, decimals)} hint={tokenSymbol} />
            <Metric label={t("labels.claimable")} value={formatTokenAmount(galleryState?.claimableRewards, decimals)} hint={tokenSymbol} tone="success" />
            <Metric label={t("labels.refundable")} value={formatTokenAmount(galleryState?.refundable, decimals)} hint={tokenSymbol} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("sections.actionLab")}</CardTitle>
            <p className="mt-2 text-sm font-medium leading-6 text-[#a8b5c7]">{t("sections.actionLabDescription")}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <StatusBadge tone={isAvailable("internal-market") ? "success" : "warning"}>{t("badges.internal")}</StatusBadge>
            <StatusBadge tone={isAvailable("dex-listed") ? "success" : "warning"}>{t("badges.dexListed")}</StatusBadge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailTile label={t("labels.myReserved")} value={formatTokenAmount(position?.reserved, decimals)} detail={tokenSymbol} tone="muted" />
                <DetailTile label={t("labels.claimable")} value={formatTokenAmount(galleryState?.claimableRewards, decimals)} detail={tokenSymbol} tone="success" />
                <DetailTile label={t("labels.balance")} value={formatTokenAmount(balance, decimals)} detail={tokenSymbol} tone="muted" />
                <DetailTile label={t("labels.allowance")} value={formatTokenAmount(allowance, decimals)} detail={tokenSymbol} tone={needsApproval ? "warning" : "success"} />
              </div>

              {usingPreviewData ? <Alert tone="info">{t("notices.previewData")}</Alert> : null}
              <Alert tone="info">{t("notices.fixture")}</Alert>
            </div>

            <div className="rounded-lg border border-[#40536c] bg-[#172131] p-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-[#d8e2ef]">{t("labels.amount")}</span>
                <Input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} aria-label={t("labels.amount")} />
              </label>
              {error ? <Alert className="mt-3" tone="danger">{error}</Alert> : null}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-[#40536c] bg-[#172131] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusBadge tone={isAvailable("internal-market") ? "success" : "warning"}>{t("stages.internal")}</StatusBadge>
                {reserveReason ? <span className="text-xs font-medium text-[#9facbf]">{reserveReason}</span> : null}
              </div>
              <h3 className="text-sm font-semibold text-white">{t("actions.reserve")}</h3>
              <p className="mt-2 text-sm font-medium leading-6 text-[#a8b5c7]">{t("descriptions.reserve")}</p>
              {needsApproval ? <Alert className="mt-3" tone="warning">{t("states.approvalNeeded")}</Alert> : null}
              <TxButton
                className="mt-3 w-full"
                idleLabel={needsApproval ? t("actions.approve") : t("actions.reserve")}
                state={activeAction === "reserve" ? txState : "idle"}
                disabled={Boolean(reserveReason) || (activeAction !== null && activeAction !== "reserve")}
                onClick={() => void reserve()}
              />
            </div>

            <div className="rounded-lg border border-[#40536c] bg-[#172131] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusBadge tone={isAvailable("dex-listed") ? "success" : "warning"}>{t("stages.dexListed")}</StatusBadge>
                {claimReason ? <span className="text-xs font-medium text-[#9facbf]">{claimReason}</span> : null}
              </div>
              <h3 className="text-sm font-semibold text-white">{t("actions.claim")}</h3>
              <p className="mt-2 text-sm font-medium leading-6 text-[#a8b5c7]">{t("descriptions.claim")}</p>
              <TxButton
                className="mt-3 w-full"
                idleLabel={t("actions.claim")}
                state={activeAction === "claim" ? txState : "idle"}
                disabled={Boolean(claimReason) || (activeAction !== null && activeAction !== "claim")}
                onClick={() => void claim()}
              />
            </div>

            <div className="rounded-lg border border-[#40536c] bg-[#172131] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusBadge tone="success">{t("stages.both")}</StatusBadge>
                {refundReason ? <span className="text-xs font-medium text-[#9facbf]">{refundReason}</span> : null}
              </div>
              <h3 className="text-sm font-semibold text-white">{t("actions.refund")}</h3>
              <p className="mt-2 text-sm font-medium leading-6 text-[#a8b5c7]">{t("descriptions.refund")}</p>
              <TxButton
                className="mt-3 w-full"
                idleLabel={t("actions.refund")}
                state={activeAction === "refund" ? txState : "idle"}
                disabled={Boolean(refundReason) || (activeAction !== null && activeAction !== "refund")}
                onClick={() => void refund()}
              />
            </div>

            <div className="rounded-lg border border-[#40536c] bg-[#172131] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusBadge tone="neutral">{t("stages.readOnly")}</StatusBadge>
              </div>
              <h3 className="text-sm font-semibold text-white">{t("actions.refresh")}</h3>
              <p className="mt-2 text-sm font-medium leading-6 text-[#a8b5c7]">{t("descriptions.refresh")}</p>
              <Button className="mt-3 w-full" variant="outline" loading={activeAction === "refresh"} disabled={activeAction !== null && activeAction !== "refresh"} onClick={() => void refresh()}>
                {t("actions.refresh")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.runtime")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailTile label={t("labels.myReserved")} value={formatTokenAmount(position?.reserved, decimals)} detail={tokenSymbol} tone="muted" />
            <DetailTile label={t("labels.myClaimed")} value={formatTokenAmount(position?.claimed, decimals)} detail={tokenSymbol} />
            <DetailTile label={t("labels.myRefunded")} value={formatTokenAmount(position?.refunded, decimals)} detail={tokenSymbol} />
            <DetailTile label={t("labels.balance")} value={formatTokenAmount(balance, decimals)} detail={tokenSymbol} tone="muted" />
            <DetailTile label={t("labels.allowance")} value={formatTokenAmount(allowance, decimals)} detail={tokenSymbol} tone={needsApproval ? "warning" : "success"} />
            <DetailTile label={t("labels.deadline")} value={galleryState?.deadline ? new Date(galleryState.deadline * 1000).toLocaleString() : "-"} />
            <DetailTile label={t("labels.marketPhase")} value={marketPhaseLabel} tone={marketPhase === "unknown" ? "warning" : "success"} />
            <DetailTile label={t("labels.hostSurface")} value={host.renderSurface} tone="muted" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
