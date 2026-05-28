"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionAvailabilityStage, VaultComponentProps } from "@/src/sdk";
import { erc20Abi, formatTokenAmount, handleTxError, isActionAvailableForPhase, parseTokenAmount, readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { AddressLink, Alert, Card, CardContent, CardHeader, CardTitle, DetailTile, Input, Metric, StatusBadge, TxButton } from "@/src/ui";
import type { TxButtonState } from "@/src/ui/TxButton";
import { dexListedExampleVaultAbi } from "./VaultABI";

interface SaleInfo {
  totalPurchased: bigint;
  remaining: bigint;
  minPurchase: bigint;
  maxPurchase: bigint;
}

interface PurchaseInfo {
  purchased: bigint;
  claimable: bigint;
}

export default function DexListedExampleVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const { context, i18n } = sdk;
  const t = i18n.t;
  const [saleInfo, setSaleInfo] = useState<SaleInfo | null>(null);
  const [purchaseInfo, setPurchaseInfo] = useState<PurchaseInfo | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [amount, setAmount] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [usingPreviewData, setUsingPreviewData] = useState(false);
  const [txState, setTxState] = useState<TxButtonState>("idle");

  const decimals = context.paymentToken?.decimals ?? 18;
  const tokenSymbol = context.paymentToken?.symbol ?? context.tokenSymbol;
  const paymentTokenAddress = context.paymentToken?.address ?? context.tokenAddress;
  const previewFixture = context.extraConfig?.previewFixture === true;
  const actionStage: ActionAvailabilityStage = "dex-listed";
  const host = readTaxVaultHostContext(context.host);
  const marketPhase = host.marketPhase;
  const actionAvailable = isActionAvailableForPhase(actionStage, marketPhase);
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
  const unavailableReason = !context.userAddress
    ? t("states.connectWallet")
    : !actionAvailable
      ? t("states.waitForDexListed")
      : parsedAmount <= 0n
        ? t("errors.amountRequired")
        : balance < parsedAmount
          ? t("errors.insufficientBalance")
          : null;

  const applyPreviewData = useCallback(() => {
    setSaleInfo({
      totalPurchased: parseTokenAmount("120000", decimals),
      remaining: parseTokenAmount("50000", decimals),
      minPurchase: parseTokenAmount("10", decimals),
      maxPurchase: parseTokenAmount("1000", decimals),
    });
    setPurchaseInfo(null);
    setBalance(parseTokenAmount("2500", decimals));
    setAllowance(0n);
    setUsingPreviewData(true);
  }, [decimals]);

  const loadData = useCallback(async () => {
    if (previewFixture) {
      applyPreviewData();
      setError(null);
      return;
    }

    const nextSaleInfo = await sdk.readContract<SaleInfo>({
      contract: "vault",
      address: context.vaultAddress,
      abi: dexListedExampleVaultAbi,
      functionName: "saleInfo",
    });
    setSaleInfo(nextSaleInfo);
    setUsingPreviewData(false);

    if (!context.userAddress) {
      setPurchaseInfo(null);
      setBalance(0n);
      setAllowance(0n);
      return;
    }

    const [nextPurchaseInfo, nextBalance, nextAllowance] = await Promise.all([
      sdk.readContract<PurchaseInfo>({
        contract: "vault",
        address: context.vaultAddress,
        abi: dexListedExampleVaultAbi,
        functionName: "purchaseOf",
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
    setPurchaseInfo(nextPurchaseInfo);
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

  async function approve() {
    setError(null);
    setTxState("approving");
    try {
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
      setTxState("idle");
    } catch (nextError) {
      setError(handleTxError(nextError, txErrorMessages));
      setTxState("failed");
    }
  }

  async function buyListed() {
    setError(null);
    if (unavailableReason) {
      setError(unavailableReason);
      setTxState("failed");
      return;
    }
    if (needsApproval) {
      await approve();
      return;
    }

    try {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: dexListedExampleVaultAbi,
        functionName: "buyListed",
        args: [parsedAmount],
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.buySuccess"));
      await loadData();
      setTxState("idle");
    } catch (nextError) {
      setError(handleTxError(nextError, txErrorMessages));
      setTxState("failed");
    }
  }

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>{t("sections.allocationStatus")}</CardTitle>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#a8b5c7]">{t("sections.allocationStatusDescription")}</p>
          </div>
          <StatusBadge tone={actionAvailable ? "success" : "warning"}>
            {actionAvailable ? t("states.actionAvailable") : t("states.actionUnavailable")}
          </StatusBadge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[#3d4f68] bg-[#121b2b] p-5 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.32em] text-[#9facbf]">{t("labels.remainingWindow")}</div>
            <div className="mt-4 break-words text-4xl font-semibold leading-none text-white">
              {formatTokenAmount(saleInfo?.remaining, decimals)}
            </div>
            <div className="mt-3 text-sm font-semibold text-[#a8b5c7]">{tokenSymbol}</div>
            <p className="mx-auto mt-4 max-w-2xl text-sm font-medium leading-6 text-[#9facbf]">{t("notices.fixture")}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label={t("labels.totalPurchased")} value={formatTokenAmount(saleInfo?.totalPurchased, decimals)} hint={tokenSymbol} />
            <Metric label={t("labels.remaining")} value={formatTokenAmount(saleInfo?.remaining, decimals)} hint={tokenSymbol} tone="success" />
            <Metric label={t("labels.myPurchased")} value={formatTokenAmount(purchaseInfo?.purchased, decimals)} hint={tokenSymbol} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("actions.buyListed")}</CardTitle>
            <p className="mt-2 text-sm font-medium leading-6 text-[#a8b5c7]">{t("sections.actionDescription")}</p>
          </div>
          <StatusBadge tone={marketPhase === "dex-listed" ? "success" : "warning"}>{marketPhaseLabel}</StatusBadge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.78fr)]">
            <div className="space-y-3">
              {usingPreviewData ? <Alert tone="info">{t("notices.previewData")}</Alert> : null}
              <Alert tone={actionAvailable ? "success" : "warning"}>{actionAvailable ? t("states.dexListedReady") : t("states.waitForDexListed")}</Alert>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailTile label={t("labels.minPurchase")} value={formatTokenAmount(saleInfo?.minPurchase, decimals)} detail={tokenSymbol} />
                <DetailTile label={t("labels.maxPurchase")} value={formatTokenAmount(saleInfo?.maxPurchase, decimals)} detail={tokenSymbol} />
                <DetailTile label={t("labels.balance")} value={formatTokenAmount(balance, decimals)} detail={tokenSymbol} tone="muted" />
                <DetailTile
                  label={t("labels.allowance")}
                  value={formatTokenAmount(allowance, decimals)}
                  detail={tokenSymbol}
                  tone={needsApproval ? "warning" : "success"}
                />
              </div>
            </div>

            <div className="self-start rounded-lg border border-[#40536c] bg-[#172131] p-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-[#d8e2ef]">{t("labels.amount")}</span>
                <Input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
              </label>
              <div className="mt-3 space-y-2">
                {needsApproval ? <Alert tone="warning">{t("states.approvalNeeded")}</Alert> : null}
                {unavailableReason ? <Alert tone="warning">{unavailableReason}</Alert> : null}
                {error ? <Alert tone="danger">{error}</Alert> : null}
              </div>
              <TxButton
                className="mt-3 w-full"
                idleLabel={needsApproval ? t("actions.approve") : t("actions.buyListed")}
                state={txState}
                onClick={() => void buyListed()}
                disabled={Boolean(unavailableReason)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("labels.runtime")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DetailTile label={t("labels.vault")} value={<AddressLink address={context.vaultAddress} explorerBaseUrl={context.explorerBaseUrl} />} tone="muted" />
            <DetailTile label={t("labels.token")} value={<AddressLink address={context.tokenAddress} explorerBaseUrl={context.explorerBaseUrl} label={context.tokenSymbol} />} tone="muted" />
            <DetailTile label={t("labels.factory")} value={<AddressLink address={context.factoryAddress} explorerBaseUrl={context.explorerBaseUrl} />} tone="muted" />
            <DetailTile label={t("labels.marketPhase")} value={marketPhaseLabel} tone={marketPhase === "dex-listed" ? "success" : "warning"} />
            <DetailTile label={t("labels.hostSurface")} value={host.renderSurface} tone="muted" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
