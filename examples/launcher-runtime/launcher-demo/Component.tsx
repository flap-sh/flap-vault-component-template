import { useRef, useState } from "react";

type Messages = Record<string, string>;
type Values = { name: string; symbol: string; description: string; metadataCid: string; targetRaiseWei: string; saleDurationSeconds: string; contributorBps: string };
type Identity = { chainId: number; factoryAddress: string };
type ConfigProps = {
  context: { previewOnly: boolean; locale: string; identity: Identity; initialValues: Values; constraints: { minimumTargetWei: string; maximumTargetWei: string; launchMinimumTargetWei: string | null; launchFloorAvailable: boolean; maxSaleDurationSeconds: string; minContributorBps: string; maxContributorBps: string } };
  messages: Messages;
  resources: { available: boolean; uploadTokenMetadata(input: { name: string; symbol: string; description: string; image: File }): Promise<{ cid: string }> };
  onChange(values: Values): void;
};
type Snapshot = {
  account: string | null; expectedToken: string;
  values: { name: string; symbol: string }; targetRaiseWei: string; raisedWei: string; remainingWei: string; saleDeadline: string; blockTimestamp: string;
  launched: boolean; launching: boolean; contributionWei: string; launcherClaimedWei?: string; launcherClaimableWei: string; refundableWei: string; refundAvailable: boolean;
  tokenAddress: string; poolAddress: string; blockNumber: string;
  launchReadiness: { available: boolean; reason: string | null; minimumRaiseWei: string | null };
};
type LauncherProps = {
  context: { previewOnly: boolean; locale: string; identity: Identity; launcherAddress: string | null; snapshot: Snapshot | null; tokenTaxInfoHref: string | null };
  messages: Messages;
  host: { available: boolean; requestAction(action: "contribute" | "launcher-claim" | "refund" | "vault-claim", amountWei?: string): Promise<void>; refresh(): Promise<void> };
};

const panel = { border: "1px solid #303236", background: "#101112", borderRadius: 8, padding: 20, display: "grid", gap: 16, color: "#fff", minWidth: 0 };
const field = { width: "100%", minWidth: 0, padding: "12px 14px", color: "#fff", background: "#080909", border: "1px solid #404246", borderRadius: 4, boxSizing: "border-box" as const };
const button = { padding: "12px 18px", color: "#070808", background: "#d0ff00", border: 0, borderRadius: 4, cursor: "pointer", fontWeight: 700, whiteSpace: "normal" as const };
const label = { display: "grid", gap: 8, color: "#d4d4d4", fontSize: 14 };
const note = { margin: 0, fontSize: 13, lineHeight: 1.7, color: "#a5a7aa", overflowWrap: "anywhere" as const };
const warning = { ...note, color: "#f2d16b" };

function native(value: string | null) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return "—";
  const integer = BigInt(value);
  const fraction = (integer % 1000000000000000000n).toString().padStart(18, "0").replace(/0+$/, "");
  return (integer / 1000000000000000000n).toString() + (fraction ? "." + fraction : "");
}
function wei(value: string) {
  if (!/^\d+(?:\.\d{0,18})?$/.test(value)) return "";
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * 1000000000000000000n + BigInt(fraction.padEnd(18, "0"))).toString();
}
function numberString(value: string, scale: bigint) {
  return /^\d+$/.test(value) ? (BigInt(value) * scale).toString() : "";
}
function percent(value: string) {
  if (!/^\d+$/.test(value)) return "";
  const n = BigInt(value);
  return (n / 100n).toString() + (n % 100n ? "." + (n % 100n).toString().padStart(2, "0").replace(/0+$/, "") : "");
}
function bps(value: string) {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return "";
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}

