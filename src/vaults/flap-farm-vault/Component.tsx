"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Coins, Crown, Leaf, Medal, RefreshCcw, Sprout, Tractor, Warehouse, Wheat } from "lucide-react";
import type { Address, VaultComponentProps } from "@/src/sdk";
import { erc20Abi, formatTokenAmount, handleTxError, isActionAvailableForPhase, parseTokenAmount, readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, IpfsBackground, IpfsImage, Metric, StatusBadge } from "@/src/ui";
import { vaultAbi } from "./VaultABI";

function AssetImage({ name, alt, className }: { name: string | null; alt: string; className: string }) {
  switch (name) {
    case "fert-l1.png": return <IpfsImage className={className} cid="bafkreiewushrrlo2hpnywraj3smsbfkzkmoeahjdumjwxvqorv53kehrq4" alt={alt} />;
    case "fert-l2.png": return <IpfsImage className={className} cid="bafkreibtizozaqxjd3c7t5rmacgniqosboodms7u56rkwi7zslfonvnpvu" alt={alt} />;
    case "fert-l3.png": return <IpfsImage className={className} cid="bafkreieyn5mbyz6i5sgks6cchnwmn7otexhst73tpzygrlkbcqiqwamgsu" alt={alt} />;
    case "land1.png": return <IpfsImage className={className} cid="bafybeicwwqyd7qsnkb544pj76x77ottqrf2jw7r43rcqfdhwvr275ilg2q" alt={alt} />;
    case "land2.png": return <IpfsImage className={className} cid="bafybeiawgmvcvl26wtbqkvgkhgulu2iijpgllbninlsdu23dzkr52ybvsq" alt={alt} />;
    case "land3.png": return <IpfsImage className={className} cid="bafybeifiqcjmvfuq77fyklngieylhzrkcqxrb37kfh4z2upr5xkmgn7wrm" alt={alt} />;
    case "plant-l1-mature.png": return <IpfsImage className={className} cid="bafkreihhiivtc57fcd5xmbgcymewwhqg7hx3boevwvctoybg2dishevqvm" alt={alt} />;
    case "plant-l1-seed.png": return <IpfsImage className={className} cid="bafkreigxgu7yk3zay5myoqtybledaaeor5jxctvzuvw7buizkvqdhty2ya" alt={alt} />;
    case "plant-l1-stage1.png": return <IpfsImage className={className} cid="bafkreibdt2a36ybfenkfcqywiipl75kzzowhsaxy6az7n3a6iyznfl3wye" alt={alt} />;
    case "plant-l1-stage2.png": return <IpfsImage className={className} cid="bafkreifl3bllff5nukzl4u7usgzred7dm34ill3m3ildolgd6xifg34c7a" alt={alt} />;
    case "plant-l2-mature.png": return <IpfsImage className={className} cid="bafkreiaxyu4tvt44qesammhpbcp5uudtjsvizzleeag5b5dm3v6vxy3gae" alt={alt} />;
    case "plant-l2-seed.png": return <IpfsImage className={className} cid="bafkreiexktibf5g5esjlngxikdpax5myz3yop3wuvorwqsv2qxg3edcstu" alt={alt} />;
    case "plant-l2-stage1.png": return <IpfsImage className={className} cid="bafkreihbjrvg2quf5for6vzcf4kycjyuvci3tkchhqdjckld5tlkf7xif4" alt={alt} />;
    case "plant-l2-stage2.png": return <IpfsImage className={className} cid="bafkreib2k7ego7n6xdtbafj7z3bsoeqaob47uxzxp3kmbvdsbawrynqeai" alt={alt} />;
    case "plant-l3-mature.png": return <IpfsImage className={className} cid="bafkreiaizdmvv4xvc244mp7tsbn64sebrgsx772lnodasptt4oy4mwm22a" alt={alt} />;
    case "plant-l3-seed.png": return <IpfsImage className={className} cid="bafkreih377bwjhzjcs3wviupc4txkajvkkjm75vqff4nn47j7g3epkjktq" alt={alt} />;
    case "plant-l3-stage1.png": return <IpfsImage className={className} cid="bafkreickj62b3in7exujzmvhqt3eeji6ihkbvyym5ag3oimpkx2fe5efbe" alt={alt} />;
    case "plant-l3-stage2.png": return <IpfsImage className={className} cid="bafkreiebotbatv2azyt5tfbktg5kvqpz3rk37pvey4o45lmngxqr24byuq" alt={alt} />;
    default: return null;
  }
}

