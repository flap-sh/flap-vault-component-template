"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, RefreshCcw, ShieldCheck, Timer, Wallet, Zap } from "lucide-react";
import type { ActionAvailabilityStage, Address, VaultComponentProps } from "@/src/sdk";
import { erc20Abi, formatTokenAmount, handleTxError, isActionAvailableForPhase, parseTokenAmount, readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { exampleVaultAbi } from "./VaultABI";
import { AddressLink, Alert, Button, Card, CardContent, CardHeader, CardTitle, Countdown, DetailTile, Input, Metric, StatusBadge, TxButton, type TxButtonState } from "@/src/ui";

interface VaultInfo {
  totalDeposited: bigint;
  rewardEndsAt: number;
}

interface MyInfo {
  deposited: bigint;
  claimable: bigint;
}

type VaultInfoTuple = readonly [totalDeposited: bigint, rewardEndsAt: bigint];
type MyInfoTuple = readonly [deposited: bigint, claimable: bigint];

interface OracleData {
  rewardMultiplierBps: number;
  timestamp: number;
  signature: Address;
}

const sparklineHeights = [38, 52, 46, 64, 58, 78, 70, 88, 82, 100] as const;
type QuickAmountPercent = 25 | 50 | 75 | 100;

function toTimestampMs(value: bigint) {
  const numeric = Number(value);
  return numeric > 10_000_000_000 ? numeric : numeric * 1000;
}

function toVaultInfo(tuple: VaultInfoTuple): VaultInfo {
  return {
    totalDeposited: tuple[0],
    rewardEndsAt: toTimestampMs(tuple[1]),
  };
}

function toMyInfo(tuple: MyInfoTuple): MyInfo {
  return {
    deposited: tuple[0],
    claimable: tuple[1],
  };
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
  const riskTone = riskLevel === null || riskLevel === 0 || riskLevel >= 4 ? "danger" : riskLevel >= 3 ? "warning" : "success";
  const actionUnavailableReason = !context.userAddress
    ? t("states.connectWallet")
    : sdk.wallet.isWrongNetwork
      ? t("states.wrongNetwork", undefined, { chain: sdk.wallet.requiredChainLabel })
      : !actionsAvailable
        ? t("states.actionsUnavailable")
        : null;
  const writesDisabled = !actionsAvailable || !context.userAddress || sdk.wallet.isWrongNetwork;
  const depositRouteLabel = needsApproval ? t("states.routeApproveDeposit") : t("states.routeDeposit");
  const oracleDetail = oracle ? t("labels.oracleUpdated", undefined, { timestamp: oracle.timestamp }) : t("states.oracleUnavailable");
  const quickAmountOptions = [
    { percent: 25, label: t("actions.percent25") },
    { percent: 50, label: t("actions.percent50") },
    { percent: 75, label: t("actions.percent75") },
    { percent: 100, label: t("actions.percent100") },
  ] as const;

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
      sdk.readContract<VaultInfoTuple>({
        contract: "vault",
        address: context.vaultAddress,
        abi: exampleVaultAbi,
        functionName: "vaultInfo",
      }),
      sdk.readOracle<OracleData>("example-reward-oracle").catch(() => null),
    ]);
    setVaultInfo(toVaultInfo(nextVaultInfo));
    setOracle(nextOracle);
    setUsingPreviewData(false);

    if (!context.userAddress) {
      setMyInfo(null);
      setBalance(0n);
      setAllowance(0n);
      return;
    }

    const [nextMyInfo, nextBalance, nextAllowance] = await Promise.all([
      sdk.readContract<MyInfoTuple>({
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
    setMyInfo(toMyInfo(nextMyInfo));
    setBalance(nextBalance);
    setAllowance(nextAllowance);
  }, [applyPreviewData, context.tokenAddress, context.userAddress, context.vaultAddress, previewFixture, sdk]);

  useEffect(() => {
    void loadData().catch((nextError) => setError(handleTxError(nextError, readErrorMessages)));
    const timer = setInterval(() => {
      void loadData().catch(() => undefined);
    }, 15_000);
    return () => clearInterval(timer);
  }, [loadData, readErrorMessages]);

  const setAmountFromBalance = useCallback(
    (percent: QuickAmountPercent) => {
      const nextAmount = (balance * BigInt(percent)) / 100n;
      setAmount(formatTokenAmount(nextAmount, decimals, 6));
    },
    [balance],
  );

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
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>{t("sections.rewardStatus")}</CardTitle>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#a8b5c7]">{t("sections.rewardStatusDescription")}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <StatusBadge tone={riskTone}>{riskLabel}</StatusBadge>
              <StatusBadge tone={actionsAvailable ? "success" : "warning"}>{marketPhaseLabel}</StatusBadge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {riskLevel === null ? <Alert tone="danger">{t("notices.riskMissing")}</Alert> : null}
          {usingPreviewData ? <Alert tone="info">{t("notices.previewData")}</Alert> : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(16rem,0.92fr)]">
            <div className="rounded-lg border border-[#344963] bg-[#101827] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#d8e2ef]">
                <Info className="h-4 w-4 text-[#a78bfa]" />
                {t("sections.mechanism")}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
                <FlowNode title={t("flow.deposit")} detail={t("flow.depositDetail")} />
                <FlowArrow />
                <FlowNode title={t("flow.reward")} detail={t("flow.rewardDetail")} />
                <FlowArrow />
                <FlowNode title={t("flow.claim")} detail={t("flow.claimDetail")} />
              </div>
              <p className="mt-4 text-sm font-medium leading-6 text-[#9facbf]">{t("flow.description")}</p>
              <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-[#6d5dd3]/35 bg-[#241d42]/65 p-3 text-sm">
                <span className="shrink-0 text-xs font-semibold text-[#c4b5fd]">{t("labels.vaultTarget")}</span>
                <AddressLink address={context.vaultAddress} explorerBaseUrl={context.explorerBaseUrl} />
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-lg border border-[#f0b90b]/25 bg-[#172131] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-center gap-2 text-xs font-medium text-[#a9b6c8]">
                  <Timer className="h-4 w-4 text-[#f0b90b]" />
                  {t("labels.rewardWindow")}
                </div>
                <div className="mt-3 break-words text-3xl font-semibold leading-none text-white">
                  <Countdown targetTimeMs={vaultInfo?.rewardEndsAt} />
                </div>
                <div className="mt-2 text-xs font-medium text-[#8d9caf]">{t("sections.rewardWindowHint")}</div>
              </div>
              <div className="rounded-lg border border-[#a78bfa]/30 bg-[#151b2b] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-center gap-2 text-xs font-medium text-[#a9b6c8]">
                  <Zap className="h-4 w-4 text-[#a78bfa]" />
                  {t("labels.oracle")}
                </div>
                <div className="mt-3 text-3xl font-semibold leading-none text-white">{oracle ? `${oracle.rewardMultiplierBps / 100}x` : "-"}</div>
                <Sparkline />
                <div className="mt-2 break-words text-xs font-medium text-[#8d9caf]">{oracleDetail}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label={t("labels.totalDeposited")} value={formatTokenAmount(vaultInfo?.totalDeposited, decimals)} hint={context.tokenSymbol} tone="primary" />
            <Metric label={t("labels.myDeposit")} value={formatTokenAmount(myInfo?.deposited, decimals)} hint={context.tokenSymbol} />
            <Metric label={t("labels.claimable")} value={formatTokenAmount(myInfo?.claimable, decimals)} hint={context.tokenSymbol} tone="success" />
            <Metric label={t("labels.allowance")} value={formatTokenAmount(allowance, decimals)} hint={context.tokenSymbol} tone={needsApproval ? "warning" : "muted"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{t("actions.deposit")}</CardTitle>
              <p className="mt-2 text-sm font-medium leading-6 text-[#a8b5c7]">{t("sections.actionDescription")}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadData()}>
              <RefreshCcw className="h-4 w-4" />
              {t("actions.refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert tone="info">{t("notices.actionStageBoth")}</Alert>
          {actionUnavailableReason ? <Alert tone="warning">{actionUnavailableReason}</Alert> : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.72fr)_minmax(18rem,1fr)]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <DetailTile
                icon={<Wallet className="h-4 w-4" />}
                label={t("labels.availableBalance")}
                value={formatTokenAmount(balance, decimals)}
                detail={context.tokenSymbol}
                tone="muted"
              />
              <DetailTile
                icon={<ShieldCheck className="h-4 w-4" />}
                label={t("labels.allowance")}
                value={formatTokenAmount(allowance, decimals)}
                detail={needsApproval ? t("states.approvalNeeded") : t("states.approvalReady")}
                tone={needsApproval ? "warning" : "success"}
              />
              <DetailTile label={t("labels.myDeposit")} value={formatTokenAmount(myInfo?.deposited, decimals)} detail={context.tokenSymbol} />
              <DetailTile label={t("labels.claimable")} value={formatTokenAmount(myInfo?.claimable, decimals)} detail={myInfo?.claimable && myInfo.claimable > 0n ? context.tokenSymbol : t("states.noClaimable")} tone="success" />
            </div>

            <div className="rounded-lg border border-[#40536c] bg-[#172131] p-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-[#d8e2ef]">{t("labels.amount")}</span>
                <Input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
              </label>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {quickAmountOptions.map(({ percent, label }) => (
                  <Button key={percent} variant="ghost" size="sm" onClick={() => setAmountFromBalance(percent)} disabled={!context.userAddress || balance <= 0n}>
                    {label}
                  </Button>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <DetailTile label={t("labels.estimatedDeposit")} value={formatTokenAmount(parsedAmount, decimals)} detail={context.tokenSymbol} tone="primary" />
                <DetailTile label={t("labels.approvalRoute")} value={depositRouteLabel} detail={context.vaultAddress} tone={needsApproval ? "warning" : "success"} />
              </div>
              <div className="mt-3 space-y-2">
                {needsApproval ? <Alert tone="warning">{t("states.approvalNeeded")}</Alert> : null}
                {error ? <Alert tone="danger">{error}</Alert> : null}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {sdk.wallet.isWrongNetwork ? (
                  <Button className="w-full sm:col-span-2" variant="outline" loading={sdk.wallet.isSwitchingChain} onClick={() => void sdk.wallet.switchChain().catch((nextError) => setError(handleTxError(nextError, txErrorMessages)))}>
                    {t("actions.switchNetwork")}
                  </Button>
                ) : null}
                <TxButton
                  className="w-full"
                  idleLabel={needsApproval ? t("actions.approve") : t("actions.deposit")}
                  state={depositTxState}
                  onClick={() => void deposit()}
                  disabled={writesDisabled}
                />
                <Button
                  className="w-full"
                  variant="outline"
                  loading={claiming}
                  onClick={() => void claim()}
                  disabled={writesDisabled || !myInfo?.claimable || myInfo.claimable <= 0n}
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
            <DetailTile label={t("labels.riskStatus")} value={riskLabel} tone={riskTone === "success" ? "success" : "warning"} />
            <DetailTile label={t("labels.feeMode")} value={host.feeMode} />
            <DetailTile label={t("labels.renderSurface")} value={host.renderSurface} />
            <DetailTile label={t("labels.marketBps")} value={host.taxInfo ? String(host.taxInfo.marketBps) : "-"} />
            <DetailTile label={t("labels.vaultType")} value={host.vaultType ?? "-"} />
            <DetailTile label={t("labels.rewardWindow")} value={<Countdown targetTimeMs={vaultInfo?.rewardEndsAt} />} />
          </div>
          <Alert>{t("notices.safety")}</Alert>
        </CardContent>
      </Card>
    </div>
  );
}

function FlowNode({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[#40536c] bg-[#172131] p-3 text-center">
      <div className="break-words text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 break-words text-xs font-medium leading-5 text-[#8d9caf]">{detail}</div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="hidden min-h-16 place-items-center text-lg font-semibold text-[#a78bfa] sm:grid" aria-hidden="true">
      →
    </div>
  );
}

function Sparkline() {
  return (
    <div className="mt-3 flex h-7 items-end gap-1" aria-hidden="true">
      {sparklineHeights.map((height) => (
        <span
          key={height}
          className="min-w-0 flex-1 rounded-sm bg-gradient-to-b from-[#a78bfa] to-[#4c1d95]/40"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}
