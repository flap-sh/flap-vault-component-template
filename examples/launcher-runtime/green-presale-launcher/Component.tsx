import { useRef, useState, type CSSProperties, type ReactNode } from "react";

type Messages = Record<string, string>;
type Identity = Readonly<{ chainId: number; factoryAddress: string }>;
type Wallet = Readonly<{
  account: string | null;
  chainId: number | null;
  pendingHash?: string | null;
  connect(): void;
  switchChain(): Promise<void>;
}>;
type Action = "contribute" | "claim" | "refund" | "cancel";
type Submission = { status: "success" | "pending" | "reverted" | "unverified"; hash: string; launcherAddress?: string };
type Host = Readonly<{
  wallet?: Wallet;
  quote?(): Promise<string | null>;
  encode?(parameters: readonly AbiParameter[], values: readonly unknown[]): string;
  findSalt?(): Promise<string>;
  submit?(input: { kind: "create"; configuration: string; valueWei: string }
    | { kind: "action"; action: Action; valueWei?: string }): Promise<Submission>;
  checkReceipt?(hash: string): Promise<Submission>;
  refresh?(): void;
  redirect?(path: string): boolean;
  openLauncher?(address: string): void;
}>;
type AbiParameter = { name: string; type: string; components?: readonly AbiParameter[] };

type ConfigProps = {
  context: Readonly<{ identity: Identity; locale: string }>;
  messages: Messages;
  host?: Host;
};
type DetailProps = {
  context: Readonly<{
    identity: Identity;
    locale: string;
    launcherAddress: string | null;
    snapshot: Readonly<{
      raised?: string | null;
      cap?: string | null;
      launched?: boolean | null;
      launchedToken?: string | null;
      predictedToken?: string | null;
      startAt?: string | null;
      endAt?: string | null;
      creator?: string | null;
      paidGross?: string | null;
      shares?: string | null;
      claimed?: string | null;
      refunded?: string | null;
      status?: string | null;
      remaining?: string | null;
      whitelistEnabled?: boolean | null;
    }> | null;
  }>;
  messages: Messages;
  host?: Host;
};

const ink = "#142d21";
const forest = "#103d29";
const paper = "#f0f8ea";
const moss = "#4d6656";
const rule = "#bfd3bc";
const mint = "#c8f684";

const shell: CSSProperties = {
  color: ink, background: paper, border: "1px solid #779a78", borderRadius: 18,
  overflow: "hidden", fontFamily: '"DM Sans", "PingFang SC", system-ui, sans-serif',
  lineHeight: 1.5, colorScheme: "light", accentColor: forest,
};
const inset = "clamp(16px, 5vw, 34px)";
const heading: CSSProperties = {
  color: "#f3ffe8", padding: inset, background: forest, borderBlockStart: `5px solid ${mint}`,
  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap",
};
const body: CSSProperties = { padding: inset, display: "grid", gap: 24 };
const fields: CSSProperties = { display: "grid", gap: 14, minWidth: 0 };
const columns: CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 186px), 1fr))", gap: 14,
};
const input: CSSProperties = {
  appearance: "none", boxSizing: "border-box", minWidth: 0, width: "100%", minHeight: 44,
  border: "1px solid #94ad97", borderRadius: 7, padding: "9px 11px", color: ink,
  background: "#fcfff8", font: "inherit", fontSize: 16, outlineOffset: 3,
};
const valueText: CSSProperties = {
  fontFamily: '"IBM Plex Mono", monospace', fontVariantNumeric: "tabular-nums",
  overflowWrap: "anywhere", margin: "3px 0 0",
};
const muted: CSSProperties = { margin: 0, color: moss, fontSize: 13 };
const notice: CSSProperties = { margin: 0, color: "#7b231d", fontSize: 13 };
const addressPattern = /^0x(?!0{40}$)[a-f0-9]{40}$/i;
const hashPattern = /^0x[a-f0-9]{64}$/i;
const unsigned = /^(0|[1-9][0-9]{0,77})$/;
const baseUnit = 10n ** 18n;
const basisPoints = 10_000n;
const protocolFeeBps = 300n;
const minContribution = 10n ** 15n;
const minSaleSeconds = 3600;
const maxSaleSeconds = 10 * 86400;
const demoFactory = "0x73db8da6f72f6300c584c506edb652fb903b975c";
const zeroAddress = "0x0000000000000000000000000000000000000000";
const factoryParameters: readonly AbiParameter[] = [
  { name: "rail", type: "uint8" },
  { name: "params", type: "tuple", components: [
    { name: "name", type: "string" },
    { name: "symbol", type: "string" },
    { name: "meta", type: "string" },
    { name: "totalSupply", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "buyTaxRate", type: "uint16" },
    { name: "sellTaxRate", type: "uint16" },
    { name: "taxDuration", type: "uint32" },
    { name: "antiFarmerDuration", type: "uint32" },
    // The deployed tuple layout is stable. Positions carry the verified fee defaults below.
    { name: "fees", type: "tuple", components: [
      { name: "a", type: "uint16" }, { name: "b", type: "uint16" },
      { name: "c", type: "uint16" }, { name: "d", type: "uint16" },
      { name: "e", type: "address" }, { name: "f", type: "address" },
      { name: "g", type: "uint256" }, { name: "h", type: "address" }, { name: "i", type: "bytes" },
    ] },
    { name: "tail", type: "uint8" },
  ] },
  { name: "cap", type: "uint256" },
  { name: "startAt", type: "uint256" },
  { name: "endAt", type: "uint256" },
  { name: "gate", type: "tuple", components: [
    { name: "perTxBps", type: "uint16" },
    { name: "walletBps", type: "uint16" },
    { name: "whitelistEnabled", type: "bool" },
  ] },
];