export function LauncherConfig({ context, messages, resources, onChange }: ConfigProps) {
  const [values, setValues] = useState(context.initialValues);
  const [image, setImage] = useState<File | null>(null);
  const [target, setTarget] = useState(native(context.initialValues.targetRaiseWei));
  const [duration, setDuration] = useState(context.initialValues.saleDurationSeconds);
  const [share, setShare] = useState(percent(context.initialValues.contributorBps));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const revision = useRef(0);
  const uploadLock = useRef(false);
  const latestValues = useRef(values);
  function change(next: Values, metadataChanged = false) {
    if (metadataChanged) revision.current += 1;
    setValues(next);
    latestValues.current = next;
    onChange(next);
    setUploadError(false);
  }
  async function upload() {
    if (!resources.available || !image || !values.name.trim() || !values.symbol.trim() || uploadLock.current) return;
    uploadLock.current = true;
    setUploading(true);
    setUploadError(false);
    const startedRevision = revision.current;
    try {
      const result = await resources.uploadTokenMetadata({ name: values.name, symbol: values.symbol, description: values.description, image });
      if (startedRevision === revision.current) change({ ...latestValues.current, metadataCid: result.cid });
    } catch {
      setUploadError(true);
    } finally {
      uploadLock.current = false;
      setUploading(false);
    }
  }
  return <section style={panel}>
    <h2 style={{ margin: 0, fontSize: 20 }}>{messages.configTitle}</h2>
    <p style={note}>{messages.configDescription}</p>
    <label style={label}>{messages.name}<input style={field} value={values.name} maxLength={64} disabled={uploading} onChange={event => change({ ...values, name: event.target.value, metadataCid: "" }, true)} /></label>
    <label style={label}>{messages.symbol}<input style={field} value={values.symbol} maxLength={12} disabled={uploading} onChange={event => change({ ...values, symbol: event.target.value, metadataCid: "" }, true)} /></label>
    <label style={label}>{messages.description}<textarea style={field} value={values.description} rows={3} maxLength={160} disabled={uploading} onChange={event => change({ ...values, description: event.target.value, metadataCid: "" }, true)} /></label>
    <label style={label}>{messages.image}<input style={field} type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={!resources.available || uploading} onChange={event => { setImage(event.target.files?.[0] ?? null); change({ ...values, metadataCid: "" }, true); }} /></label>
    <button style={button} type="button" disabled={!resources.available || !image || !values.name.trim() || !values.symbol.trim() || uploading} onClick={() => void upload()}>{uploading ? messages.uploading : messages.upload}</button>
    <p style={context.previewOnly || !resources.available ? warning : note}>{!resources.available ? messages.resourcesUnavailable : messages.uploadHint}</p>
    {values.metadataCid ? <p style={note}>{messages.metadataReady}: {values.metadataCid}</p> : null}
    {uploadError ? <p role="alert" style={warning}>{messages.uploadFailed}</p> : null}
    <label style={label}>{messages.target}<input style={field} value={target} inputMode="decimal" onChange={event => { setTarget(event.target.value); change({ ...values, targetRaiseWei: wei(event.target.value) }); }} /></label>
    <p style={context.constraints.launchFloorAvailable ? note : warning}>{context.constraints.launchFloorAvailable && context.constraints.launchMinimumTargetWei ? messages.minimumTarget + ": " + native(context.constraints.launchMinimumTargetWei) + " tBNB" : messages.floorUnavailable}</p>
    <label style={label}>{messages.duration}<input style={field} value={duration} inputMode="numeric" onChange={event => { setDuration(event.target.value); change({ ...values, saleDurationSeconds: numberString(event.target.value, 1n) }); }} /></label>
    <label style={label}>{messages.share}<input style={field} value={share} inputMode="decimal" onChange={event => { setShare(event.target.value); change({ ...values, contributorBps: bps(event.target.value) }); }} /></label>
    <p style={note}>{messages.shareHint}</p>
    <p style={warning}>{messages.reviewHint}</p>
  </section>;
}

