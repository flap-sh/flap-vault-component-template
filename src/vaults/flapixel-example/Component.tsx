"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseAbi } from "viem";
import type { Address, VaultComponentProps } from "@/src/sdk";
import {
  erc20Abi,
  formatPercentBps,
  formatTokenAmount,
  handleTxError,
  isActionAvailableForPhase,
  parseTokenAmount,
  readTaxVaultHostContext,
  useFlapSdk,
} from "@/src/sdk";
import { AddressLink, Alert, Button, Card, CardContent, CardHeader, CardTitle, DetailTile, Input, StatusBadge, TxButton } from "@/src/ui";
import type { TxButtonState } from "@/src/ui";
import { nftAbi, vaultAbi } from "./VaultABI";

const nftMetadataAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);

type VaultInfoTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint];
type UserInfoTuple = readonly [bigint, bigint, bigint, bigint];
type ActionKey = "approve-token" | "mint" | "claim" | "approve-nft" | "sell";

interface VaultSnapshot {
  taxToken: Address;
  nftAddress: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  nftName?: string;
  nftSymbol?: string;
  tokenCostPerNft: bigint;
  dividendShareBps: bigint;
  floorShareBps: bigint;
  floorPool: bigint;
  currentFloorPrice: bigint;
  mintedNfts: bigint;
  maxSupply: bigint;
  burnedNfts: bigint;
  walletBalance?: bigint;
  allowance?: bigint;
  userNftBalance?: bigint;
  userClaimedBnb?: bigint;
  userPendingBnb?: bigint;
  ownedTokenIds: bigint[];
  nftApproved?: boolean;
}

const MAX_SELL_IDS = 500;