function buttonStyle(disabled = false, secondary = false): CSSProperties {
  return {
    minHeight: 44, borderRadius: 8, padding: "8px 16px",
    border: secondary ? `1px solid ${rule}` : 0,
    background: secondary ? "transparent" : forest, color: secondary ? ink : "#f3ffe8",
    font: "inherit", fontSize: 14, fontWeight: 700,
    opacity: disabled ? 0.5 : 1, cursor: disabled ? "default" : "pointer",
  };
}

function supportsIdentity(identity: Identity) {
  return identity.chainId === 97 && identity.factoryAddress.toLowerCase() === demoFactory;
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && hashPattern.test(value);
}

function reportedStatus(receipt: Submission | null, m: Messages) {
  if (!receipt) return null;
  const statuses = { success: m.success, pending: m.pending, reverted: m.reverted, unverified: m.unverified };
  return (
    <div role="status" style={{ ...muted, display: "grid", gap: 4 }}>
      <span>{statuses[receipt.status]}</span>
      {isHash(receipt.hash) && <span style={valueText}>{receipt.hash}</span>}
    </div>
  );
}

function recoveryNeeded(receipt: Submission | null) {
  return receipt?.status === "pending" || receipt?.status === "unverified";
}

function visibleReceipt(receipt: Submission | null, pendingHash: string | null | undefined) {
  if (isHash(pendingHash) && receipt?.hash !== pendingHash) return { status: "pending", hash: pendingHash } as const;
  return receipt;
}

function localizedError(cause: unknown, m: Messages, fallback: string) {
  if (!(cause instanceof Error)) return fallback;
  const errors: Record<string, string> = {
    walletUnavailable: m.walletUnavailable, connectWallet: m.connectWallet, wrongChain: m.switchChain,
    walletRejected: m.walletRejected, walletBusy: m.walletBusy, simulationFailed: m.simulationFailed,
    creationFeeChanged: m.feeChanged, factoryUnavailable: m.factoryUnavailable,
    invalidTransaction: m.submitError, saltUnavailable: m.saltUnavailable, receiptUnavailable: m.receiptError,
  };
  return Object.hasOwn(errors, cause.message) ? errors[cause.message] : fallback;
}

function Header({ title, intro, network }: { title: string; intro: string; network: string }) {
  return (
    <header style={heading}>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: "clamp(25px, 5vw, 42px)", lineHeight: 1.12, letterSpacing: "-0.035em" }}>{title}</h2>
        <p style={{ margin: "9px 0 0", fontSize: 14, color: "#c5e1c4" }}>{intro}</p>
      </div>
      <span style={{ padding: "4px 10px", border: "1px solid #81b183", borderRadius: 20, fontSize: 12, whiteSpace: "nowrap" }}>
        {network}
      </span>
    </header>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5, minWidth: 0, alignContent: "start" }}>
      <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
      {children}
      {hint && <span style={muted}>{hint}</span>}
    </label>
  );
}

