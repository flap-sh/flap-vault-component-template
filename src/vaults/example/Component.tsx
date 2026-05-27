"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionAvailabilityStage, Address, VaultComponentProps } from "@/src/sdk";
import { erc20Abi, formatTokenAmount, handleTxError, isActionAvailableForPhase, parseTokenAmount, readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { exampleVaultAbi } from "./VaultABI";
import { AddressLink, Alert, Button, Card, CardContent, CardHeader, CardTitle, Countdown, DetailTile, Input, Metric, StatusBadge, TxButton } from "@/src/ui";
import type { TxButtonState } from "@/src/ui/TxButton";

interface VaultInfo {
  totalDeposited: bigint;
  rewardEndsAt: number;
}

interface MyInfo {
  deposited: bigint;
  claimable: bigint;
}

interface OracleData {
  rewardMultiplierBps: number;
  timestamp: number;
  signature: Address;
}

export default function ExampleRewardVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const { context, i18n } = sdk;
  const t = i18n.t;
  const [vaultInfo, setVaultInfo] = useState<VaultInfo | null>(null);
  const [myInfo, setMyInfo] = useState<MyInfo | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [oracle, setOracle] = useState<OracleData | null>(null);
  const [amount, setAmount] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [depositTxState, setDepositTxState] = useState<TxButtonState>("idle");
  const [claiming, setClaiming] = useState(false);
  const [usingPreviewData, setUsingPreviewData] = useState(false);

  const decimals = 18;
  const previewFixture = context.extraConfig?.previewFixture === true;
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
  }, [amount]);
  const needsApproval = parsedAmount > 0n && allowance < parsedAmount;
  const actionStage: ActionAvailabilityStage = "both";
  const host = readTaxVaultHostContext(context.host);
  const marketPhase = host.marketPhase;
  const actionsAvailable = isActionAvailableForPhase(actionStage, marketPhase);
  const marketPhaseLabel =
    marketPhase === "internal-market"
      ? t("states.marketPhaseInternal")
      : marketPhase === "dex-listed"
        ? t("states.marketPhaseDexListed")
        : t("states.marketPhaseUnknown");

  const applyPreviewData = useCallback(() => {
    const rewardEndsAt = Date.now() + 2 * 60 * 60 * 1000;
    setVaultInfo({
      totalDeposited: parseTokenAmount("125000", decimals),
      rewardEndsAt,
    });
    setMyInfo({
      deposited: parseTokenAmount("2400", decimals),
      claimable: parseTokenAmount("185", decimals),
    });
    setBalance(parseTokenAmount("8200", decimals));
    setAllowance(parseTokenAmount("500", decimals));
    setOracle({
      rewardMultiplierBps: 175,
      timestamp: Math.floor(Date.now() / 1000),
      signature: context.vaultAddress,
    });
    setUsingPreviewData(true);
  }, [context.vaultAddress]);

  const loadData = useCallback(async () => {
    if (previewFixture) {
      applyPreviewData();
      setError(null);
      return;
    }

    const [nextVaultInfo, nextOracle] = await Promise.all([
      sdk.readContract<VaultInfo>({
        contract: "vault",
        address: context.vaultAddress,
        abi: exampleVaultAbi,
        functionName: "vaultInfo",
      }),
      sdk.readOracle<OracleData>("example-reward-oracle").catch(() => null),
    ]);
    setVaultInfo(nextVaultInfo);
    setOracle(nextOracle);
    setUsingPreviewData(false);

    if (!context.userAddress) {
      setMyInfo(null);
      setBalance(0n);
      setAllowance(0n);
      return;
    }

    const [nextMyInfo, nextBalance, nextAllowance] = await Promise.all([
      sdk.readContract<MyInfo>({
        contract: "vault",
        address: context.vaultAddress,
        abi: exampleVaultAbi,
        functionName: "myInfoOf",
        args: [context.userAddress],
      }),
      sdk.readContract<bigint>({
        contract: "token",
        address: context.tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
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
    setMyInfo(nextMyInfo);
    setBalance(nextBalance);
    setAllowance(nextAllowance);
  }, [applyPreviewData, context.tokenAddress, context.userAddress, context.vaultAddress, previewFixture, sdk]);

  useEffect(() => {
    void loadData().catch((nextError) => setError(handleTxError(nextError, readErrorMessages)));
    const timer = window.setInterval(() => {
      void loadData().catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadData, readErrorMessages]);

  async function approve() {
    setError(null);
    setDepositTxState("approving");
    try {
      const hash = await sdk.writeContract({
        contract: "token",
        address: context.tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [context.vaultAddress, parsedAmount],
      });
      setDepositTxState("approval_confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.approveSuccess"));
      await loadData();
      setDepositTxState("idle");
    } catch (nextError) {
      setError(handleTxError(nextError, txErrorMessages));
      setDepositTxState("failed");
    }
  }

  async function deposit() {
    setError(null);
    if (parsedAmount <= 0n) {
      setError(t("errors.amountRequired"));
      setDepositTxState("failed");
      return;
    }
    if (balance < parsedAmount) {
      setError(t("errors.insufficientBalance"));
      setDepositTxState("failed");
      return;
    }
    if (needsApproval) {
      await approve();
      return;
    }
    try {
      setDepositTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: exampleVaultAbi,
        functionName: "deposit",
        args: [parsedAmount],
      });
      setDepositTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setDepositTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.depositSuccess"));
      await loadData();
      setDepositTxState("idle");
    } catch (nextError) {
      setError(handleTxError(nextError, txErrorMessages));
      setDepositTxState("failed");
    }
  }

  async function claim() {
    setError(null);
    setClaiming(true);
    try {
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: exampleVaultAbi,
        functionName: "claim",
        args: [],
      });
      const hash = await sdk.writeContract(simulation.request);
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.claimSuccess"));
      await loadData();
    } catch (nextError) {
      setError(handleTxError(nextError, txErrorMessages));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>{t("sections.rewardStatus")}</CardTitle>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#a8b5c7]">{t("sections.rewardStatusDescription")}</p>
          </div>
          <StatusBadge tone={actionsAvailable ? "success" : "warning"}>{marketPhaseLabel}</StatusBadge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[#3d4f68] bg-[#121b2b] p-5 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.32em] text-[#9facbf]">{t("labels.rewardWindow")}</div>
            <div className="mt-4 text-4xl font-semibold leading-none text-white">
              <Countdown targetTimeMs={vaultInfo?.rewardEndsAt} />
            </div>
            <p className="mx-auto mt-4 max-w-2xl text-sm font-medium leading-6 text-[#9facbf]">{t("sections.rewardWindowHint")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label={t("labels.totalDeposited")} value={formatTokenAmount(vaultInfo?.totalDeposited, decimals)} hint={context.tokenSymbol} />
            <Metric label={t("labels.myDeposit")} value={formatTokenAmount(myInfo?.deposited, decimals)} hint={context.tokenSymbol} />
            <Metric label={t("labels.claimable")} value={formatTokenAmount(myInfo?.claimable, decimals)} hint={context.tokenSymbol} tone="success" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("actions.deposit")}</CardTitle>
          <p className="mt-2 text-sm font-medium leading-6 text-[#a8b5c7]">{t("sections.actionDescription")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
            <div className="space-y-3">
              {usingPreviewData ? <Alert tone="info">{t("notices.previewData")}</Alert> : null}
              <Alert tone="info">{t("notices.actionStageBoth")}</Alert>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailTile label={t("labels.myDeposit")} value={formatTokenAmount(myInfo?.deposited, decimals)} detail={context.tokenSymbol} tone="muted" />
                <DetailTile label={t("labels.claimable")} value={formatTokenAmount(myInfo?.claimable, decimals)} detail={context.tokenSymbol} tone="success" />
                <DetailTile label={t("labels.allowance")} value={formatTokenAmount(allowance, decimals)} detail={context.tokenSymbol} tone={needsApproval ? "warning" : "success"} />
                <DetailTile label={t("labels.oracle")} value={oracle ? `${oracle.rewardMultiplierBps / 100}x` : "-"} detail={oracle ? `ts ${oracle.timestamp}` : undefined} />
              </div>
            </div>

            <div className="rounded-lg border border-[#40536c] bg-[#172131] p-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-[#d8e2ef]">{t("labels.amount")}</span>
              <Input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
            </label>
              <div className="mt-3 space-y-2">
                {needsApproval ? <Alert tone="warning">{t("states.approvalNeeded")}</Alert> : null}
                {error ? <Alert tone="danger">{error}</Alert> : null}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <TxButton
                className="w-full"
                idleLabel={needsApproval ? t("actions.approve") : t("actions.deposit")}
                state={depositTxState}
                onClick={() => void deposit()}
                disabled={!actionsAvailable || !context.userAddress}
              />
              <Button
                className="w-full"
                variant="outline"
                loading={claiming}
                onClick={() => void claim()}
                disabled={!actionsAvailable || !context.userAddress || !myInfo?.claimable || myInfo.claimable <= 0n}
              >
                {t("actions.claim")}
              </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("labels.runtime")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DetailTile label={t("labels.vault")} value={<AddressLink address={context.vaultAddress} explorerBaseUrl={context.explorerBaseUrl} />} tone="muted" />
            <DetailTile label={t("labels.token")} value={<AddressLink address={context.tokenAddress} explorerBaseUrl={context.explorerBaseUrl} label={context.tokenSymbol} />} tone="muted" />
            <DetailTile label={t("labels.marketPhase")} value={marketPhaseLabel} tone={marketPhase === "unknown" ? "warning" : "success"} />
            <DetailTile label={t("labels.feeMode")} value={host.feeMode} />
            <DetailTile label={t("labels.renderSurface")} value={host.renderSurface} />
            <DetailTile label={t("labels.marketBps")} value={host.taxInfo ? String(host.taxInfo.marketBps) : "-"} />
            <DetailTile label={t("labels.vaultType")} value={host.vaultType ?? "-"} />
            <DetailTile label={t("labels.allowance")} value={formatTokenAmount(allowance, decimals)} detail={context.tokenSymbol} tone={needsApproval ? "warning" : "success"} />
            <DetailTile label={t("labels.rewardWindow")} value={<Countdown targetTimeMs={vaultInfo?.rewardEndsAt} />} />
          </div>
          <Alert>{t("notices.safety")}</Alert>
        </CardContent>
      </Card>
    </div>
  );
}