function utcDeadline(value: string, locale: string) {
  if (!/^\d+$/.test(value)) return "—";
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 8640000000000) return "—";
  try {
    return Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale === "ko" ? "ko-KR" : "en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC",
    }).format(seconds * 1000);
  } catch { return "—"; }
}

const launchPanel = { minWidth: 0, display: "grid", gap: 24, padding: "clamp(16px, 4vw, 28px)", border: "1px solid #484B51", borderRadius: 4, color: "#FFFFFF", background: "#070808", fontSize: 14, lineHeight: 1.5 };
const mutedText = { margin: 0, color: "#84888C", fontSize: 12, lineHeight: 1.6 };
const actionPanel = { minWidth: 0, display: "grid", gap: 16, padding: "clamp(16px, 3vw, 24px)", border: "1px solid #484B51", borderRadius: 2, background: "#131516" };
const primaryAction = { minHeight: 42, padding: "10px 16px", border: "1px solid #D0FF00", borderRadius: 2, background: "#D0FF00", color: "#070808", fontSize: 14, fontWeight: 600, lineHeight: "20px", textDecoration: "none", textAlign: "center" as const, cursor: "pointer", boxSizing: "border-box" as const };
const compactAction = { minHeight: 32, padding: "6px 12px", border: "1px solid #484B51", borderRadius: 2, background: "transparent", color: "#D4D4D4", fontSize: 12, lineHeight: "18px", cursor: "pointer" };
const metricStyle = { minWidth: 0, flex: "1 1 150px", boxSizing: "border-box" as const, display: "grid", alignContent: "start", gap: 8, padding: 16, background: "#131516", border: "1px solid #303236", borderRadius: 2 };
const metricValue = { fontSize: "clamp(18px, 3vw, 24px)", fontWeight: 500, lineHeight: 1.4, overflowWrap: "anywhere" as const };
const detailRow = { display: "flex", flexWrap: "wrap" as const, justifyContent: "space-between", gap: "4px 16px", padding: "8px 0", borderBottom: "1px solid #303236" };
const technicalValue = { minWidth: 0, maxWidth: "100%", color: "#D4D4D4", fontSize: 12, overflowWrap: "anywhere" as const, textAlign: "right" as const };