function Divider({ children }: { children: ReactNode }) {
  return <h3 style={{ margin: 0, paddingBlockStart: 13, borderBlockStart: `1px solid ${rule}`, fontSize: 16 }}>{children}</h3>;
}

function asUnits(value: string | null | undefined) {
  return typeof value === "string" && unsigned.test(value) ? BigInt(value) : null;
}

function decimalAmount(value: bigint) {
  const fraction = (value % baseUnit).toString().padStart(18, "0").replace(/0+$/, "");
  return `${value / baseUnit}${fraction ? "." + fraction : ""}`;
}

function nativeAmount(value: bigint | null, fallback: string) {
  return value === null ? fallback : `${decimalAmount(value)} tBNB`;
}

function contributionAmount(text: string) {
  const match = /^(0|[1-9][0-9]{0,6})(?:\.([0-9]{1,18}))?$/.exec(text.trim());
  return match ? BigInt(match[1]) * baseUnit + BigInt((match[2] ?? "").padEnd(18, "0")) : null;
}

function readableTime(value: string | null | undefined, fallback: string, locale: string) {
  const seconds = asUnits(value);
  return seconds !== null && seconds > 0n && seconds <= 253402300799n
    ? Intl.DateTimeFormat(locale, {
        timeZone: "UTC", year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(Number(seconds) * 1000) + " UTC"
    : fallback;
}

function Datum({ label, children }: { label: string; children: ReactNode }) {
  return <div style={{ minWidth: 0 }}><dt style={muted}>{label}</dt><dd style={valueText}>{children}</dd></div>;
}

const initialForm = {
  name: "", symbol: "", cap: "6", startAt: "", endAt: "",
  buyTax: "1", sellTax: "1",
};
type Form = typeof initialForm;

function timestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const milliseconds = Date.parse(value + ":00Z");
  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds / 1000 : null;
}

function percentBps(value: string) {
  if (!/^(?:\d(?:\.\d{1,2})?|10(?:\.0{1,2})?)$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return String(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
}

function validSaleWindow(start: number, end: number) {
  const duration = end - start;
  return duration >= minSaleSeconds && duration <= maxSaleSeconds;
}

function reviewConfiguration(form: Form) {
  const name = form.name.trim(), symbol = form.symbol.trim();
  const cap = /^\d{1,3}$/.test(form.cap) ? BigInt(form.cap) : null;
  const startAt = timestamp(form.startAt), endAt = timestamp(form.endAt);
  const buyTaxRate = percentBps(form.buyTax), sellTaxRate = percentBps(form.sellTax);
  if (!name || !symbol || cap === null || cap < 6n || cap > 100n || startAt === null || startAt <= Date.now() / 1000
    || endAt === null || !validSaleWindow(startAt, endAt) || buyTaxRate === null || sellTaxRate === null
    || Math.max(Number(buyTaxRate), Number(sellTaxRate)) < 100) {
    return null;
  }
  return { name, symbol, cap: cap * baseUnit, startAt: String(startAt), endAt: String(endAt), buyTaxRate, sellTaxRate };
}

type CreationReview = { values: NonNullable<ReturnType<typeof reviewConfiguration>>; fee: string | null };

export function LauncherConfig({ context, messages: m, host }: ConfigProps) {
  const [form, setForm] = useState<Form>(initialForm);
  const [review, setReview] = useState<CreationReview | null>(null);
  const [prepared, setPrepared] = useState<{ configuration: string; account: string; valueWei: string } | null>(null);
  const [result, setResult] = useState<{ account: string; receipt: Submission } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const draft = reviewConfiguration(form);
  const { name, symbol, cap, startAt, endAt, buyTax, sellTax } = form;
  const account = host?.wallet?.account;
  const wrongChain = host?.wallet?.chainId !== context.identity.chainId;
  const canTransact = supportsIdentity(context.identity) && !!host?.wallet && !!host?.quote
    && !!host?.findSalt && !!host?.encode && !!host?.submit;
  const receipt = visibleReceipt(result?.account === account?.toLowerCase() ? result?.receipt ?? null : null, host?.wallet?.pendingHash);
  const waiting = recoveryNeeded(receipt);
  const created = receipt?.status === "success" && typeof receipt.launcherAddress === "string"
    && addressPattern.test(receipt.launcherAddress) ? receipt.launcherAddress : null;
  const finished = receipt?.status === "success";
  const sameWallet = !!account && prepared?.account === account.toLowerCase();

  const update = (key: keyof Form, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    setReview(null);
    setPrepared(null);
    setError(null);
  };
  const capInvalid = cap !== "" && (!/^\d{1,3}$/.test(cap) || Number(cap) < 6 || Number(cap) > 100);
  const startTime = timestamp(startAt);
  const endTime = timestamp(endAt);
  const factory = context.identity.factoryAddress;
  const pastStart = startTime !== null && startTime <= Date.now() / 1000;
  const invalidDates = startTime !== null && endTime !== null && !validSaleWindow(startTime, endTime);

  async function showReview() {
    const values = reviewConfiguration(form);
    if (!values || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const fee = canTransact ? await host?.quote?.() : null;
      if (canTransact && (fee == null || !unsigned.test(fee))) setError(m.feeUnavailable);
      setReview({ values, fee: fee != null && unsigned.test(fee) ? fee : null });
    } catch {
      setError(m.feeUnavailable);
      setReview({ values, fee: null });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function prepareCreation() {
    if (!canTransact || !review || !draft || lock.current || finished || waiting) return;
    if (!account) { host?.wallet?.connect(); return; }
    lock.current = true;
    setBusy(true);
    setError(null);
    setPrepared(null);
    try {
      if (wrongChain) { await host?.wallet?.switchChain(); return; }
      const fee = await host?.quote?.();
      if (fee == null || !unsigned.test(fee)) { setError(m.feeUnavailable); return; }
      if (fee !== review.fee) {
        setReview({ ...review, fee });
        setError(m.feeChanged);
        return;
      }
      const salt = await host?.findSalt?.();
      if (!isHash(salt)) { setError(m.prepareError); return; }
      const { values } = review;
      const configuration = host?.encode?.(factoryParameters, [
        2,
        {
          name: values.name, symbol: values.symbol, meta: "", totalSupply: 1_000_000_000n * baseUnit,
          salt, buyTaxRate: Number(values.buyTaxRate), sellTaxRate: Number(values.sellTaxRate),
          taxDuration: 0, antiFarmerDuration: 0,
          fees: { a: 0, b: 10_000, c: 0, d: 0, e: zeroAddress, f: zeroAddress, g: 0n, h: zeroAddress, i: "0x" },
          tail: 0,
        },
        values.cap, BigInt(values.startAt), BigInt(values.endAt),
        { perTxBps: 0, walletBps: 0, whitelistEnabled: false },
      ]);
      if (!configuration) { setError(m.prepareError); return; }
      setPrepared({ configuration, account: account.toLowerCase(), valueWei: fee });
    } catch (cause) {
      setError(localizedError(cause, m, m.prepareError));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function confirmCreation() {
    if (!canTransact || !prepared || !account || !sameWallet || wrongChain || lock.current || finished || waiting) return;
    if (!reviewConfiguration(form)) { setPrepared(null); setError(m.draftIncomplete); return; }
    lock.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const result = await host?.submit?.({
        kind: "create", configuration: prepared.configuration, valueWei: prepared.valueWei,
      });
      if (result) setResult({ account: account.toLowerCase(), receipt: result });
      setPrepared(null);
    } catch (cause) {
      setPrepared(null);
      setError(localizedError(cause, m, m.submitError));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function checkCreation() {
    if (!account || !receipt || !isHash(receipt.hash) || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await host?.checkReceipt?.(receipt.hash);
      if (result) setResult({ account: account.toLowerCase(), receipt: result });
    } catch (cause) {
      setError(localizedError(cause, m, m.receiptError));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section style={shell} aria-label={m.createTitle}>
      <Header title={m.createTitle} intro={m.createIntro} network={m.network} />
      <div style={{ ...body, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 268px), 1fr))", alignItems: "start" }}>
        <fieldset disabled={busy || waiting || finished} style={{ ...fields, border: 0, padding: 0, margin: 0 }}>
          <Divider>{m.tokenSection}</Divider>
          <div style={columns}>
            <Field label={m.name}><input name="name" value={name} maxLength={64} autoComplete="off" required style={input}
              onChange={event => update("name", event.target.value)} /></Field>
            <Field label={m.symbol}><input name="symbol" value={symbol} maxLength={16} autoComplete="off" required style={input}
              onChange={event => update("symbol", event.target.value)} /></Field>
          </div>

          <Divider>{m.saleSection}</Divider>
          <Field label={m.capInput} hint={m.capHint}><input name="cap" value={cap} type="text" inputMode="numeric" maxLength={3}
            required aria-invalid={capInvalid} style={input} onChange={event => update("cap", event.target.value)} /></Field>
          <div style={columns}>
            <Field label={m.start} hint={pastStart ? m.startFuture : undefined}><input name="startAt" value={startAt} type="datetime-local"
              required aria-invalid={pastStart} style={input} onInput={event => update("startAt", event.currentTarget.value)} /></Field>
            <Field label={m.end} hint={m.durationHint}><input name="endAt" value={endAt} type="datetime-local"
              required aria-invalid={invalidDates} style={input} onInput={event => update("endAt", event.currentTarget.value)} /></Field>
          </div>

          <details style={{ borderBlockStart: `1px solid ${rule}`, paddingBlockStart: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 700 }}>{m.taxSection}</summary>
            <div style={{ ...columns, marginBlockStart: 10 }}>
              <Field label={m.buyTax}><input name="buyTaxRate" value={buyTax} inputMode="decimal" maxLength={6} required
                aria-invalid={percentBps(buyTax) === null} style={input} onChange={event => update("buyTax", event.target.value)} /></Field>
              <Field label={m.sellTax}><input name="sellTaxRate" value={sellTax} inputMode="decimal" maxLength={6} required
                aria-invalid={percentBps(sellTax) === null} style={input} onChange={event => update("sellTax", event.target.value)} /></Field>
            </div>
            <p style={{ ...muted, marginBlockStart: 8 }}>{m.taxHint}</p>
          </details>
        </fieldset>

        <aside style={{ background: "#e0efd9", border: `1px solid ${rule}`, borderRadius: 12, padding: "clamp(15px, 3vw, 22px)", display: "grid", gap: 15 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{review ? m.reviewCreation : m.summary}</h3>
          <dl style={{ margin: 0, display: "grid", gap: 13 }}>
            <Datum label={m.token}>{review ? review.values.name + " (" + review.values.symbol + ")" : (
              <>{name.trim() || m.unknown}{symbol.trim() ? " (" + symbol.trim() + ")" : ""}</>
            )}</Datum>
            <Datum label={m.cap}>{review ? nativeAmount(review.values.cap, m.unknown) : cap && !capInvalid ? cap + " tBNB" : m.unknown}</Datum>
            <Datum label={m.access}>{m.openSale}</Datum>
            <Datum label={m.factory}><span title={factory}>{factory.slice(0, 8)}…{factory.slice(-6)}</span></Datum>
            {review && (
              <>
                <Datum label={m.start}>{readableTime(review.values.startAt, m.unknown, context.locale)}</Datum>
                <Datum label={m.end}>{readableTime(review.values.endAt, m.unknown, context.locale)}</Datum>
                <Datum label={m.buyTax}>{Number(review.values.buyTaxRate) / 100}%</Datum>
                <Datum label={m.sellTax}>{Number(review.values.sellTaxRate) / 100}%</Datum>
                {canTransact && <Datum label={m.creationFee}>{nativeAmount(asUnits(review.fee), m.unknown)}</Datum>}
                {sameWallet && <Datum label={m.walletAccount}>{account}</Datum>}
              </>
            )}
          </dl>
          <p role="status" style={{ margin: 0, paddingBlockStart: 12, borderBlockStart: `1px solid ${rule}`, fontSize: 13, fontWeight: 700 }}>
            {review ? canTransact ? (sameWallet ? m.confirmReady : m.prepareHelp) : m.reviewOnly
              : draft ? m.draftReady : m.draftIncomplete}
          </p>
          {error && <p role="alert" style={notice}>{error}</p>}
          {reportedStatus(receipt, m)}
          {created && (
            <>
              <dl style={{ margin: 0 }}><Datum label={m.launcher}>{created}</Datum></dl>
              {host?.openLauncher && <button type="button" style={buttonStyle()} onClick={() => host?.openLauncher?.(created)}>{m.openLauncher}</button>}
            </>
          )}
          {waiting && host?.checkReceipt && (
            <button type="button" disabled={busy} style={buttonStyle(busy)} onClick={() => void checkCreation()}>{m.checkReceipt}</button>
          )}
          {!waiting && !finished && (
            <div style={{ display: "grid", gap: 8 }}>
              {review && canTransact && (
                <button type="button" disabled={busy || !draft} style={buttonStyle(busy || !draft)}
                  onClick={sameWallet && !wrongChain ? () => void confirmCreation() : () => void prepareCreation()}>
                  {busy ? m.working : !account ? m.connectWallet : wrongChain ? m.switchChain
                    : sameWallet ? m.confirmCreation : m.prepareCreation}
                </button>
              )}
              <button type="button" disabled={busy || (!draft && !review)} style={buttonStyle(busy || (!draft && !review), !!review)}
                onClick={review ? () => { setReview(null); setPrepared(null); setError(null); } : () => void showReview()}>
                {review ? m.editConfiguration : busy ? m.working : m.reviewCreation}
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

export function Launcher({ context, messages: m, host }: DetailProps) {
  const [navigationFailed, setNavigationFailed] = useState(false);
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<{ action: Action; account: string; valueWei?: string } | null>(null);
  const [result, setResult] = useState<{ account: string; action?: Action; receipt: Submission } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const { launcherAddress, snapshot, identity } = context;
  const raised = asUnits(snapshot?.raised);
  const cap = asUnits(snapshot?.cap);
  const progressBps = raised !== null && cap !== null && cap > 0n ? raised * 10_000n / cap : null;
  const progress = progressBps === null ? null : Number(progressBps > 10_000n ? 10_000n : progressBps) / 100;
  const token = snapshot?.launchedToken;
  const reservedToken = snapshot?.predictedToken;
  const tokenIssued = snapshot?.launched === true;
  const start = asUnits(snapshot?.startAt), end = asUnits(snapshot?.endAt);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const closed = snapshot?.status === "2";
  const expired = snapshot?.status === "0" && end !== null && now > end;
  const live = snapshot?.status === "0" && start !== null && end !== null && now >= start && now < end;
  const status = tokenIssued ? m.issued : closed ? m.cancelled
    : expired ? m.ended : live ? m.saleOpen : snapshot?.launched === false ? m.notIssued : m.unknown;
  const canTransact = supportsIdentity(identity) && !!host?.wallet && !!host?.submit;
  const account = host?.wallet?.account?.toLowerCase();
  const wrongChain = host?.wallet?.chainId !== identity.chainId;
  const currentResult = result?.account === account ? result : null;
  const receipt = visibleReceipt(currentResult?.receipt ?? null, host?.wallet?.pendingHash);
  const waiting = recoveryNeeded(receipt);
  const paid = asUnits(snapshot?.paidGross);
  const shares = asUnits(snapshot?.shares);
  const remaining = asUnits(snapshot?.remaining);
  const inputWei = contributionAmount(amount);
  const fillGross = remaining === null ? null : remaining * basisPoints / (basisPoints - protocolFeeBps);
  const previewNet = inputWei === null ? null : inputWei - inputWei * protocolFeeBps / basisPoints;
  const openContribution = live && snapshot?.whitelistEnabled === false;
  const contributionReady = openContribution && inputWei !== null
    && fillGross !== null && inputWei >= minContribution && inputWei <= fillGross;
  const options: Record<Action, { enabled: boolean; label: string }> = {
    contribute: { enabled: contributionReady, label: m.contribute },
    claim: { enabled: tokenIssued && shares !== null && shares > 0n && snapshot?.claimed === "0", label: m.claim },
    refund: { enabled: closed && paid !== null && paid > 0n && snapshot?.refunded === "0", label: m.refund },
    cancel: { enabled: expired && remaining !== null && remaining > 0n, label: m.closePresale },
  };

  function actionReady(action: Action) {
    return options[action].enabled && !(receipt?.status === "success" && currentResult?.action === action && action !== "contribute");
  }

  function editContribution(value: string) {
    setAmount(value);
    setReview(null);
    setError(null);
  }

  async function switchWalletChain() {
    if (!wrongChain || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try { await host?.wallet?.switchChain(); }
    catch (cause) { setError(localizedError(cause, m, m.walletUnavailable)); }
    finally { lock.current = false; setBusy(false); }
  }

  function startAction(action: Action) {
    if (!canTransact || !account || wrongChain || !actionReady(action) || waiting || lock.current) return;
    setError(null);
    setReview({ action, account, ...(action === "contribute" ? { valueWei: inputWei?.toString() } : {}) });
  }

  function updateReceipt(result: Submission, current: { account: string; action?: Action }) {
    setResult({ ...current, receipt: result });
    if (result.status === "success") {
      if (current.action === "contribute") setAmount("");
      host?.refresh?.();
    }
  }

  async function confirmAction() {
    if (!review || !canTransact || !actionReady(review.action) || waiting || lock.current
      || wrongChain || account !== review.account
      || (review.action === "contribute" && review.valueWei !== inputWei?.toString())) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { action, valueWei } = review;
      const result = await host?.submit?.({ kind: "action", action, ...(valueWei === undefined ? {} : { valueWei }) });
      if (result) updateReceipt(result, { account: review.account, action });
    } catch (cause) {
      setError(localizedError(cause, m, m.submitError));
    } finally {
      setReview(null);
      lock.current = false;
      setBusy(false);
    }
  }

  async function checkAction() {
    if (!account || !receipt || !isHash(receipt.hash) || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await host?.checkReceipt?.(receipt.hash);
      if (result) updateReceipt(result, { account, action: currentResult?.action });
    } catch (cause) {
      setError(localizedError(cause, m, m.receiptError));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const reviewStale = !!review && (!actionReady(review.action) || review.account !== account || wrongChain);

  return (
    <section style={shell} aria-label={m.detailTitle}>
      <Header title={m.detailTitle} intro={m.detailIntro} network={m.network} />
      <div style={body}>
        {launcherAddress ? (
          <>
            <div style={{ border: `1px solid ${rule}`, borderRadius: 13, padding: "clamp(15px, 4vw, 25px)", background: "#e2f0da", display: "grid", gap: 14 }}>
              <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "start", flexWrap: "wrap" }}>
                <div>
                  <p style={muted}>{m.raised}</p>
                  <p style={{ ...valueText, fontSize: "clamp(24px, 6vw, 42px)", lineHeight: 1.15, fontWeight: 750 }}>{nativeAmount(raised, m.unknown)}</p>
                </div>
                <span style={{ borderRadius: 16, padding: "4px 11px", background: tokenIssued ? forest : "#c9ddc3",
                  color: tokenIssued ? "#f3ffe8" : ink, fontSize: 13, fontWeight: 700 }}>{status}</span>
              </div>
              {progress !== null && (
                <div style={{ display: "grid", gap: 6 }}>
                  <div role="progressbar" aria-label={m.progress} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}
                    style={{ height: 9, background: "#c4dbbd", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ background: forest, width: progress + "%", height: "100%" }} />
                  </div>
                  <p style={muted}>{progress + "%"} · {m.cap} {nativeAmount(cap, m.unknown)}</p>
                </div>
              )}
              {!snapshot && <p role="status" style={muted}>{m.noData}</p>}
            </div>

            <dl style={{ ...columns, margin: 0 }}>
              <Datum label={m.start}>{readableTime(snapshot?.startAt, m.unknown, context.locale)}</Datum>
              <Datum label={m.end}>{readableTime(snapshot?.endAt, m.unknown, context.locale)}</Datum>
              {tokenIssued && token && addressPattern.test(token) && <Datum label={m.issuedToken}>{token}</Datum>}
              {snapshot?.launched === false && reservedToken && addressPattern.test(reservedToken) && <Datum label={m.reservedToken}>{reservedToken}</Datum>}
            </dl>
            {canTransact && (
              <section style={{ display: "grid", gap: 12, borderBlockStart: `1px solid ${rule}`, paddingBlockStart: 16 }} aria-label={m.participation}>
                <h3 style={{ margin: 0, fontSize: 17 }}>{m.participation}</h3>
                {account && (
                  <dl style={{ ...columns, margin: 0 }}>
                    <Datum label={m.walletAccount}>{account}</Datum>
                    <Datum label={m.myContribution}>{nativeAmount(paid, m.unknown)}</Datum>
                  </dl>
                )}
                {live && snapshot?.whitelistEnabled === true && <p style={muted}>{m.whitelistNotice}</p>}
                {openContribution && (
                  <>
                    <div style={{ ...columns, alignItems: "end" }}>
                      <Field label={m.contributionAmount}>
                        <input name="contribution" value={amount} inputMode="decimal" maxLength={26}
                          disabled={busy || waiting} style={input} onChange={event => editContribution(event.target.value)} />
                      </Field>
                      {fillGross !== null && fillGross >= minContribution && (
                        <button type="button" disabled={busy || waiting} style={buttonStyle(busy || waiting, true)}
                          onClick={() => editContribution(decimalAmount(fillGross))}>{m.fillRemaining}</button>
                      )}
                    </div>
                    <p style={muted}>{m.contributionHelp}</p>
                    {amount && previewNet !== null && <p style={muted}>{m.estimatedNet} {nativeAmount(previewNet, m.unknown)}</p>}
                  </>
                )}
                {review && (
                  <div style={{ border: `1px solid ${rule}`, borderRadius: 8, padding: 12, display: "grid", gap: 10 }}>
                    <h4 style={{ margin: 0 }}>{options[review.action].label}</h4>
                    <p style={muted}>{reviewStale ? m.reviewChanged : m.confirmReady}</p>
                    {review.action === "cancel" && <p style={muted}>{m.closeHelp}</p>}
                    {review.valueWei && <p style={valueText}>{nativeAmount(asUnits(review.valueWei), m.unknown)}</p>}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" disabled={busy || reviewStale} style={buttonStyle(busy || reviewStale)} onClick={() => void confirmAction()}>
                        {busy ? m.working : m.confirmTransaction}
                      </button>
                      <button type="button" disabled={busy} style={buttonStyle(busy, true)} onClick={() => setReview(null)}>{m.back}</button>
                    </div>
                  </div>
                )}
                {!review && !waiting && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!account ? (
                      <button type="button" style={buttonStyle()} onClick={() => host?.wallet?.connect()}>{m.connectWallet}</button>
                    ) : wrongChain ? (
                      <button type="button" disabled={busy} style={buttonStyle(busy)} onClick={() => void switchWalletChain()}>{m.switchChain}</button>
                    ) : (
                      (["contribute", "claim", "cancel", "refund"] as const).filter(action => action === "contribute"
                        ? openContribution : actionReady(action)).map(action => (
                        <button key={action} type="button" disabled={busy || !actionReady(action)}
                          style={buttonStyle(busy || !actionReady(action))} onClick={() => startAction(action)}>
                          {busy ? m.working : options[action].label}
                        </button>
                      ))
                    )}
                  </div>
                )}
                {error && <p role="alert" style={notice}>{error}</p>}
                {reportedStatus(receipt, m)}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {waiting && host?.checkReceipt && <button type="button" disabled={busy} style={buttonStyle(busy)}
                    onClick={() => void checkAction()}>{m.checkReceipt}</button>}
                  {host?.refresh && <button type="button" disabled={busy} style={buttonStyle(busy, true)}
                    onClick={() => host?.refresh?.()}>{m.refresh}</button>}
                </div>
              </section>
            )}
            {tokenIssued && token && addressPattern.test(token) && host?.redirect && (
              <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
                <button type="button" onClick={() => setNavigationFailed(host?.redirect?.("/bnb-testnet/" + token.toLowerCase()) !== true)}
                  style={{ minHeight: 44, borderRadius: 8, padding: "8px 16px", border: 0, background: forest, color: "#f3ffe8",
                    cursor: "pointer", fontSize: 14, fontWeight: 700 }}>{m.openToken}</button>
                {navigationFailed && <p role="status" style={muted}>{m.openTokenFailed}</p>}
              </div>
            )}
          </>
        ) : <p role="status" style={muted}>{m.noInstance}</p>}
        <details style={{ borderBlockStart: `1px solid ${rule}`, paddingBlockStart: 12 }}>
          <summary style={{ fontWeight: 700, cursor: "pointer" }}>{m.contracts}</summary>
          <dl style={{ margin: "12px 0 0", display: "grid", gap: 12 }}>
            <Datum label={m.factory}>{identity.factoryAddress}</Datum>
            {launcherAddress && <Datum label={m.launcher}>{launcherAddress}</Datum>}
            {snapshot?.creator && <Datum label={m.creator}>{snapshot.creator}</Datum>}
          </dl>
        </details>
      </div>
    </section>
  );
}