function LandBackground({ level }: { level: number }) {
  const className = "absolute inset-0 pointer-events-none overflow-visible";
  const imageClassName = "h-full w-full object-fill drop-shadow-[0_18px_24px_rgba(0,0,0,0.48)]";
  switch (safeLevel(level)) {
    case 1:
      return <IpfsBackground className={className} imageClassName={imageClassName} cid="bafybeicwwqyd7qsnkb544pj76x77ottqrf2jw7r43rcqfdhwvr275ilg2q" />;
    case 2:
      return <IpfsBackground className={className} imageClassName={imageClassName} cid="bafybeiawgmvcvl26wtbqkvgkhgulu2iijpgllbninlsdu23dzkr52ybvsq" />;
    case 3:
      return <IpfsBackground className={className} imageClassName={imageClassName} cid="bafybeifiqcjmvfuq77fyklngieylhzrkcqxrb37kfh4z2upr5xkmgn7wrm" />;
    default:
      return null;
  }
}

const MAX_PLOTS = 24n;

type Tab = "farm" | "shop" | "bag" | "pasture" | "seedSynthesis" | "landSynthesis" | "leaderboard";
type BusyKey = string | null;
type TFn = (key: string, fallback?: string, vars?: Record<string, string>) => string;
type PlotTuple = readonly [level: number, status: number, plantedAt: bigint, matureTime: bigint, boostBps: number, fertilized: boolean, totalClaimed: bigint];
type LandConfig = readonly [price: bigint, outputCap: bigint];
type SeedConfig = readonly [price: bigint, matureTime: bigint, reward: bigint];
type FertConfig = readonly [price: bigint, boostBps: number];
type PlotResult = PlotTuple | { level?: number; status?: number; plantedAt?: bigint; matureTime?: bigint; boostBps?: number; fertilized?: boolean; totalClaimed?: bigint };

interface PlotView {
  id: number;
  level: number;
  status: number;
  plantedAt: bigint;
  matureTime: bigint;
  boostBps: number;
  fertilized: boolean;
  totalClaimed: bigint;
  progress: number;
  remaining: bigint;
  ready: boolean;
}

interface ConfigView {
  land: Record<number, { price: bigint; outputCap: bigint }>;
  seed: Record<number, { price: bigint; matureTime: bigint; reward: bigint }>;
  fert: Record<number, { price: bigint; boostBps: number }>;
}

interface Snapshot {
  taxToken: Address;
  rewardPool: bigint;
  plotCount: bigint;
  plots: PlotView[];
  seedStock: Record<number, bigint>;
  fertStock: Record<number, bigint>;
  config: ConfigView;
  tokenBalance: bigint;
  allowance: bigint;
}

const zeroConfig: ConfigView = {
  land: { 1: { price: 0n, outputCap: 0n }, 2: { price: 0n, outputCap: 0n }, 3: { price: 0n, outputCap: 0n } },
  seed: { 1: { price: 0n, matureTime: 0n, reward: 0n }, 2: { price: 0n, matureTime: 0n, reward: 0n }, 3: { price: 0n, matureTime: 0n, reward: 0n } },
  fert: { 1: { price: 0n, boostBps: 0 }, 2: { price: 0n, boostBps: 0 }, 3: { price: 0n, boostBps: 0 } },
};

function safeLevel(value: unknown): 1 | 2 | 3 {
  const level = Number(value);
  return level === 1 || level === 2 || level === 3 ? level : 1;
}

function landConfigAt(cfg: ConfigView, level: unknown) {
  const safe = safeLevel(level);
  return cfg.land[safe] ?? zeroConfig.land[safe];
}

function seedConfigAt(cfg: ConfigView, level: unknown) {
  const safe = safeLevel(level);
  return cfg.seed[safe] ?? zeroConfig.seed[safe];
}

function fertConfigAt(cfg: ConfigView, level: unknown) {
  const safe = safeLevel(level);
  return cfg.fert[safe] ?? zeroConfig.fert[safe];
}

function tupleValue<T>(value: unknown, index: number, key: string, fallback: T): T {
  if (Array.isArray(value) && value[index] !== undefined) return value[index] as T;
  if (value && typeof value === "object" && key in value) {
    const named = (value as Record<string, unknown>)[key];
    if (named !== undefined) return named as T;
  }
  return fallback;
}