export function Launcher({ context, messages, host }: LauncherProps) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<"contribute" | "launcher-claim" | "refund" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const snapshot = context.snapshot;
  const amountWei = wei(amount);
  const expired = Boolean(snapshot && BigInt(snapshot.blockTimestamp) >= BigInt(snapshot.saleDeadline));
  const fundingOpen = Boolean(snapshot && !snapshot.launched && !snapshot.launching && !expired && BigInt(snapshot.remainingWei) > 0n && snapshot.launchReadiness.available);
  const canContribute = Boolean(fundingOpen && amountWei && BigInt(amountWei) > 0n && snapshot && BigInt(amountWei) <= BigInt(snapshot.remainingWei));
  const claimedWei = snapshot && typeof snapshot.launcherClaimedWei === "string" && /^\d+$/.test(snapshot.launcherClaimedWei) ? snapshot.launcherClaimedWei : null;
  const claimAvailable = Boolean(snapshot?.launched && snapshot.account && BigInt(snapshot.launcherClaimableWei) > 0n);
  const claimComplete = Boolean(snapshot?.launched && snapshot.account && claimedWei !== null && BigInt(claimedWei) > 0n && BigInt(snapshot.launcherClaimableWei) === 0n);
  const refundAvailable = Boolean(snapshot?.refundAvailable && BigInt(snapshot.refundableWei) > 0n);
  const lastContribution = Boolean(canContribute && snapshot && amountWei === snapshot.remainingWei);
  const progressBps = snapshot && BigInt(snapshot.targetRaiseWei) > 0n
    ? Number((BigInt(snapshot.raisedWei) > BigInt(snapshot.targetRaiseWei) ? BigInt(snapshot.targetRaiseWei) : BigInt(snapshot.raisedWei)) * 10000n / BigInt(snapshot.targetRaiseWei)) : 0;
  const progressLabel = Intl.NumberFormat(context.locale, { maximumFractionDigits: 2 }).format(progressBps / 100) + "%";
  const statusLabel = snapshot?.launched ? messages.launched : snapshot?.launching ? messages.launching : expired ? messages.expired : messages.funding;
  const actionDisabled = !host.available || context.previewOnly || busy;
  const amountError = amount.trim() && (!amountWei || BigInt(amountWei) <= 0n) ? messages.invalidAmount
    : amountWei && snapshot && BigInt(amountWei) > BigInt(snapshot.remainingWei) ? messages.amountExceedsRemaining : null;
  async function review(action: "contribute" | "launcher-claim" | "refund") {
    if (!host.available || context.previewOnly || lock.current) return;
    if (action === "contribute" && !canContribute || action === "launcher-claim" && !claimAvailable || action === "refund" && !refundAvailable) return;
    lock.current = true;
    setBusy(true); setPendingAction(action); setFailed(false);
    try { await host.requestAction(action, action === "contribute" ? amountWei : undefined); }
    catch { setFailed(true); }
    finally { lock.current = false; setBusy(false); setPendingAction(null); }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setRefreshing(true); setFailed(false);
    try { await host.refresh(); } catch { setFailed(true); }
    finally { lock.current = false; setBusy(false); setRefreshing(false); }
  }
  return <section style={launchPanel}>
    <header style={{ minWidth: 0, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
      <div style={{ minWidth: 0, flex: "1 1 220px", display: "grid", gap: 8 }}>
        <p style={mutedText}>{messages.networkName} · {messages.nativeSymbol}</p>
        <h1 style={{ margin: 0, fontSize: "clamp(24px, 5vw, 32px)", lineHeight: 1.3, fontWeight: 600, overflowWrap: "anywhere" }}>{snapshot ? snapshot.values.name : messages.launcherTitle}</h1>
        {snapshot ? <span style={{ color: "#A0A3A7", fontSize: 14 }}>{snapshot.values.symbol}</span> : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {snapshot ? <span style={{ padding: "5px 10px", border: "1px solid #484B51", borderRadius: 2, color: snapshot.launched ? "#D0FF00" : "#D4D4D4", fontSize: 12 }}>{statusLabel}</span> : null}
        <button style={compactAction} type="button" aria-busy={refreshing} disabled={busy} onClick={() => void refresh()}>{refreshing ? messages.refreshing : messages.refresh}</button>
      </div>
    </header>
    {!snapshot ? <p role="status" style={warning}>{messages.noSnapshot}</p> : <>
      {!snapshot.launched ? <section aria-label={messages.progress} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}><span style={{ color: "#A0A3A7" }}>{messages.progress}</span><strong style={{ color: "#D0FF00", fontWeight: 500 }}>{progressLabel}</strong></div>
        <div role="progressbar" aria-label={messages.progress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressBps / 100} aria-valuetext={progressLabel} style={{ height: 8, overflow: "hidden", borderRadius: 2, background: "#303236" }}><div style={{ width: progressBps / 100 + "%", height: "100%", background: "#D0FF00" }} /></div>
        <p style={mutedText}>{messages.deadline}: <span style={{ color: "#D4D4D4" }}>{utcDeadline(snapshot.saleDeadline, context.locale)} {messages.timezone}</span></p>
      </section> : null}
      {snapshot.launched ? <h2 style={{ margin: 0, color: "#A0A3A7", fontSize: 14, fontWeight: 500 }}>{messages.fundingResult}</h2> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <div style={metricStyle}><span style={mutedText}>{messages.raised}</span><div style={metricValue}>{native(snapshot.raisedWei)} <span style={{ fontSize: 12, color: "#84888C" }}>{messages.nativeSymbol}</span></div></div>
        <div style={metricStyle}><span style={mutedText}>{messages.targetMetric}</span><div style={metricValue}>{native(snapshot.targetRaiseWei)} <span style={{ fontSize: 12, color: "#84888C" }}>{messages.nativeSymbol}</span></div></div>
        {!snapshot.launched ? <div style={metricStyle}><span style={mutedText}>{messages.remaining}</span><div style={metricValue}>{native(snapshot.remainingWei)} <span style={{ fontSize: 12, color: "#84888C" }}>{messages.nativeSymbol}</span></div></div> : null}
        <div style={metricStyle}><span style={mutedText}>{messages.myContribution}</span><div style={metricValue}>{snapshot.account ? native(snapshot.contributionWei) : "—"} <span style={{ fontSize: 12, color: "#84888C" }}>{messages.nativeSymbol}</span></div></div>
      </div>
      {!snapshot.launched && !snapshot.launching && !expired && BigInt(snapshot.remainingWei) > 0n ? <section aria-label={messages.participateTitle} style={actionPanel}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{messages.participateTitle}</h2>
        {!snapshot.launchReadiness.available ? <p role="alert" style={warning}>{messages.launchUnavailable}{snapshot.launchReadiness.minimumRaiseWei ? " " + messages.minimumTarget + ": " + native(snapshot.launchReadiness.minimumRaiseWei) + " " + messages.nativeSymbol : ""}</p> : null}
        <label style={{ display: "grid", gap: 8, color: "#D4D4D4" }}>{messages.contributionAmount}
          <span style={{ display: "flex", minWidth: 0, alignItems: "center", border: "1px solid #484B51", borderRadius: 2, background: "#070808" }}>
            <input style={{ minWidth: 0, width: "100%", minHeight: 42, boxSizing: "border-box", border: 0, padding: "10px 12px", outlineColor: "#D0FF00", color: "#FFFFFF", background: "transparent", fontSize: 16 }} value={amount} inputMode="decimal" placeholder={messages.amountPlaceholder} disabled={busy || context.previewOnly || !fundingOpen} onChange={event => setAmount(event.target.value)} />
            <button style={{ ...compactAction, marginRight: 6, minHeight: 28, minWidth: 48, flexShrink: 0, whiteSpace: "nowrap", padding: "3px 8px" }} type="button" disabled={busy || context.previewOnly || !fundingOpen} onClick={() => setAmount(native(snapshot.remainingWei))}>{messages.maxAmount}</button>
            <span style={{ paddingRight: 12, color: "#84888C", fontSize: 12 }}>{messages.nativeSymbol}</span>
          </span>
        </label>
        {amountError ? <p role="alert" style={{ ...mutedText, color: "#FF6B6B" }}>{amountError}</p> : null}
        <button style={{ ...primaryAction, opacity: actionDisabled || !canContribute ? 0.45 : 1, cursor: actionDisabled || !canContribute ? "not-allowed" : "pointer" }} type="button" aria-busy={pendingAction === "contribute"} disabled={actionDisabled || !canContribute} onClick={() => void review("contribute")}>{pendingAction === "contribute" ? messages.checkingContribution : messages.reviewContribution}</button>
        <p style={mutedText}>{messages.autoLaunch}</p>
        {lastContribution ? <p role="note" style={warning}>{messages.finalContribution}</p> : null}
        {!context.previewOnly && !host.available && !busy ? <p style={mutedText}>{snapshot.account ? messages.actionUnavailable : messages.connectToParticipate}</p> : null}
      </section> : null}
      {snapshot.launching ? <p role="status" style={mutedText}>{messages.launchingNotice}</p> : null}
      {snapshot.launched ? <section aria-label={messages.myTokens} style={actionPanel}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{messages.myTokens}</h2>
          {claimComplete ? <span style={{ padding: "4px 10px", border: "1px solid #484B51", borderRadius: 2, color: "#D0FF00", fontSize: 12 }}>{messages.claimComplete}</span> : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 16 }}>
          <div><p style={mutedText}>{messages.tokenClaimable}</p><p style={{ ...metricValue, margin: "8px 0 0" }}>{snapshot.account ? native(snapshot.launcherClaimableWei) : "—"} <span style={{ fontSize: 14, color: "#84888C" }}>{snapshot.values.symbol}</span></p></div>
          <div><p style={mutedText}>{messages.tokensClaimed}</p><p style={{ ...metricValue, margin: "8px 0 0" }}>{snapshot.account ? native(claimedWei) : "—"} <span style={{ fontSize: 14, color: "#84888C" }}>{snapshot.values.symbol}</span></p></div>
        </div>
        {claimAvailable ? <button style={{ ...primaryAction, opacity: actionDisabled ? 0.45 : 1 }} type="button" aria-busy={pendingAction === "launcher-claim"} disabled={actionDisabled} onClick={() => void review("launcher-claim")}>{pendingAction === "launcher-claim" ? messages.checkingClaim : messages.reviewClaim}</button>
          : <p style={mutedText}>{!snapshot.account ? messages.connectToReadTokens : claimedWei === null ? messages.claimHistoryUnavailable : claimComplete ? messages.claimCompleteDescription : BigInt(snapshot.contributionWei) === 0n && claimedWei === "0" ? messages.noAllocation : messages.noTokensAvailable}</p>}
      </section> : null}
      {refundAvailable ? <section aria-label={messages.refundTitle} style={actionPanel}><h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{messages.refundTitle}</h2><p style={mutedText}>{messages.refundDescription}</p><p style={{ ...metricValue, margin: 0 }}>{native(snapshot.refundableWei)} <span style={{ fontSize: 12, color: "#84888C" }}>{messages.nativeSymbol}</span></p><button style={{ ...primaryAction, opacity: actionDisabled ? 0.45 : 1 }} type="button" aria-busy={pendingAction === "refund"} disabled={actionDisabled} onClick={() => void review("refund")}>{pendingAction === "refund" ? messages.checkingRefund : messages.reviewRefund}</button></section> : null}
      {expired && !snapshot.launched && !refundAvailable ? <p style={mutedText}>{messages.fundingEnded}</p> : null}
      <details style={{ minWidth: 0, borderTop: "1px solid #303236", paddingTop: 16 }}>
        <summary style={{ cursor: "pointer", color: "#A0A3A7", fontSize: 12 }}>{messages.contractDetails}</summary>
        <div style={{ marginTop: 12 }}>
          <div style={detailRow}><span style={mutedText}>{messages.launcherAddress}</span><span style={technicalValue}>{context.launcherAddress ?? messages.noLauncher}</span></div>
          <div style={detailRow}><span style={mutedText}>{messages.factoryAddress}</span><span style={technicalValue}>{context.identity.factoryAddress}</span></div>
          <div style={detailRow}><span style={mutedText}>{messages.tokenCa}</span><span style={technicalValue}>{snapshot.launched ? snapshot.tokenAddress : snapshot.expectedToken}</span></div>
          {snapshot.launched ? <div style={detailRow}><span style={mutedText}>{messages.pool}</span><span style={technicalValue}>{snapshot.poolAddress}</span></div> : null}
          <div style={detailRow}><span style={mutedText}>{messages.observedBlock}</span><span style={technicalValue}>{snapshot.blockNumber}</span></div>
          {snapshot.launched && context.tokenTaxInfoHref ? <a href={context.tokenTaxInfoHref} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 12, color: "#D0FF00", fontSize: 12 }}>{messages.openVault}</a> : null}
        </div>
      </details>
    </>}
    {context.previewOnly ? <p style={warning}>{messages.readonly}</p> : null}
    {failed ? <p role="alert" style={{ ...mutedText, color: "#FF6B6B" }}>{messages.actionFailed}</p> : null}
  </section>;
}
