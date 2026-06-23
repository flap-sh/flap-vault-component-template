"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCcw, ShieldCheck, Timer, Wallet, Zap } from "lucide-react";
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
    <div className="w-full space-y-3 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[length:34px_34px] sm:space-y-4">
      <Card className="overflow-hidden rounded-[18px] border-white/10 bg-gradient-to-b from-[#0e141d] to-[#070b11] shadow-[0_20px_70px_-38px_rgba(76,141,255,0.65)]">
        <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#4c8dff] shadow-[0_0_12px_rgba(76,141,255,0.85)]" />
                <CardTitle className="text-base sm:text-lg">{t("title")}</CardTitle>
              </div>
              <p className="max-w-2xl text-sm font-medium leading-6 text-[#7c8899]">{t("sections.rewardStatusDescription")}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <StatusBadge tone={riskTone}>{riskLabel}</StatusBadge>
              <StatusBadge tone={actionsAvailable ? "success" : "warning"}>{marketPhaseLabel}</StatusBadge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-4 pt-0 sm:space-y-4 sm:p-5 sm:pt-0">
          <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr] lg:gap-4">
            <div className="rounded-[14px] border border-white/10 bg-black/25 p-3 sm:rounded-[16px] sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#eaf1f8]">{t("sections.mechanism")}</span>
                <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs font-semibold text-[#7c8899]">
                  {t("badges.templateSafe")}
                </span>
              </div>
              <div className="mt-3 flex items-stretch gap-1.5 sm:mt-4 sm:gap-2">
                <FlowNode title={t("flow.deposit")} detail={t("flow.depositDetail")} />
                <FlowArrow />
                <FlowNode title={t("flow.reward")} detail={t("flow.rewardDetail")} />
                <FlowArrow />
                <FlowNode title={t("flow.claim")} detail={t("flow.claimDetail")} />
              </div>
              <p className="mt-3 text-xs font-semibold leading-5 text-[#7c8899] sm:mt-4 sm:text-sm sm:leading-6">{t("flow.description")}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-3">
              <Metric label={t("labels.totalDeposited")} value={formatTokenAmount(vaultInfo?.totalDeposited, decimals)} hint={context.tokenSymbol} tone="primary" />
              <Metric label={t("labels.claimable")} value={formatTokenAmount(myInfo?.claimable, decimals)} hint={context.tokenSymbol} tone="success" />
              <Metric label={t("labels.marketPhase")} value={marketPhaseLabel} hint={host.renderSurface} />
              <Metric label={t("labels.riskStatus")} value={riskLabel} hint={t("labels.hostRisk")} tone={riskTone === "success" ? "success" : "warning"} />
            </div>
          </div>

          {riskLevel === null ? <Alert tone="danger">{t("notices.riskMissing")}</Alert> : null}
          {usingPreviewData ? <Alert tone="info">{t("notices.previewData")}</Alert> : null}
          {actionUnavailableReason ? <Alert tone="warning">{actionUnavailableReason}</Alert> : null}

          <div className="grid grid-cols-2 overflow-hidden rounded-[14px] border border-white/10 sm:rounded-[16px] lg:grid-cols-4">
            <div className="min-w-0 border-white/10 bg-[#0e141d] p-3 lg:border-r">
              <div className="flex items-center gap-2 truncate text-xs font-medium text-[#7c8899]">
                <Timer className="h-3.5 w-3.5" />
                {t("labels.rewardWindow")}
              </div>
              <div className="mt-2 min-w-0 break-words text-sm font-semibold leading-tight text-[#eaf1f8]">
                <Countdown targetTimeMs={vaultInfo?.rewardEndsAt} />
              </div>
            </div>
            <div className="min-w-0 border-l border-white/10 bg-[#0e141d] p-3 lg:border-r">
              <div className="flex items-center gap-2 truncate text-xs font-medium text-[#7c8899]">
                <Zap className="h-3.5 w-3.5" />
                {t("labels.oracle")}
              </div>
              <div className="mt-2 min-w-0 break-words text-sm font-semibold leading-tight text-[#eaf1f8]">{oracle ? `${oracle.rewardMultiplierBps / 100}x` : "-"}</div>
              <div className="mt-1 truncate text-xs font-medium text-[#5a6678]">{oracleDetail}</div>
            </div>
            <div className="min-w-0 border-t border-white/10 bg-[#0e141d] p-3 sm:border-l lg:border-l-0 lg:border-t-0 lg:border-r">
              <div className="truncate text-xs font-medium text-[#7c8899]">{t("labels.myDeposit")}</div>
              <div className="mt-2 min-w-0 break-words text-sm font-semibold leading-tight text-[#eaf1f8]">{formatTokenAmount(myInfo?.deposited, decimals)}</div>
              <div className="mt-1 truncate text-xs font-medium text-[#5a6678]">{context.tokenSymbol}</div>
            </div>
            <div className="min-w-0 border-l border-t border-white/10 bg-[#0e141d] p-3 lg:border-t-0">
              <div className="truncate text-xs font-medium text-[#7c8899]">{t("labels.allowance")}</div>
              <div className="mt-2 min-w-0 break-words text-sm font-semibold leading-tight text-[#eaf1f8]">{formatTokenAmount(allowance, decimals)}</div>
              <div className="mt-1 truncate text-xs font-medium text-[#5a6678]">{needsApproval ? t("states.approvalNeeded") : t("states.approvalReady")}</div>
            </div>
          </div>

          <div className="rounded-[14px] border border-white/10 bg-black/30 p-3 sm:rounded-[16px] sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#eaf1f8]">{t("actions.deposit")}</div>
                <p className="mt-1 text-xs font-medium leading-5 text-[#7c8899]">{t("sections.actionDescription")}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void loadData()}>
                <RefreshCcw className="h-4 w-4" />
                {t("actions.refresh")}
              </Button>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <DetailTile
                  icon={<Wallet className="h-4 w-4" />}
                  label={t("labels.availableBalance")}
                  value={formatTokenAmount(balance, decimals)}
                  detail={context.tokenSymbol}
                  tone="muted"
                />
                <DetailTile
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label={t("labels.approvalRoute")}
                  value={depositRouteLabel}
                  detail={t("labels.vaultTarget")}
                  tone={needsApproval ? "warning" : "success"}
                />
              </div>

              <div className="rounded-[12px] border border-white/10 bg-white/[0.03] p-3">
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
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <DetailTile label={t("labels.estimatedDeposit")} value={formatTokenAmount(parsedAmount, decimals)} detail={context.tokenSymbol} tone="primary" />
                  <DetailTile label={t("labels.claimable")} value={formatTokenAmount(myInfo?.claimable, decimals)} detail={myInfo?.claimable && myInfo.claimable > 0n ? context.tokenSymbol : t("states.noClaimable")} tone="success" />
                </div>
                <div className="mt-3 space-y-2">
                  {needsApproval ? <Alert tone="warning">{t("states.approvalNeeded")}</Alert> : null}
                  {error ? <Alert tone="danger">{error}</Alert> : null}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <DetailTile label={t("labels.vault")} value={<AddressLink address={context.vaultAddress} explorerBaseUrl={context.explorerBaseUrl} />} tone="muted" />
            <DetailTile label={t("labels.token")} value={<AddressLink address={context.tokenAddress} explorerBaseUrl={context.explorerBaseUrl} label={context.tokenSymbol} />} tone="muted" />
            <DetailTile label={t("labels.feeMode")} value={host.feeMode} />
            <DetailTile label={t("labels.renderSurface")} value={host.renderSurface} />
            <DetailTile label={t("labels.marketBps")} value={host.taxInfo ? String(host.taxInfo.marketBps) : "-"} />
            <DetailTile label={t("labels.vaultType")} value={host.vaultType ?? "-"} />
          </div>

          <Alert>{t("notices.safety")}</Alert>
        </CardContent>
      </Card>
    </div>
  );
}

function FlowNode({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-[10px] border border-white/10 bg-white/[0.03] px-2 py-2 text-center sm:rounded-[11px] sm:py-3">
      <div className="truncate text-xs font-semibold text-[#eaf1f8] sm:text-sm">{title}</div>
      <div className="mt-0.5 truncate text-[10px] font-medium text-[#5a6678] sm:mt-1">{detail}</div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="grid place-items-center font-mono text-sm font-semibold text-[#4c8dff]" aria-hidden="true">
      <ArrowRight className="h-4 w-4" />
    </div>
  );
}