function toBigint(value: unknown, fallback = 0n) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.max(0, Math.trunc(value)));
  if (typeof value === "string" && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function formatBps(value: number) {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
}

function statusKey(plot: PlotView, t: (key: string) => string) {
  if (plot.remaining <= 0n) return t("states.depleted");
  if (plot.ready) return t("states.ready");
  return plot.status === 0 ? t("states.empty") : t("states.growing");
}

function plantStage(plot: PlotView) {
  if (plot.status === 0) return null;
  if (plot.ready || plot.progress >= 10000) return "mature";
  if (plot.progress >= 5000) return "stage2";
  if (plot.progress >= 2500) return "stage1";
  return "seed";
}

function plantAsset(plot: PlotView) {
  const stage = plantStage(plot);
  return stage ? `plant-l${plot.level}-${stage}.png` : null;
}

function landAsset(level: number) {
  return `land${level}.png`;
}

export default function FlapFarmVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const { context, i18n } = sdk;
  const t = i18n.t;
  const [tab, setTab] = useState<Tab>("farm");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyKey>(null);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [amount, setAmount] = useState("1");
  const decimals = 18;
  const symbol = context.tokenSymbol || "GAME";
  const host = readTaxVaultHostContext(context.host);
  const writesPhaseAvailable = isActionAvailableForPhase("both", host.marketPhase);

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
    () => ({ ...txErrorMessages, simulationFailed: t("errors.readFailed"), reverted: t("errors.readFailed"), unknown: t("errors.readFailed") }),
    [t, txErrorMessages],
  );

  const writesDisabled = !context.userAddress || sdk.wallet.isWrongNetwork || !context.vaultAddress || !writesPhaseAvailable;
  const actionUnavailableReason = !context.vaultAddress
    ? t("states.noVault")
    : !context.userAddress
      ? t("states.connectWallet")
      : sdk.wallet.isWrongNetwork
        ? t("states.wrongNetwork", undefined, { chain: sdk.wallet.requiredChainLabel })
        : null;

  const loadData = useCallback(async () => {
    if (!context.vaultAddress) return;
    const user = context.userAddress;
    const [taxToken, rawRewardPool, rawPlotCount, land1, land2, land3, seed1, seed2, seed3, fert1, fert2, fert3] = await Promise.all([
      sdk.readContract<Address>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "taxToken" }),
      sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "getRewardPoolBalance" }),
      user ? sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "getUserPlotCount", args: [user] }) : Promise.resolve(0n),
      sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "landConfigs", args: [1] }),
      sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "landConfigs", args: [2] }),
      sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "landConfigs", args: [3] }),
      sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "seedConfigs", args: [1] }),
      sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "seedConfigs", args: [2] }),
      sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "seedConfigs", args: [3] }),
      sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "fertilizerConfigs", args: [1] }),
      sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "fertilizerConfigs", args: [2] }),
      sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "fertilizerConfigs", args: [3] }),
    ]);

    const rewardPool = toBigint(rawRewardPool);
    const plotCount = toBigint(rawPlotCount);

    const config: ConfigView = {
      land: {
        1: { price: toBigint(tupleValue(land1, 0, "price", 0n)), outputCap: toBigint(tupleValue(land1, 1, "outputCap", 0n)) },
        2: { price: toBigint(tupleValue(land2, 0, "price", 0n)), outputCap: toBigint(tupleValue(land2, 1, "outputCap", 0n)) },
        3: { price: toBigint(tupleValue(land3, 0, "price", 0n)), outputCap: toBigint(tupleValue(land3, 1, "outputCap", 0n)) },
      },
      seed: {
        1: { price: toBigint(tupleValue(seed1, 0, "price", 0n)), matureTime: toBigint(tupleValue(seed1, 1, "matureTime", 0n)), reward: toBigint(tupleValue(seed1, 2, "reward", 0n)) },
        2: { price: toBigint(tupleValue(seed2, 0, "price", 0n)), matureTime: toBigint(tupleValue(seed2, 1, "matureTime", 0n)), reward: toBigint(tupleValue(seed2, 2, "reward", 0n)) },
        3: { price: toBigint(tupleValue(seed3, 0, "price", 0n)), matureTime: toBigint(tupleValue(seed3, 1, "matureTime", 0n)), reward: toBigint(tupleValue(seed3, 2, "reward", 0n)) },
      },
      fert: {
        1: { price: toBigint(tupleValue(fert1, 0, "price", 0n)), boostBps: toNumber(tupleValue(fert1, 1, "boostBps", 0)) },
        2: { price: toBigint(tupleValue(fert2, 0, "price", 0n)), boostBps: toNumber(tupleValue(fert2, 1, "boostBps", 0)) },
        3: { price: toBigint(tupleValue(fert3, 0, "price", 0n)), boostBps: toNumber(tupleValue(fert3, 1, "boostBps", 0)) },
      },
    };

    let tokenBalance = 0n;
    let allowance = 0n;
    let plots: PlotView[] = [];
    const seedStock: Record<number, bigint> = { 1: 0n, 2: 0n, 3: 0n };
    const fertStock: Record<number, bigint> = { 1: 0n, 2: 0n, 3: 0n };

    if (user) {
      const limit = plotCount > MAX_PLOTS ? MAX_PLOTS : plotCount;
      const [rawPlotsResult, balance, currentAllowance, ss1, ss2, ss3, fs1, fs2, fs3] = await Promise.all([
        limit > 0n ? sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "getPlots", args: [user, 0n, limit] }) : Promise.resolve([]),
        sdk.readContract<unknown>({ contract: "token", address: taxToken, abi: erc20Abi, functionName: "balanceOf", args: [user] }),
        sdk.readContract<unknown>({ contract: "token", address: taxToken, abi: erc20Abi, functionName: "allowance", args: [user, context.vaultAddress] }),
        sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "seedBalance", args: [user, 1] }),
        sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "seedBalance", args: [user, 2] }),
        sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "seedBalance", args: [user, 3] }),
        sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "fertilizerBalance", args: [user, 1] }),
        sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "fertilizerBalance", args: [user, 2] }),
        sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "fertilizerBalance", args: [user, 3] }),
      ]);
      const rawPlots = Array.isArray(rawPlotsResult) ? rawPlotsResult : [];
      tokenBalance = toBigint(balance);
      allowance = toBigint(currentAllowance);
      seedStock[1] = toBigint(ss1);
      seedStock[2] = toBigint(ss2);
      seedStock[3] = toBigint(ss3);
      fertStock[1] = toBigint(fs1);
      fertStock[2] = toBigint(fs2);
      fertStock[3] = toBigint(fs3);

      const enriched = await Promise.all(
        rawPlots.map(async (plot, index) => {
          const [progress, remaining, ready] = await Promise.all([
            sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "getProgress", args: [user, BigInt(index)] }),
            sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "getRemainingOutput", args: [user, BigInt(index)] }),
            sdk.readContract<unknown>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "isReady", args: [user, BigInt(index)] }),
          ]);
          return {
            id: index,
            level: safeLevel(tupleValue(plot, 0, "level", 1)),
            status: toNumber(tupleValue(plot, 1, "status", 0)),
            plantedAt: toBigint(tupleValue(plot, 2, "plantedAt", 0n)),
            matureTime: toBigint(tupleValue(plot, 3, "matureTime", 0n)),
            boostBps: toNumber(tupleValue(plot, 4, "boostBps", 0)),
            fertilized: toBoolean(tupleValue(plot, 5, "fertilized", false)),
            totalClaimed: toBigint(tupleValue(plot, 6, "totalClaimed", 0n)),
            progress: Math.max(0, Math.min(10_000, toNumber(progress))),
            remaining: toBigint(remaining),
            ready: toBoolean(ready),
          };
        }),
      );
      plots = enriched;
    }

    setSnapshot({ taxToken, rewardPool, plotCount, plots, seedStock, fertStock, config, tokenBalance, allowance });
    setError(null);
  }, [context.userAddress, context.vaultAddress, sdk]);

  useEffect(() => {
    void loadData().catch((nextError) => setError(handleTxError(nextError, readErrorMessages)));
    const timer = setInterval(() => void loadData().catch(() => undefined), 15_000);
    return () => clearInterval(timer);
  }, [loadData, readErrorMessages, sdk.refetchNonce]);

  const parsedAmount = useMemo(() => {
    try {
      return parseTokenAmount(amount || "0", 0);
    } catch {
      return 0n;
    }
  }, [amount]);

  async function approveIfNeeded(requiredAmount: bigint) {
    if (!snapshot || !context.vaultAddress) return false;
    if (requiredAmount <= 0n || snapshot.allowance >= requiredAmount) return true;
    setBusy("approve");
    const hash = await sdk.writeContract({ contract: "token", address: snapshot.taxToken, abi: erc20Abi, functionName: "approve", args: [context.vaultAddress, requiredAmount] });
    await sdk.waitForTx(hash);
    sdk.notify.success(t("messages.approveSuccess"));
    await loadData();
    return false;
  }

  async function runWrite(key: string, functionName: string, args: readonly unknown[], requiredAmount = 0n) {
    if (!context.vaultAddress) return;
    setError(null);
    setBusy(key);
    try {
      const canContinue = await approveIfNeeded(requiredAmount);
      if (!canContinue) return;
      const simulation = await sdk.simulateContract({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName, args: [...args] });
      const hash = await sdk.writeContract(simulation.request);
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.txSuccess"));
      await loadData();
    } catch (nextError) {
      setError(handleTxError(nextError, txErrorMessages));
    } finally {
      setBusy(null);
    }
  }

  const cfg = snapshot?.config ?? zeroConfig;
  const amountInt = parsedAmount > 0n ? parsedAmount : 1n;
  const buyLandCost = landConfigAt(cfg, 1).price * amountInt;
  const buySeedCost = seedConfigAt(cfg, selectedLevel).price * amountInt;
  const buyFertCost = fertConfigAt(cfg, selectedLevel).price * amountInt;
  const readyCount = snapshot?.plots.filter((plot) => plot.ready).length ?? 0;
  const totalSeed = (snapshot?.seedStock[1] ?? 0n) + (snapshot?.seedStock[2] ?? 0n) + (snapshot?.seedStock[3] ?? 0n);
  const totalFert = (snapshot?.fertStock[1] ?? 0n) + (snapshot?.fertStock[2] ?? 0n) + (snapshot?.fertStock[3] ?? 0n);

  return (
    <div className="relative min-h-[100vh] overflow-hidden rounded-[24px] text-[#f3f7ff]">
      <div className="relative z-10 space-y-4">
      <Card className="overflow-hidden border-[#f4d35e]/20 bg-black/45 shadow-[0_24px_80px_-48px_rgba(244,211,94,0.5)] backdrop-blur-[2px]">
        <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[#f4d35e]/35 bg-[#2b2717] text-[#f4d35e]">
                  <Tractor className="h-7 w-7" />
                </div>
                <CardTitle className="text-xl font-bold leading-none text-white">{t("title")}</CardTitle>
              </div>
              <p className="max-w-3xl text-sm font-medium leading-6 text-[#a8b5c7]">{t("subtitle")}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
          {actionUnavailableReason ? <Alert tone="warning">{actionUnavailableReason}</Alert> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Alert>{t("notices.mechanics")}</Alert>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Metric label={t("labels.rewardPool")} value={formatTokenAmount(snapshot?.rewardPool, decimals, 4)} hint={symbol} tone="primary" />
            <Metric label={t("labels.tokenBalance")} value={formatTokenAmount(snapshot?.tokenBalance, decimals, 4)} hint={symbol} />
            <Metric label={t("labels.allowance")} value={formatTokenAmount(snapshot?.allowance, decimals, 4)} hint={symbol} tone={(snapshot?.allowance ?? 0n) > 0n ? "success" : "warning"} />
            <Metric label={t("labels.plotCount")} value={String(snapshot?.plotCount ?? 0n)} hint={snapshot?.plotCount && snapshot.plotCount > MAX_PLOTS ? `Top ${MAX_PLOTS}` : ""} />
            <Metric label={t("labels.readyCount")} value={String(readyCount)} hint="" tone="success" />
            <Metric label={t("labels.seedStock")} value={String(totalSeed)} hint="" />
            <Metric label={t("labels.fertStock")} value={String(totalFert)} hint="" />
          </div>

          <div className="flex flex-wrap gap-2">
            {(["farm", "shop", "bag", "pasture", "seedSynthesis", "landSynthesis", "leaderboard"] as const).map((item) => {
              const label = item === "farm" ? t("sections.farm") : item === "shop" ? t("sections.shop") : item === "bag" ? t("sections.bag") : item === "pasture" ? t("sections.pasture") : item === "seedSynthesis" ? t("sections.seedSynthesis") : item === "landSynthesis" ? t("sections.landSynthesis") : t("sections.leaderboard");
              const icon = item === "farm" ? <Wheat className="h-4 w-4" /> : item === "shop" ? <Coins className="h-4 w-4" /> : item === "bag" ? <Warehouse className="h-4 w-4" /> : item === "pasture" ? <Tractor className="h-4 w-4" /> : item === "leaderboard" ? <Medal className="h-4 w-4" /> : item === "landSynthesis" ? <Crown className="h-4 w-4" /> : <Sprout className="h-4 w-4" />;
              return (
                <Button key={item} variant={tab === item ? "secondary" : "ghost"} size="sm" onClick={() => setTab(item)}>
                  {icon}
                  {label}
                </Button>
              );
            })}
            <Button variant="secondary" size="sm" onClick={() => void loadData()}>
              <RefreshCcw className="h-4 w-4" />
              {t("actions.refresh")}
            </Button>
            {sdk.wallet.isWrongNetwork ? (
              <Button variant="outline" size="sm" loading={sdk.wallet.isSwitchingChain} onClick={() => void sdk.wallet.switchChain().catch((nextError) => setError(handleTxError(nextError, txErrorMessages)))}>
                {t("actions.switchNetwork")}
              </Button>
            ) : null}
          </div>

          {tab === "farm" ? (
            <FarmPanel
              plots={snapshot?.plots ?? []}
              cfg={cfg}
              symbol={symbol}
              decimals={decimals}
              t={t}
              busy={busy}
              disabled={writesDisabled}
              onAction={(key, fn, args) => void runWrite(key, fn, args)}
            />
          ) : null}

          {tab === "shop" ? (
            <ShopPanel
              amount={amount}
              setAmount={setAmount}
              selectedLevel={selectedLevel}
              setSelectedLevel={setSelectedLevel}
              cfg={cfg}
              symbol={symbol}
              decimals={decimals}
              t={t}
              busy={busy}
              disabled={writesDisabled}
              buyLandCost={buyLandCost}
              buySeedCost={buySeedCost}
              buyFertCost={buyFertCost}
              amountInt={amountInt}
              runWrite={runWrite}
            />
          ) : null}

          {tab === "bag" ? (
            <BagPanel
              snapshot={snapshot}
              cfg={cfg}
              symbol={symbol}
              decimals={decimals}
              t={t}
            />
          ) : null}

          {tab === "pasture" || tab === "seedSynthesis" || tab === "landSynthesis" || tab === "leaderboard" ? (
            <ComingSoonPanel title={tab === "pasture" ? t("sections.pasture") : tab === "seedSynthesis" ? t("sections.seedSynthesis") : tab === "landSynthesis" ? t("sections.landSynthesis") : t("sections.leaderboard")} t={t} />
          ) : null}

        </CardContent>
      </Card>
      </div>
      <IpfsBackground
        cid="bafkreia3oqfyvtx2k2amomdxwnlbkay6ewwhbabcug23txhqonvwm45nt4"
        className="flap-farm-bg-wide absolute inset-0 z-0 pointer-events-none"
        imageClassName="h-full w-full object-cover"
      />
      <IpfsBackground
        cid="bafybeiea24urls7nonmwmj33uwiwmatsxz74a7rytmotz3zuqv4dpvujwq"
        className="flap-farm-bg-portrait absolute inset-0 z-0 pointer-events-none"
        imageClassName="h-full w-full object-cover"
      />
      <div className="absolute inset-0 z-0 pointer-events-none bg-[#05070b]/55" />
      <style>{`
        .flap-farm-bg-portrait {
          display: none;
        }
        @media (max-width: 640px), (max-aspect-ratio: 3 / 4) {
          .flap-farm-bg-wide {
            display: none;
          }
          .flap-farm-bg-portrait {
            display: block;
          }
        }
        @keyframes flapFarmSeedFloat {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -7px, 0); }
        }
        @keyframes flapFarmMaturePulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 8px 8px rgba(0, 0, 0, 0.35)); }
          50% { transform: scale(1.075); filter: drop-shadow(0 11px 12px rgba(255, 226, 108, 0.34)); }
        }
        .flap-farm-seed-float {
          animation: flapFarmSeedFloat 2.35s ease-in-out infinite;
          transform-origin: center bottom;
          will-change: transform;
        }
        .flap-farm-mature-pulse {
          animation: flapFarmMaturePulse 2.05s ease-in-out infinite;
          transform-origin: center bottom;
          will-change: transform, filter;
        }
      `}</style>
    </div>
  );
}

function ComingSoonPanel({ title, t }: { title: string; t: TFn }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-bold text-white">{title}</h3>
      <div className="rounded-[18px] border border-dashed border-[#f4d35e]/30 bg-[#162015] p-8 text-center text-sm font-semibold text-[#a8b5c7]">
        {t("states.comingSoon")}
      </div>
    </section>
  );
}

