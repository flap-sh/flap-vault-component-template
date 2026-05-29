"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, VaultComponentProps } from "@/src/sdk";
import {
  ZERO_ADDRESS,
  erc20Abi,
  formatPercentBps,
  formatTokenAmount,
  handleTxError,
  isActionAvailableForPhase,
  isValidAddress,
  parseTokenAmount,
  readTaxVaultHostContext,
  useFlapSdk,
} from "@/src/sdk";
import { AddressLink, Alert, Button, Card, CardContent, CardHeader, CardTitle, DetailTile, Input, StatusBadge, TxButton } from "@/src/ui";
import type { TxButtonState } from "@/src/ui";
import { vaultAbi } from "./VaultABI";

type VaultStatsTuple = readonly [bigint, bigint, bigint, Address, boolean, Address, Address, bigint, bigint];
type ProposalInfoTuple = readonly [Address, bigint, bigint, bigint, bigint, boolean, boolean];
type UserVoteInfoTuple = readonly [bigint, boolean, boolean, boolean];
type ActionKey = "approve" | "vote-yes" | "vote-no" | "withdraw" | "propose" | "finalize";

interface VaultSnapshot {
  taxToken: Address;
  owner: Address;
  taxRateBps: bigint;
  tokenSymbol: string;
  tokenName?: string;
  tokenDecimals: number;
  stats: {
    treasuryBNB: bigint;
    proposalAllowedAt: bigint;
    currentProposalId: bigint;
    approvedBuybackToken: Address;
    buybackTokenLocked: boolean;
    lastBuybackAt: bigint;
    nextBuybackAt: bigint;
  };
  proposal?: {
    proposedToken: Address;
    voteStart: bigint;
    voteEnd: bigint;
    yesVotes: bigint;
    noVotes: bigint;
    finalized: boolean;
    approved: boolean;
  };
  userVote?: {
    stakeAmount: bigint;
    voted: boolean;
    support: boolean;
    withdrawable: boolean;
  };
  walletBalance?: bigint;
  allowance?: bigint;
  targetToken?: {
    address: Address;
    symbol?: string;
    name?: string;
  };
}