function parseSellIds(value: string) {
  const ids = new Set<bigint>();
  for (const chunk of value.split(",")) {
    if (ids.size >= MAX_SELL_IDS) break;
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const [start, end] = trimmed.split("-").map((item) => Number(item.trim()));
      if (Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start) {
        for (let cursor = start; cursor <= end && ids.size < MAX_SELL_IDS; cursor += 1) {
          ids.add(BigInt(cursor));
        }
      }
      continue;
    }
    const parsed = Number(trimmed);
    if (Number.isInteger(parsed) && parsed > 0) ids.add(BigInt(parsed));
  }
  return [...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function asReadonlyTuple<T>(value: T) {
  return value;
}

export default function FlapixelExampleVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const { context, i18n } = sdk;
  const t = i18n.t;
  const host = readTaxVaultHostContext(context.host);
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [mintCount, setMintCount] = useState("1");
  const [sellIdsInput, setSellIdsInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null);
  const [txState, setTxState] = useState<TxButtonState>("idle");
  const resetTimerRef = useRef<number | null>(null);

  const writesAvailable = isActionAvailableForPhase("dex-listed", host.marketPhase);
  const wrongNetwork = sdk.wallet.isWrongNetwork;
  const parsedMintCount = useMemo(() => {
    const next = Number(mintCount);
    return Number.isInteger(next) && next > 0 ? BigInt(next) : 0n;
  }, [mintCount]);
  const mintCost = parsedMintCount > 0n ? (snapshot?.tokenCostPerNft ?? 0n) * parsedMintCount : 0n;
  const sellIds = useMemo(() => parseSellIds(sellIdsInput), [sellIdsInput]);
  const estimatedSellReturn = (snapshot?.currentFloorPrice ?? 0n) * BigInt(sellIds.length);
  const needsTokenApproval = mintCost > 0n && (snapshot?.allowance ?? 0n) < mintCost;

  const loadData = useCallback(async () => {
    const [taxToken, nftAddress, tokenCostPerNft, dividendShareBps, floorShareBps, floorPool, vaultInfoTuple] = await Promise.all([
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
        functionName: "nft",
      }),
      sdk.readContract<bigint>({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "tokenCostPerNFT",
      }),
      sdk.readContract<bigint>({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "dividendShareBps",
      }),
      sdk.readContract<bigint>({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "floorShareBps",
      }),
      sdk.readContract<bigint>({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "floorPool",
      }),
      sdk.readContract<VaultInfoTuple>({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "vaultInfo",
      }).then(asReadonlyTuple),
    ]);

    const [tokenSymbol, tokenDecimals, nftName, nftSymbol] = await Promise.all([
      sdk.readContract<string>({
        contract: "token",
        address: taxToken,
        abi: erc20Abi,
        functionName: "symbol",
      }),
      sdk.readContract<number>({
        contract: "token",
        address: taxToken,
        abi: erc20Abi,
        functionName: "decimals",
      }),
      sdk.readContract<string>({
        contract: "nft",
        address: nftAddress,
        abi: nftMetadataAbi,
        functionName: "name",
      }).catch(() => undefined),
      sdk.readContract<string>({
        contract: "nft",
        address: nftAddress,
        abi: nftMetadataAbi,
        functionName: "symbol",
      }).catch(() => undefined),
    ]);

    const [walletBalance, allowance, userInfoTuple, ownedTokenIds, nftApproved] = context.userAddress
      ? await Promise.all([
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
          sdk.readContract<UserInfoTuple>({
            contract: "vault",
            address: context.vaultAddress,
            abi: vaultAbi,
            functionName: "myInfoOf",
            args: [context.userAddress],
          }).then(asReadonlyTuple),
          sdk.readContract<bigint[]>({
            contract: "vault",
            address: context.vaultAddress,
            abi: vaultAbi,
            functionName: "ownedTokensOf",
            args: [context.userAddress],
          }),
          sdk.readContract<boolean>({
            contract: "nft",
            address: nftAddress,
            abi: nftAbi,
            functionName: "isApprovedForAll",
            args: [context.userAddress, context.vaultAddress],
          }),
        ])
      : [undefined, undefined, undefined, [], undefined];

    setSnapshot({
      taxToken,
      nftAddress,
      tokenSymbol,
      tokenDecimals,
      nftName,
      nftSymbol,
      tokenCostPerNft,
      dividendShareBps,
      floorShareBps,
      floorPool,
      currentFloorPrice: vaultInfoTuple[0],
      mintedNfts: vaultInfoTuple[1],
      maxSupply: vaultInfoTuple[2],
      burnedNfts: vaultInfoTuple[6],
      walletBalance,
      allowance,
      userNftBalance: userInfoTuple?.[1],
      userClaimedBnb: userInfoTuple?.[2],
      userPendingBnb: userInfoTuple?.[3],
      ownedTokenIds,
      nftApproved,
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

  const stageError = useCallback(() => {
    if (!context.userAddress) return t("errors.connectWallet");
    if (wrongNetwork) return t("errors.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel });
    if (!writesAvailable) return t("errors.stageUnavailable");
    return null;
  }, [context.userAddress, sdk.wallet.requiredChainLabel, t, writesAvailable, wrongNetwork]);

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

  async function handleApproveToken() {
    const reason = stageError();
    if (reason) {
      setError(reason);
      return;
    }
    if (!snapshot?.taxToken || mintCost <= 0n) {
      setError(t("errors.mintCountRequired"));
      return;
    }
    await runAction("approve-token", async () => {
      setTxState("approving");
      const hash = await sdk.writeContract({
        contract: "token",
        address: snapshot.taxToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [context.vaultAddress, 2n ** 256n - 1n],
      });
      setTxState("approval_confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.tokenApproveSuccess"));
    });
  }

  async function handleMint() {
    const reason = stageError();
    if (reason) {
      setError(reason);
      return;
    }
    if (!snapshot) return;
    if (parsedMintCount <= 0n) {
      setError(t("errors.mintCountRequired"));
      return;
    }
    if ((snapshot.walletBalance ?? 0n) < mintCost) {
      setError(t("errors.insufficientTokenBalance"));
      return;
    }
    if (needsTokenApproval) {
      setError(t("errors.tokenApprovalRequired"));
      return;
    }
    await runAction("mint", async () => {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "mintNFTWithTokenAmount",
        args: [mintCost],
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.mintSuccess"));
      setMintCount("1");
    });
  }

  async function handleClaim() {
    const reason = stageError();
    if (reason) {
      setError(reason);
      return;
    }
    if (!snapshot?.userPendingBnb || snapshot.userPendingBnb <= 0n) {
      setError(t("errors.claimUnavailable"));
      return;
    }
    await runAction("claim", async () => {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "claim",
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.claimSuccess"));
    });
  }

  async function handleApproveNft() {
    const reason = stageError();
    if (reason) {
      setError(reason);
      return;
    }
    if (!snapshot?.nftAddress) return;
    await runAction("approve-nft", async () => {
      setTxState("approving");
      const hash = await sdk.writeContract({
        contract: "nft",
        address: snapshot.nftAddress,
        abi: nftAbi,
        functionName: "setApprovalForAll",
        args: [context.vaultAddress, true],
      });
      setTxState("approval_confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.nftApproveSuccess"));
    });
  }

  async function handleSell() {
    const reason = stageError();
    if (reason) {
      setError(reason);
      return;
    }
    if (!snapshot) return;
    if (!sellIds.length) {
      setError(t("errors.sellIdsRequired"));
      return;
    }
    if (!snapshot.nftApproved) {
      setError(t("errors.nftApprovalRequired"));
      return;
    }
    await runAction("sell", async () => {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "sellToVault",
        args: [sellIds],
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.sellSuccess"));
      setSellIdsInput("");
    });
  }

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="success">{t("badges.live")}</StatusBadge>
            <StatusBadge tone={writesAvailable ? "neutral" : "warning"}>
              {host.marketPhase === "dex-listed" ? t("badges.dexListed") : host.marketPhase === "internal-market" ? t("badges.internalMarket") : t("badges.phaseUnknown")}
            </StatusBadge>
            <StatusBadge tone="neutral">{t("badges.nftVault")}</StatusBadge>
          </div>
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <p className="mt-2 text-sm leading-6 text-white/64">{context.host?.vaultInfo?.description || t("subtitle")}</p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <DetailTile label={t("overview.collection")} value={snapshot?.nftName || "-"} detail={snapshot?.nftSymbol} />
          <DetailTile label={t("overview.tokenCost")} value={`${formatTokenAmount(snapshot?.tokenCostPerNft, snapshot?.tokenDecimals ?? 18, 2)} ${snapshot?.tokenSymbol ?? context.tokenSymbol}`} />
          <DetailTile label={t("overview.floorPrice")} value={`${formatTokenAmount(snapshot?.currentFloorPrice, 18, 4)} ${context.paymentToken?.symbol ?? "BNB"}`} />
          <DetailTile label={t("overview.floorPool")} value={`${formatTokenAmount(snapshot?.floorPool, 18, 4)} ${context.paymentToken?.symbol ?? "BNB"}`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.status")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <DetailTile label={t("labels.token")} value={<AddressLink address={context.tokenAddress} explorerBaseUrl={context.explorerBaseUrl} label={context.tokenSymbol} />} />
            <DetailTile label={t("labels.vault")} value={<AddressLink address={context.vaultAddress} explorerBaseUrl={context.explorerBaseUrl} />} />
            <DetailTile label={t("labels.nft")} value={<AddressLink address={snapshot?.nftAddress} explorerBaseUrl={context.explorerBaseUrl} label={snapshot?.nftName || snapshot?.nftSymbol} />} />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <DetailTile label={t("status.minted")} value={`${snapshot?.mintedNfts?.toString() ?? "-"} / ${snapshot?.maxSupply?.toString() ?? "-"}`} />
            <DetailTile label={t("status.burned")} value={snapshot?.burnedNfts?.toString() ?? "-"} />
            <DetailTile label={t("status.dividendShare")} value={formatPercentBps(snapshot?.dividendShareBps)} />
            <DetailTile label={t("status.floorShare")} value={formatPercentBps(snapshot?.floorShareBps)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.actions")}</CardTitle>
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
            <DetailTile label={t("wallet.tokenBalance")} value={`${formatTokenAmount(snapshot?.walletBalance, snapshot?.tokenDecimals ?? 18, 4)} ${snapshot?.tokenSymbol ?? context.tokenSymbol}`} />
            <DetailTile label={t("wallet.pendingBnb")} value={`${formatTokenAmount(snapshot?.userPendingBnb, 18, 4)} ${context.paymentToken?.symbol ?? "BNB"}`} tone="success" />
            <DetailTile label={t("wallet.ownedNfts")} value={snapshot?.userNftBalance?.toString() ?? "-"} />
            <DetailTile label={t("wallet.nftApproval")} value={snapshot?.nftApproved ? t("wallet.approved") : t("wallet.notApproved")} tone={snapshot?.nftApproved ? "success" : "warning"} />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-3 rounded-md border border-white/10 bg-black/20 p-3">
              <label className="text-sm font-semibold text-white">{t("mint.title")}</label>
              <Input value={mintCount} onChange={(event) => setMintCount(event.target.value)} placeholder="1" />
              <DetailTile label={t("mint.cost")} value={`${formatTokenAmount(mintCost, snapshot?.tokenDecimals ?? 18, 4)} ${snapshot?.tokenSymbol ?? context.tokenSymbol}`} />
              <div className="grid gap-2">
                <TxButton idleLabel={t("buttons.approveToken")} state={buttonState("approve-token")} onClick={() => void handleApproveToken()} disabled={!writesAvailable || !context.userAddress || wrongNetwork || mintCost <= 0n || !needsTokenApproval} />
                <TxButton idleLabel={t("buttons.mint")} state={buttonState("mint")} onClick={() => void handleMint()} disabled={!writesAvailable || !context.userAddress || wrongNetwork || parsedMintCount <= 0n || needsTokenApproval} />
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-white/10 bg-black/20 p-3">
              <label className="text-sm font-semibold text-white">{t("claim.title")}</label>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailTile label={t("claim.pending")} value={`${formatTokenAmount(snapshot?.userPendingBnb, 18, 4)} ${context.paymentToken?.symbol ?? "BNB"}`} />
                <DetailTile label={t("claim.claimed")} value={`${formatTokenAmount(snapshot?.userClaimedBnb, 18, 4)} ${context.paymentToken?.symbol ?? "BNB"}`} />
              </div>
              <TxButton idleLabel={t("buttons.claim")} state={buttonState("claim")} onClick={() => void handleClaim()} disabled={!writesAvailable || !context.userAddress || wrongNetwork || !snapshot?.userPendingBnb || snapshot.userPendingBnb <= 0n} />
            </div>

            <div className="space-y-3 rounded-md border border-white/10 bg-black/20 p-3">
              <label className="text-sm font-semibold text-white">{t("sell.title")}</label>
              <Input value={sellIdsInput} onChange={(event) => setSellIdsInput(event.target.value)} placeholder={t("sell.placeholder")} />
              <DetailTile label={t("sell.return")} value={`${formatTokenAmount(estimatedSellReturn, 18, 4)} ${context.paymentToken?.symbol ?? "BNB"}`} />
              <div className="flex flex-wrap gap-2">
                {snapshot?.ownedTokenIds.slice(0, 6).map((tokenId) => (
                  <button
                    key={tokenId.toString()}
                    type="button"
                    onClick={() => setSellIdsInput((current) => (current ? `${current},${tokenId.toString()}` : tokenId.toString()))}
                    className="rounded-md border border-white/10 bg-[#17243a] px-2 py-1 text-xs font-semibold text-white/78 hover:border-[#559cff] hover:text-white"
                  >
                    #{tokenId.toString()}
                  </button>
                ))}
              </div>
              <div className="grid gap-2">
                <TxButton idleLabel={t("buttons.approveNft")} state={buttonState("approve-nft")} onClick={() => void handleApproveNft()} disabled={!writesAvailable || !context.userAddress || wrongNetwork || snapshot?.nftApproved === true} />
                <TxButton idleLabel={t("buttons.sell")} state={buttonState("sell")} onClick={() => void handleSell()} disabled={!writesAvailable || !context.userAddress || wrongNetwork || !sellIds.length || !snapshot?.nftApproved} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