function FarmPanel({ plots, cfg, symbol, decimals, t, busy, disabled, onAction }: { plots: PlotView[]; cfg: ConfigView; symbol: string; decimals: number; t: TFn; busy: BusyKey; disabled: boolean; onAction: (key: string, fn: string, args: readonly unknown[]) => void }) {
  if (!plots.length) {
    return <div className="rounded-[18px] border border-dashed border-[#f4d35e]/30 bg-[#162015] p-6 text-center text-sm font-semibold text-[#a8b5c7]">{t("states.noLand")}</div>;
  }
  return (
    <section className="space-y-3">
      <h3 className="text-base font-bold text-white">{t("sections.farm")}</h3>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {plots.map((plot) => {
          const seed = seedConfigAt(cfg, plot.level);
          const land = landConfigAt(cfg, plot.level);
          const stage = plantStage(plot);
          const asset = plantAsset(plot);
          const cropMotionClass = stage === "seed" ? "flap-farm-seed-float" : stage === "stage1" || stage === "stage2" || stage === "mature" ? "flap-farm-mature-pulse" : "";
          return (
            <div key={plot.id} className="relative min-h-[420px] overflow-visible px-4 pb-4 pt-5">
              <LandBackground level={plot.level} />
              <div className="relative z-10 flex items-center justify-between gap-2">
                <div className="font-bold text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.65)]"><span className="rounded-lg bg-[#ffe66a] px-2 py-1 text-xs text-[#2b1b04]">Lv.{plot.level}</span> {t("labels.outputCap")}</div>
                <StatusBadge tone={plot.ready ? "success" : plot.status === 0 ? "warning" : "neutral"}>{statusKey(plot, t)}</StatusBadge>
              </div>
              <div className="relative z-10 mt-4 flex h-32 items-center justify-center">
                {asset ? (
                  <div className="h-32 w-32">
                    <div className={`h-full w-full ${cropMotionClass}`}>
                      <AssetImage className="h-full w-full object-contain drop-shadow-[0_10px_10px_rgba(0,0,0,0.45)]" name={asset} alt={`level ${plot.level} crop`} />
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="relative z-10 mt-3 space-y-2 rounded-2xl bg-black/35 p-3 text-sm font-semibold text-[#e6edf8] backdrop-blur-[1px]">
                <div className="h-2 overflow-hidden rounded-full bg-black/35"><span className="block h-full rounded-full bg-gradient-to-r from-[#8de15e] to-[#ffe66a]" style={{ width: `${Math.min(100, plot.progress / 100)}%` }} /></div>
                <div className="grid gap-1 text-xs text-[#c4cedc]">
                  <span>{t("labels.reward")}: {formatTokenAmount(seed.reward, decimals, 3)} {symbol}</span>
                  <span>{t("labels.outputCap")}: {formatTokenAmount(land.outputCap, decimals, 3)} {symbol}</span>
                  <span>{t("labels.matureTime")}: {String(seed.matureTime)}s · {t("labels.boost")}: {formatBps(plot.boostBps)}</span>
                  <span>{t("labels.outputCap")}: {formatTokenAmount(plot.remaining, decimals, 3)} {symbol}</span>
                </div>
              </div>
              <div className="relative z-10 mt-3 grid grid-cols-2 gap-2">
                <Button size="sm" disabled={disabled || plot.status !== 0 || plot.remaining <= 0n} loading={busy === `plant-${plot.id}`} onClick={() => onAction(`plant-${plot.id}`, "plant", [BigInt(plot.id)])}>{t("actions.plant")}</Button>
                <Button size="sm" variant="secondary" disabled={disabled || plot.status !== 1 || plot.ready || plot.fertilized} loading={busy === `fertilize-${plot.id}`} onClick={() => onAction(`fertilize-${plot.id}`, "fertilize", [BigInt(plot.id)])}>{t("actions.fertilize")}</Button>
                <Button size="sm" variant="secondary" disabled={disabled || !plot.ready} loading={busy === `harvest-${plot.id}`} onClick={() => onAction(`harvest-${plot.id}`, "harvest", [BigInt(plot.id)])}>{t("actions.harvest")}</Button>
                <Button size="sm" variant="outline" disabled={disabled || plot.status !== 0 || plot.level >= 3 || plot.remaining <= 0n} loading={busy === `upgrade-${plot.id}`} onClick={() => onAction(`upgrade-${plot.id}`, "upgradeLand", [BigInt(plot.id)])}>{t("actions.upgrade")}</Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ShopPanel({ amount, setAmount, selectedLevel, setSelectedLevel, cfg, symbol, decimals, t, busy, disabled, buyLandCost, buySeedCost, buyFertCost, amountInt, runWrite }: { amount: string; setAmount: (value: string) => void; selectedLevel: number; setSelectedLevel: (value: number) => void; cfg: ConfigView; symbol: string; decimals: number; t: TFn; busy: BusyKey; disabled: boolean; buyLandCost: bigint; buySeedCost: bigint; buyFertCost: bigint; amountInt: bigint; runWrite: (key: string, fn: string, args: readonly unknown[], requiredAmount?: bigint) => Promise<void> }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-bold text-white">{t("sections.shop")}</h3>
      <div className="grid gap-3 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="space-y-3 rounded-[18px] border border-white/10 bg-black/25 p-4">
          <label className="space-y-1 text-sm font-semibold text-[#dfe9fb]">{t("labels.amount")}<Input value={amount} inputMode="numeric" onChange={(event) => setAmount(event.target.value)} /></label>
          <div className="flex gap-2">{[1, 2, 3].map((level) => <Button key={level} size="sm" variant={selectedLevel === level ? "secondary" : "ghost"} onClick={() => setSelectedLevel(level)}>Lv.{level}</Button>)}</div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <ShopCard title={t("actions.buyLand")} imageName="land1.png" icon={<Tractor className="h-6 w-6" />} detail={`${t("labels.landPrice")}: ${formatTokenAmount(landConfigAt(cfg, 1).price, decimals, 3)} ${symbol}`} cost={buyLandCost} symbol={symbol} decimals={decimals} loading={busy === "buyLand"} disabled={disabled} onClick={() => void runWrite("buyLand", "buyLand", [amountInt], buyLandCost)} />
          <ShopCard title={t("actions.buySeed")} imageName={`plant-l${safeLevel(selectedLevel)}-seed.png`} icon={<Sprout className="h-6 w-6" />} detail={`${t("labels.seedPrice")}: ${formatTokenAmount(seedConfigAt(cfg, selectedLevel).price, decimals, 3)} ${symbol}`} cost={buySeedCost} symbol={symbol} decimals={decimals} loading={busy === "buySeed"} disabled={disabled} onClick={() => void runWrite("buySeed", "buySeed", [safeLevel(selectedLevel), amountInt], buySeedCost)} />
          <ShopCard title={t("actions.buyFertilizer")} imageName={`fert-l${safeLevel(selectedLevel)}.png`} icon={<Leaf className="h-6 w-6" />} detail={`${t("labels.fertPrice")}: ${formatTokenAmount(fertConfigAt(cfg, selectedLevel).price, decimals, 3)} ${symbol} · ${formatBps(fertConfigAt(cfg, selectedLevel).boostBps)}`} cost={buyFertCost} symbol={symbol} decimals={decimals} loading={busy === "buyFertilizer"} disabled={disabled} onClick={() => void runWrite("buyFertilizer", "buyFertilizer", [safeLevel(selectedLevel), amountInt], buyFertCost)} />
        </div>
      </div>
    </section>
  );
}

function ShopCard({ title, imageName, icon, detail, cost, symbol, decimals, loading, disabled, onClick }: { title: string; imageName: string; icon: ReactNode; detail: string; cost: bigint; symbol: string; decimals: number; loading: boolean; disabled: boolean; onClick: () => void }) {
  return <div className="space-y-3 rounded-[18px] border border-white/10 bg-[#121a26] p-4"><div className="flex items-center gap-2 text-[#f4d35e]">{icon}<b>{title}</b></div><div className="grid h-24 place-items-center rounded-2xl bg-black/20 text-[#f4d35e]"><AssetImage className="h-20 max-w-[90%] object-contain drop-shadow-[0_10px_10px_rgba(0,0,0,0.35)]" name={imageName} alt={title} /></div><p className="text-xs font-semibold leading-5 text-[#9eadc0]">{detail}</p><Metric label="Cost" value={formatTokenAmount(cost, decimals, 4)} hint={symbol} tone="primary" /><Button className="w-full" loading={loading} disabled={disabled} onClick={onClick}>{title}</Button></div>;
}

function BagPanel({ snapshot, cfg, symbol, decimals, t }: { snapshot: Snapshot | null; cfg: ConfigView; symbol: string; decimals: number; t: TFn }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-bold text-white">{t("sections.bag")}</h3>
      <div className="grid gap-3 md:grid-cols-3">
        {[1, 2, 3].map((level) => <InventoryCard key={`s-${level}`} title={`Lv.${level} ${t("labels.seedStock")}`} imageName={`plant-l${level}-seed.png`} value={String(snapshot?.seedStock[level] ?? 0n)} hint={`${t("labels.reward")}: ${formatTokenAmount(seedConfigAt(cfg, level).reward, decimals, 3)} ${symbol}`} />)}
        {[1, 2, 3].map((level) => <InventoryCard key={`f-${level}`} title={`Lv.${level} ${t("labels.fertStock")}`} imageName={`fert-l${level}.png`} value={String(snapshot?.fertStock[level] ?? 0n)} hint={`${t("labels.boost")}: ${formatBps(fertConfigAt(cfg, level).boostBps)}`} />)}
      </div>
    </section>
  );
}
function InventoryCard({ title, imageName, value, hint }: { title: string; imageName: string; value: string; hint: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-[#121a26] p-4">
      <AssetImage className="h-14 w-14 shrink-0 object-contain drop-shadow-[0_8px_8px_rgba(0,0,0,0.35)]" name={imageName} alt={title} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-[#9eadc0]">{title}</div>
        <div className="text-xl font-bold text-[#f4d35e]">{value}</div>
        <div className="truncate text-xs font-semibold text-[#9eadc0]">{hint}</div>
      </div>
    </div>
  );
}