function formatDateTime(timestamp?: bigint) {
  if (!timestamp || timestamp <= 0n) return "-";
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

function formatDuration(targetTimestamp?: bigint) {
  if (!targetTimestamp || targetTimestamp <= 0n) return "-";
  const diff = Number(targetTimestamp) - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "0m";
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function asReadonlyTuple<T>(value: T) {
  return value;
}

export default function CommunityBuybackExampleVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const { context, i18n } = sdk;
  const t = i18n.t;
  const host = readTaxVaultHostContext(context.host);
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");
  const [proposalToken, setProposalToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null);
  const [txState, setTxState] = useState<TxButtonState>("idle");
  const resetTimerRef = useRef<number | null>(null);

  // Reactive current time so proposal open/close state updates without a page refresh
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const writesAvailable = isActionAvailableForPhase("dex-listed", host.marketPhase);
  const wrongNetwork = sdk.wallet.isWrongNetwork;
  const tokenDecimals = snapshot?.tokenDecimals ?? 18;
  const parsedStakeAmount = useMemo(() => {
    if (!stakeAmount.trim()) return 0n;
    try {
      return parseTokenAmount(stakeAmount, tokenDecimals);
    } catch {
      return 0n;
    }
  }, [stakeAmount, tokenDecimals]);
  const needsApproval = parsedStakeAmount > 0n && (snapshot?.allowance ?? 0n) < parsedStakeAmount;
  const currentProposal = snapshot?.proposal;
  const nowSeconds = Math.floor(now / 1000);
  const isProposalOpen =
    Boolean(currentProposal) &&
    !currentProposal?.finalized &&
    Number(currentProposal?.voteStart ?? 0n) <= nowSeconds &&
    Number(currentProposal?.voteEnd ?? 0n) > nowSeconds;
  const voteTotals = useMemo(() => {
    const yesVotes = currentProposal?.yesVotes ?? 0n;
    const noVotes = currentProposal?.noVotes ?? 0n;
    const total = yesVotes + noVotes;
    const yesPercent = total > 0n ? Number((yesVotes * 10000n) / total) / 100 : 0;
    const noPercent = total > 0n ? 100 - yesPercent : 0;
    return { yesVotes, noVotes, total, yesPercent, noPercent };
  }, [currentProposal]);
  const isOwner = Boolean(context.userAddress && snapshot?.owner && snapshot.owner.toLowerCase() === context.userAddress.toLowerCase());
  const currentTargetTokenAddress =
    snapshot?.stats.buybackTokenLocked && snapshot.stats.approvedBuybackToken !== ZERO_ADDRESS
      ? snapshot.stats.approvedBuybackToken
      : currentProposal?.proposedToken && currentProposal.proposedToken !== ZERO_ADDRESS
        ? currentProposal.proposedToken
        : undefined;

  const loadData = useCallback(async () => {
    const [taxToken, owner, taxRateBps, statsTuple] = await Promise.all([
      sdk.readContract<Address>({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "taxToken",
      }),
      sdk.readContract<Address>({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "owner",
      }),
      sdk.readContract<bigint>({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "taxRateBps",
      }),
      sdk.readContract<VaultStatsTuple>({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "getVaultStats",
      }).then(asReadonlyTuple),
    ]);

    const [tokenSymbol, tokenName, tokenDecimalsRaw] = await Promise.all([
      sdk.readContract<string>({
        contract: "token",
        address: taxToken,
        abi: erc20Abi,
        functionName: "symbol",
      }),
      sdk.readContract<string>({
        contract: "token",
        address: taxToken,
        abi: erc20Abi,
        functionName: "name",
      }).catch(() => undefined),
      sdk.readContract<number>({
        contract: "token",
        address: taxToken,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);

    const currentProposalId = statsTuple[2];
    const proposalTuple =
      currentProposalId > 0n
        ? await sdk.readContract<ProposalInfoTuple>({
            contract: "vault",
            address: context.vaultAddress,
            abi: vaultAbi,
            functionName: "getProposalInfo",
            args: [currentProposalId],
          }).then(asReadonlyTuple)
        : undefined;

    const [userVoteTuple, walletBalance, allowance] = context.userAddress
      ? await Promise.all([
          currentProposalId > 0n
            ? sdk.readContract<UserVoteInfoTuple>({
                contract: "vault",
                address: context.vaultAddress,
                abi: vaultAbi,
                functionName: "getUserVoteInfo",
                args: [currentProposalId, context.userAddress],
              }).then(asReadonlyTuple)
            : Promise.resolve(undefined),
          sdk.readContract<bigint>({
            contract: "token",
            address: taxToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [context.userAddress],
          }),
          sdk.readContract<bigint>({
            contract: "token",
            address: taxToken,
            abi: erc20Abi,
            functionName: "allowance",
            args: [context.userAddress, context.vaultAddress],
          }),
        ])
      : [undefined, undefined, undefined];

    const targetTokenAddress =
      statsTuple[4] && statsTuple[3] !== ZERO_ADDRESS
        ? statsTuple[3]
        : proposalTuple && proposalTuple[0] !== ZERO_ADDRESS
          ? proposalTuple[0]
          : undefined;
    const [targetSymbol, targetName] = targetTokenAddress
      ? await Promise.all([
          sdk.readContract<string>({
            contract: "token",
            address: targetTokenAddress,
            abi: erc20Abi,
            functionName: "symbol",
          }).catch(() => undefined),
          sdk.readContract<string>({
            contract: "token",
            address: targetTokenAddress,
            abi: erc20Abi,
            functionName: "name",
          }).catch(() => undefined),
        ])
      : [undefined, undefined];

    setSnapshot({
      taxToken,
      owner,
      taxRateBps,
      tokenSymbol,
      tokenName,
      tokenDecimals: tokenDecimalsRaw,
      stats: {
        treasuryBNB: statsTuple[0],
        proposalAllowedAt: statsTuple[1],
        currentProposalId,
        approvedBuybackToken: statsTuple[3],
        buybackTokenLocked: statsTuple[4],
        lastBuybackAt: statsTuple[7],
        nextBuybackAt: statsTuple[8],
      },
      proposal: proposalTuple
        ? {
            proposedToken: proposalTuple[0],
            voteStart: proposalTuple[1],
            voteEnd: proposalTuple[2],
            yesVotes: proposalTuple[3],
            noVotes: proposalTuple[4],
            finalized: proposalTuple[5],
            approved: proposalTuple[6],
          }
        : undefined,
      userVote: userVoteTuple
        ? {
            stakeAmount: userVoteTuple[0],
            voted: userVoteTuple[1],
            support: userVoteTuple[2],
            withdrawable: userVoteTuple[3],
          }
        : undefined,
      walletBalance,
      allowance,
      targetToken: targetTokenAddress
        ? {
            address: targetTokenAddress,
            symbol: targetSymbol,
            name: targetName,
          }
        : undefined,
    });
  }, [context.userAddress, context.vaultAddress, sdk]);

  useEffect(() => {
    void loadData().catch((nextError) => setError(handleTxError(nextError)));
    const timer = setInterval(() => {
      void loadData().catch(() => undefined);
    }, 15000);
    return () => clearInterval(timer);
  }, [loadData, sdk.refetchNonce]);

  const buttonState = (action: ActionKey) => (activeAction === action ? txState : "idle");

  const stageError = useCallback(() => {
    if (!context.userAddress) return t("errors.connectWallet");
    if (wrongNetwork) return t("errors.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel });
    if (!writesAvailable) return t("errors.stageUnavailable");
    return null;
  }, [context.userAddress, sdk.wallet.requiredChainLabel, t, writesAvailable, wrongNetwork]);

  const handleSwitchNetwork = useCallback(async () => {
    setError(null);
    try {
      await sdk.wallet.switchChain();
    } catch (nextError) {
      setError(
        handleTxError(nextError, {
          wrongNetwork: t("errors.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel }),
        }),
      );
    }
  }, [sdk.wallet, t]);

  // Clear the reset timer on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const runAction = useCallback(
    async (action: ActionKey, task: () => Promise<void>) => {
      setError(null);
      setActiveAction(action);
      try {
        await task();
        setTxState("success");
        await loadData();
      } catch (nextError) {
        setTxState("failed");
        setError(
          handleTxError(nextError, {
            wrongNetwork: t("errors.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel }),
            reverted: t("errors.txFailed"),
            unknown: t("errors.txFailed"),
          }),
        );
      } finally {
        if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = window.setTimeout(() => {
          resetTimerRef.current = null;
          setActiveAction(null);
          setTxState("idle");
        }, 300);
      }
    },
    [loadData, sdk.wallet.requiredChainLabel, t],
  );

  async function handleApprove() {
    const reason = stageError();
    if (reason) {
      setError(reason);
      return;
    }
    if (!snapshot?.taxToken || parsedStakeAmount <= 0n) {
      setError(t("errors.amountRequired"));
      return;
    }
    await runAction("approve", async () => {
      setTxState("approving");
      const hash = await sdk.writeContract({
        contract: "token",
        address: snapshot.taxToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [context.vaultAddress, parsedStakeAmount],
      });
      setTxState("approval_confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.approveSuccess"));
    });
  }

  async function handleVote(support: boolean) {
    const reason = stageError();
    if (reason) {
      setError(reason);
      return;
    }
    if (!snapshot) return;
    if (!currentProposal || !isProposalOpen) {
      setError(t("errors.voteClosed"));
      return;
    }
    if (snapshot.userVote?.voted) {
      setError(t("errors.alreadyVoted"));
      return;
    }
    if (parsedStakeAmount <= 0n) {
      setError(t("errors.amountRequired"));
      return;
    }
    if ((snapshot.walletBalance ?? 0n) < parsedStakeAmount) {
      setError(t("errors.insufficientBalance"));
      return;
    }
    if (needsApproval) {
      setError(t("errors.approvalRequired"));
      return;
    }
    await runAction(support ? "vote-yes" : "vote-no", async () => {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "stakeAndVote",
        args: [support, parsedStakeAmount],
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t(support ? "messages.voteYesSuccess" : "messages.voteNoSuccess"));
      setStakeAmount("");
    });
  }

  async function handleWithdraw() {
    const reason = stageError();
    if (reason) {
      setError(reason);
      return;
    }
    if (!snapshot?.userVote?.withdrawable) {
      setError(t("errors.withdrawUnavailable"));
      return;
    }
    await runAction("withdraw", async () => {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "withdrawAllStakes",
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.withdrawSuccess"));
    });
  }

  async function handlePropose() {
    const reason = stageError();
    if (reason) {
      setError(reason);
      return;
    }
    if (!snapshot) return;
    if (!isOwner) {
      setError(t("errors.ownerOnly"));
      return;
    }
    if (!isValidAddress(proposalToken) || proposalToken === ZERO_ADDRESS) {
      setError(t("errors.invalidTarget"));
      return;
    }
    if (snapshot.stats.buybackTokenLocked) {
      setError(t("errors.targetLocked"));
      return;
    }
    if (snapshot.stats.proposalAllowedAt > BigInt(nowSeconds)) {
      setError(t("errors.proposalNotOpen"));
      return;
    }
    await runAction("propose", async () => {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "proposeBuybackToken",
        args: [proposalToken as Address],
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.proposeSuccess"));
      setProposalToken("");
    });
  }

  async function handleFinalize() {
    const reason = stageError();
    if (reason) {
      setError(reason);
      return;
    }
    if (!currentProposal || snapshot?.stats.currentProposalId === undefined) {
      setError(t("errors.finalizeUnavailable"));
      return;
    }
    if (currentProposal.finalized || Number(currentProposal.voteEnd) > nowSeconds) {
      setError(t("errors.finalizeUnavailable"));
      return;
    }
    await runAction("finalize", async () => {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "finalizeVote",
        args: [snapshot!.stats.currentProposalId],
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.finalizeSuccess"));
    });
  }

  const proposalStatusTone =
    !currentProposal ? "warning" : currentProposal.finalized ? (currentProposal.approved ? "success" : "danger") : isProposalOpen ? "neutral" : "warning";
  const proposalStatusLabel = !currentProposal
    ? snapshot?.stats.proposalAllowedAt && snapshot.stats.proposalAllowedAt > BigInt(nowSeconds)
      ? t("status.proposalQueued")
      : t("status.noProposal")
    : currentProposal.finalized
      ? currentProposal.approved
        ? t("status.approved")
        : t("status.rejected")
      : isProposalOpen
        ? t("status.votingOpen")
        : t("status.awaitingFinalize");

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="success">{t("badges.live")}</StatusBadge>
            <StatusBadge tone={writesAvailable ? "neutral" : "warning"}>
              {host.marketPhase === "dex-listed" ? t("badges.dexListed") : host.marketPhase === "internal-market" ? t("badges.internalMarket") : t("badges.phaseUnknown")}
            </StatusBadge>
            {snapshot?.stats.buybackTokenLocked ? <StatusBadge tone="success">{t("badges.targetLocked")}</StatusBadge> : null}
          </div>
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <p className="mt-2 text-sm leading-6 text-white/64">{context.host?.vaultInfo?.description || t("subtitle")}</p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <DetailTile label={t("overview.treasury")} value={`${formatTokenAmount(snapshot?.stats.treasuryBNB, 18, 4)} ${context.paymentToken?.symbol ?? "BNB"}`} />
          <DetailTile label={t("overview.taxRate")} value={formatPercentBps(snapshot?.taxRateBps)} />
          <DetailTile label={t("overview.proposalId")} value={snapshot?.stats.currentProposalId ? snapshot.stats.currentProposalId.toString() : "-"} />
          <DetailTile label={t("overview.status")} value={proposalStatusLabel} tone={proposalStatusTone === "success" ? "success" : proposalStatusTone === "danger" ? "warning" : "primary"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.proposal")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <DetailTile
            label={t("labels.targetToken")}
            value={
              currentTargetTokenAddress ? (
                <AddressLink address={currentTargetTokenAddress} explorerBaseUrl={context.explorerBaseUrl} label={snapshot?.targetToken?.name || snapshot?.targetToken?.symbol || undefined} />
              ) : (
                "-"
              )
            }
            detail={
              snapshot?.targetToken?.symbol
                ? `${snapshot.targetToken.symbol}${snapshot.targetToken.name && snapshot.targetToken.name !== snapshot.targetToken.symbol ? ` · ${snapshot.targetToken.name}` : ""}`
                : undefined
            }
          />
          <DetailTile
            label={t("labels.voteWindow")}
            value={currentProposal ? `${formatDateTime(currentProposal.voteStart)} - ${formatDateTime(currentProposal.voteEnd)}` : "-"}
            detail={currentProposal && !currentProposal.finalized ? `${t("labels.endsIn")} ${formatDuration(currentProposal.voteEnd)}` : undefined}
          />
          <DetailTile
            label={t("labels.voteResult")}
            value={`${voteTotals.yesPercent.toFixed(2)}% / ${voteTotals.noPercent.toFixed(2)}%`}
            detail={`${t("labels.yesVotes")} ${formatTokenAmount(voteTotals.yesVotes, tokenDecimals, 2)} · ${t("labels.noVotes")} ${formatTokenAmount(voteTotals.noVotes, tokenDecimals, 2)}`}
          />
          <DetailTile label={t("labels.nextBuyback")} value={formatDateTime(snapshot?.stats.nextBuybackAt)} detail={`${t("labels.lastBuyback")} ${formatDateTime(snapshot?.stats.lastBuybackAt)}`} />
          <DetailTile label={t("labels.owner")} value={<AddressLink address={snapshot?.owner} explorerBaseUrl={context.explorerBaseUrl} />} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.vote")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {wrongNetwork ? (
            <Alert tone="warning">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{t("notices.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel })}</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => void handleSwitchNetwork()} disabled={!sdk.wallet.canSwitchChain || sdk.wallet.isSwitchingChain}>
                  {sdk.wallet.isSwitchingChain ? t("buttons.switchingNetwork") : t("buttons.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel })}
                </Button>
              </div>
            </Alert>
          ) : null}
          {!writesAvailable ? <Alert tone="warning">{t("notices.listedOnly")}</Alert> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="grid gap-3 md:grid-cols-4">
            <DetailTile label={t("vote.walletBalance")} value={`${formatTokenAmount(snapshot?.walletBalance, tokenDecimals, 4)} ${snapshot?.tokenSymbol ?? context.tokenSymbol}`} />
            <DetailTile label={t("vote.allowance")} value={`${formatTokenAmount(snapshot?.allowance, tokenDecimals, 4)} ${snapshot?.tokenSymbol ?? context.tokenSymbol}`} detail={needsApproval ? t("vote.approvalNeeded") : t("vote.approvalReady")} tone={needsApproval ? "warning" : "success"} />
            <DetailTile label={t("vote.myStake")} value={`${formatTokenAmount(snapshot?.userVote?.stakeAmount, tokenDecimals, 4)} ${snapshot?.tokenSymbol ?? context.tokenSymbol}`} />
            <DetailTile label={t("vote.myVote")} value={snapshot?.userVote?.voted ? (snapshot.userVote.support ? t("vote.supportYes") : t("vote.supportNo")) : t("vote.notVoted")} />
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
            <div className="space-y-3 rounded-md border border-white/10 bg-black/20 p-3">
              <label className="text-sm font-semibold text-white">{t("vote.stakeAmount")}</label>
              <Input value={stakeAmount} onChange={(event) => setStakeAmount(event.target.value)} placeholder={t("vote.stakePlaceholder")} />
              <div className="flex flex-wrap gap-2">
                {[25, 50, 100].map((percent) => (
                  <Button
                    key={percent}
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!snapshot?.walletBalance) return;
                      const nextAmount = (snapshot.walletBalance * BigInt(percent)) / 100n;
                      setStakeAmount(formatTokenAmount(nextAmount, tokenDecimals, 6));
                    }}
                  >
                    {percent}%
                  </Button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <TxButton idleLabel={t("buttons.approve")} state={buttonState("approve")} onClick={() => void handleApprove()} disabled={!writesAvailable || !context.userAddress || wrongNetwork || parsedStakeAmount <= 0n || !needsApproval} />
                <TxButton idleLabel={t("buttons.voteYes")} state={buttonState("vote-yes")} onClick={() => void handleVote(true)} disabled={!writesAvailable || !context.userAddress || wrongNetwork || !isProposalOpen || parsedStakeAmount <= 0n || needsApproval} />
                <TxButton idleLabel={t("buttons.voteNo")} state={buttonState("vote-no")} onClick={() => void handleVote(false)} disabled={!writesAvailable || !context.userAddress || wrongNetwork || !isProposalOpen || parsedStakeAmount <= 0n || needsApproval} />
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-white/10 bg-black/20 p-3">
              <label className="text-sm font-semibold text-white">{t("owner.proposeTitle")}</label>
              <Input value={proposalToken} onChange={(event) => setProposalToken(event.target.value)} placeholder={t("owner.proposePlaceholder")} />
              <div className="grid gap-2">
                <TxButton idleLabel={t("buttons.propose")} state={buttonState("propose")} onClick={() => void handlePropose()} disabled={!writesAvailable || !context.userAddress || wrongNetwork || !isOwner || !proposalToken.trim()} />
                <TxButton idleLabel={t("buttons.finalize")} state={buttonState("finalize")} onClick={() => void handleFinalize()} disabled={!writesAvailable || !context.userAddress || wrongNetwork || !currentProposal || currentProposal.finalized || Number(currentProposal.voteEnd) > nowSeconds} />
                <TxButton idleLabel={t("buttons.withdraw")} state={buttonState("withdraw")} onClick={() => void handleWithdraw()} disabled={!writesAvailable || !context.userAddress || wrongNetwork || !snapshot?.userVote?.withdrawable} />
              </div>
              {!isOwner ? <p className="text-xs leading-5 text-white/48">{t("owner.ownerNotice")}</p> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
