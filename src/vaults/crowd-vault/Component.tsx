"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VaultComponentProps } from "@/src/sdk";
import { formatPercentBps, formatTokenAmount, handleTxError, isActionAvailableForPhase, readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { AddressLink, Alert, Button, Card, CardContent, CardHeader, CardTitle, DataRow, Metric, StatusBadge } from "@/src/ui";
import { vaultAbi } from "./VaultABI";

type Revenue = { totalRevenue: bigint; totalPaid: bigint; contributorBps: number; creator: `0x${string}`; targetRaise: bigint };
type Account = { entitled: bigint; claimed: bigint; claimable: bigint };

export default function CrowdVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const { context, i18n, wallet } = sdk;
  const t = i18n.t;
  const host = readTaxVaultHostContext(context.host);
  const riskLevel = host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel ?? null;
  const riskLabel = riskLevel === 1 ? t("risk.low") : riskLevel === 2 ? t("risk.lowMedium") : riskLevel === 3 ? t("risk.medium") : riskLevel === 4 ? t("risk.high") : riskLevel === 0 ? t("risk.unverified") : t("risk.missing");
  const riskTone = riskLevel === null || riskLevel === 0 || riskLevel >= 4 ? "danger" : riskLevel >= 3 ? "warning" : "success";
  const stageAvailable = isActionAvailableForPhase("dex-listed", host.marketPhase);
  const validVault = /^0x[0-9a-fA-F]{40}$/.test(context.vaultAddress) && !/^0x0{40}$/i.test(context.vaultAddress);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const claimLock = useRef(false);
  const readRevision = useRef(0);
  const messages = useMemo(() => ({ userRejected: t("errors.userRejected"), walletDisconnected: t("errors.walletDisconnected"), insufficientFunds: t("errors.insufficientFunds"), simulationFailed: t("errors.simulationFailed"), reverted: t("errors.reverted"), unknown: t("errors.transaction") }), [t]);

  const loadData = useCallback(async () => {
    const revision = ++readRevision.current;
    if (!validVault) { setRevenue(null); setAccount(null); setLoading(false); setError(t("errors.binding")); return; }
    try {
      const [taxToken, creator, targetRaise, contributorBps, totalRevenue, totalPaid] = await Promise.all([
        sdk.readContract<`0x${string}`>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "taxToken" }),
        sdk.readContract<`0x${string}`>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "creator" }),
        sdk.readContract<bigint>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "targetRaise" }),
        sdk.readContract<number>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "contributorBps" }),
        sdk.readContract<bigint>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "totalRevenue" }),
        sdk.readContract<bigint>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "totalPaid" }),
      ]);
      if (revision !== readRevision.current) return;
      if (taxToken.toLowerCase() !== context.tokenAddress.toLowerCase() || targetRaise <= 0n || contributorBps < 1000 || contributorBps > 9000) {
        setRevenue(null); setAccount(null); setError(t("errors.binding")); return;
      }
      setRevenue({ creator, targetRaise, contributorBps, totalRevenue, totalPaid });
      if (context.userAddress && !wallet.isWrongNetwork) {
        const args = [context.userAddress];
        const [entitled, claimed, claimable] = await Promise.all([
          sdk.readContract<bigint>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "entitled", args }),
          sdk.readContract<bigint>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "claimed", args }),
          sdk.readContract<bigint>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "claimable", args }),
        ]);
        if (revision !== readRevision.current) return;
        setAccount({ entitled, claimed, claimable });
      } else setAccount(null);
      setError(null);
    } catch {
      if (revision === readRevision.current) { setRevenue(null); setAccount(null); setError(t("errors.read")); }
    } finally { if (revision === readRevision.current) setLoading(false); }
  }, [context.tokenAddress, context.userAddress, context.vaultAddress, sdk, t, validVault, wallet.isWrongNetwork]);

  useEffect(() => {
    setLoading(true); setRevenue(null); setAccount(null); setConfirmed(false);
    void loadData();
    const timer = setInterval(() => void loadData(), 15000);
    return () => { clearInterval(timer); readRevision.current += 1; };
  }, [loadData, sdk.refetchNonce]);

  const unavailable = !validVault ? t("errors.binding") : wallet.isWrongNetwork ? t("states.wrongNetwork") : !context.userAddress || !wallet.isConnected ? t("states.connect") : !stageAvailable ? t("states.listingRequired") : loading || !revenue ? t("states.loading") : !account || account.claimable <= 0n ? t("states.nothing") : null;
  async function claim() {
    if (unavailable || claimLock.current) return;
    claimLock.current = true; setBusy(true); setConfirmed(false); setError(null);
    try {
      const simulation = await sdk.simulateContract({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "claim", args: [] });
      const hash = await sdk.writeContract(simulation.request);
      const receipt = await sdk.waitForTx(hash);
      if (receipt.status !== "success") { setError(t("errors.reverted")); return; }
      setConfirmed(true);
      sdk.notify.success(t("messages.claimed"));
      await loadData();
    } catch (nextError) { setError(handleTxError(nextError, messages)); }
    finally { claimLock.current = false; setBusy(false); }
  }

  return <div className="w-full min-w-0 space-y-4">
    <Card className="overflow-hidden rounded-[18px] border-white/10 bg-black/25">
      <CardHeader className="space-y-3 p-4 pb-3 sm:p-5 sm:pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{t("title")}</CardTitle><StatusBadge tone={riskTone}>{riskLabel}</StatusBadge></div>
        {riskLevel === null ? <Alert tone="danger">{t("notices.riskMissing")}</Alert> : riskLevel === 0 || riskLevel >= 4 ? <Alert tone="warning">{t("notices.review")}</Alert> : null}
        <p className="text-sm leading-6 text-white/60">{t("description")}</p>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label={t("labels.revenue")} value={revenue ? formatTokenAmount(revenue.totalRevenue, 18) : "—"} hint="tBNB" />
          <Metric label={t("labels.paid")} value={revenue ? formatTokenAmount(revenue.totalPaid, 18) : "—"} hint="tBNB" />
        </div>
        <section aria-label={t("sections.claim")} className="space-y-3 rounded-[14px] border border-white/10 bg-black/30 p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-white">{t("sections.claim")}</h3>
          <div>
            <p className="text-xs leading-5 text-white/55">{t("labels.claimable")}</p>
            <p className="mt-1 break-words text-2xl font-semibold text-white">{account ? formatTokenAmount(account.claimable, 18) : "—"} <span className="text-xs font-normal text-white/55">tBNB</span></p>
          </div>
          {unavailable ? <Alert tone="warning">{unavailable}</Alert> : null}
          <Button className="w-full" type="button" disabled={Boolean(unavailable) || busy} loading={busy} onClick={() => void claim()}>{busy ? t("actions.confirming") : t("actions.claim")}</Button>
          {confirmed ? <Alert tone="success">{t("messages.claimed")}</Alert> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <dl className="grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2">
            <div className="min-w-0"><dt className="text-xs leading-5 text-white/55">{t("labels.entitled")}</dt><dd className="mt-1 break-words text-sm text-white">{account ? formatTokenAmount(account.entitled, 18) : "—"} tBNB</dd></div>
            <div className="min-w-0"><dt className="text-xs leading-5 text-white/55">{t("labels.claimed")}</dt><dd className="mt-1 break-words text-sm text-white">{account ? formatTokenAmount(account.claimed, 18) : "—"} tBNB</dd></div>
          </dl>
          <Button variant="outline" type="button" disabled={loading || busy} onClick={() => { setLoading(true); void loadData(); }}>{t("actions.refresh")}</Button>
        </section>
        <details className="border-t border-white/10 pt-3">
          <summary className="cursor-pointer text-sm text-white/70">{t("labels.vault")}</summary>
          <div className="mt-3 space-y-2">
            <DataRow label={t("labels.contributors")} value={revenue ? formatPercentBps(revenue.contributorBps) : "—"} />
            <DataRow label={t("labels.creatorShare")} value={revenue ? formatPercentBps(10000 - revenue.contributorBps) : "—"} />
            <DataRow label={t("labels.creator")} value={revenue ? <AddressLink address={revenue.creator} explorerBaseUrl={context.explorerBaseUrl} /> : "—"} />
            <DataRow label={t("labels.vault")} value={<AddressLink address={context.vaultAddress} explorerBaseUrl={context.explorerBaseUrl} />} />
            <DataRow label={t("labels.token")} value={<AddressLink address={context.tokenAddress} explorerBaseUrl={context.explorerBaseUrl} />} />
            <DataRow label={t("labels.factory")} value={<AddressLink address={context.factoryAddress} explorerBaseUrl={context.explorerBaseUrl} />} />
            <p className="text-xs leading-6 text-white/55">{t("notices.accounting")}</p>
          </div>
        </details>
      </CardContent>
    </Card>
  </div>;
}
