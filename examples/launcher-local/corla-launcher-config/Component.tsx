import React, { useEffect, useMemo, useRef, useState } from "react";

// Self-contained developer source: only the receiving host may validate policies or prepare a write.
type Values = {
  name: string;
  symbol: string;
  totalLots: string;
  pricePerLotWei: string;
  metadataCid: string;
};
type Constraints = {
  /** Token amounts use 18-decimal base units. Bps and durations are integers. */
  totalSupply: string;
  quoteSymbol: string;
  totalLotsOptions: readonly string[];
  vaultFactory: string;
  buyTaxBps: number;
  sellTaxBps: number;
  taxDurationSeconds: number;
  dividendBps: number;
  liquidityBps: number;
  minimumShareBalance: string;
};
type Context = {
  mode: "mainnet";
  identity: { market: "pool-launch"; factoryKind: "launcher"; chainId: number; factoryAddress: string };
  configContract: { id: "corla-native-create"; version: 1 };
  initialValues: Values;
  constraints: Constraints;
};
type Messages = Record<string, string>;
type Result = { status: "invalid"; errors?: string[] } | { status: "valid"; values: Values; summary?: { label: string; value: string }[] };
type Resources = Readonly<{
  available: boolean;
  uploadTokenMetadata(input: { name: string; symbol: string; description: string; image: File }): Promise<{ cid: string }>;
}>;
type ConfigProps = { context: Context; messages: Messages; resources?: Resources; onChange(result: Result): void };
type LauncherProps = {
  context?: {
    identity: { chainId: number; factoryAddress: string };
    launcherAddress: string;
    snapshot: { expectedToken: string };
  };
  messages: Messages;
  host?: { redirect?: (path: string) => boolean };
};

const panel: React.CSSProperties = { display: "grid", gap: 24, minWidth: 0, color: "#FFFFFF", fontFamily: "inherit", lineHeight: 1.5 };
const card: React.CSSProperties = { display: "grid", gap: 20, minWidth: 0, margin: 0, padding: 20, border: "1px solid #34383C", borderRadius: 12, background: "#111415" };
const heading: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, margin: 0, fontSize: 18, fontWeight: 600 };
const badge: React.CSSProperties = { padding: "3px 8px", border: "1px solid #454C27", borderRadius: 5, background: "#1B2110", color: "#D0FF00", fontSize: 12, fontWeight: 500 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 18, minWidth: 0 };
const fieldStyle: React.CSSProperties = { display: "grid", alignContent: "start", gap: 8, minWidth: 0, fontSize: 14 };
const inputStyle: React.CSSProperties = { width: "100%", minWidth: 0, height: 46, boxSizing: "border-box", padding: "10px 12px", border: "1px solid #4B5054", borderRadius: 7, background: "#080B0C", color: "#FFFFFF", font: "inherit", colorScheme: "dark" };
const hintStyle: React.CSSProperties = { margin: 0, color: "#A1A7AA", fontSize: 12, lineHeight: 1.6 };
const errorStyle: React.CSSProperties = { margin: 0, color: "#F4B1A8", fontSize: 12 };
const facts: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 16, margin: 0, minWidth: 0 };

function tokenAmount(value: string) {
  if (!/^[0-9]{1,78}$/.test(value)) return value;
  const padded = value.padStart(19, "0");
  const whole = padded.slice(0, -18).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = padded.slice(-18).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function priceInBnb(wei: string) {
  if (!/^(0|[1-9][0-9]{0,77})$/.test(wei)) return "";
  const padded = wei.padStart(19, "0");
  const fraction = padded.slice(-18).replace(/0+$/, "");
  return fraction ? `${padded.slice(0, -18)}.${fraction}` : padded.slice(0, -18);
}

function priceInWei(bnb: string) {
  const match = /^(0|[1-9][0-9]{0,77})(?:\.([0-9]{0,18}))?$/.exec(bnb);
  if (!match) return "";
  const wei = `${match[1]}${(match[2] ?? "").padEnd(18, "0")}`.replace(/^0+/, "") || "0";
  return wei.length <= 78 ? wei : "";
}

export function LauncherConfig({ context, messages, resources, onChange }: ConfigProps) {
  const [values, setValues] = useState<Values>(() => ({
    name: context.initialValues?.name ?? "",
    symbol: context.initialValues?.symbol ?? "",
    totalLots: context.initialValues?.totalLots ?? "3",
    pricePerLotWei: context.initialValues?.pricePerLotWei ?? "10000000000000000",
    metadataCid: "",
  }));
  const [displayPrice, setDisplayPrice] = useState(() => priceInBnb(context.initialValues?.pricePerLotWei ?? "10000000000000000"));
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const alive = useRef(true);
  const revision = useRef(0);
  const uploadGuard = useRef(false);
  const currentResources = useRef(resources); currentResources.current = resources;
  const scope = `${context.mode}:${context.identity?.chainId}:${context.identity?.factoryAddress}:${context.configContract?.id}:${context.configContract?.version}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  useEffect(() => { alive.current = true; return () => { alive.current = false; revision.current++; }; }, []);
  const constraints = context.constraints;
  const compatible = context.mode === "mainnet" && context.configContract?.id === "corla-native-create"
    && context.configContract.version === 1 && Boolean(constraints)
    && context.identity?.chainId === 56
    && context.identity.factoryAddress.toLowerCase() === "0xfba753f8b890eb35caa000c427f99ed5903ea517"
    && Array.isArray(constraints.totalLotsOptions) && constraints.totalLotsOptions.length === 2
    && constraints.totalLotsOptions.includes("3") && constraints.totalLotsOptions.includes("5");
  const imageValid = image instanceof File && image.size > 0 && image.size <= 3 * 1024 * 1024
    && ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(image.type);
  const metadataReady = Boolean(values.name.trim()) && values.name.length <= 64
    && /^[A-Za-z][A-Za-z0-9]{0,11}$/.test(values.symbol) && description.length <= 160 && imageValid;
  const uploadAvailable = resources?.available === true && typeof resources.uploadTokenMetadata === "function";
  const result = useMemo(() => {
    const errors: Partial<Record<keyof Values | "description" | "image", string>> = {};
    if (!values.name.trim() || values.name.length > 64) errors.name = messages["errors.name"];
    if (!/^[A-Za-z][A-Za-z0-9]{0,11}$/.test(values.symbol)) errors.symbol = messages["errors.symbol"];
    if (description.length > 160) errors.description = messages["errors.description"];
    if (!imageValid) errors.image = messages["errors.image"];
    if (!["3", "5"].includes(values.totalLots)) errors.totalLots = messages["errors.totalLots"];
    if (!/^[1-9][0-9]{0,77}$/.test(values.pricePerLotWei)
      || BigInt(values.pricePerLotWei) > ((1n << 256n) - 1n) / 5n) errors.pricePerLotWei = messages["errors.pricePerLotWei"];
    if (!/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(values.metadataCid)
      && !/^b[a-z2-7]{50,119}$/.test(values.metadataCid)) errors.metadataCid = messages["metadata.empty"];
    const errorMessages = Object.values(errors) as string[];
    const output: Result = !compatible ? { status: "invalid", errors: [messages["errors.context"]] }
      : !uploadAvailable ? { status: "invalid", errors: [messages["upload.unavailable"]] }
        : errorMessages.length || uploading ? { status: "invalid", errors: errorMessages }
          : { status: "valid", values: { name: values.name.trim(), symbol: values.symbol, totalLots: values.totalLots, pricePerLotWei: values.pricePerLotWei, metadataCid: values.metadataCid } };
    return { errors, output };
  }, [values, messages, compatible, description, imageValid, uploadAvailable, uploading]);
  useEffect(() => { onChange(result.output); }, [result, onChange]);
  const invalidateMetadata = () => {
    revision.current++;
    setValues((previous) => ({ ...previous, metadataCid: "" }));
    setUploadError(null);
    // Revoke an earlier platform review before a new asynchronous upload starts.
    onChange({ status: "invalid" });
  };
  const upload = async () => {
    if (!alive.current || currentScope.current !== scope || !compatible || !uploadAvailable || !metadataReady || !image || !resources || uploadGuard.current
      || currentResources.current?.available !== true || currentResources.current.uploadTokenMetadata !== resources.uploadTokenMetadata) return;
    uploadGuard.current = true;
    const uploadVersion = ++revision.current;
    const uploader = resources.uploadTokenMetadata;
    const requestScope = scope;
    const input = { name: values.name.trim(), symbol: values.symbol, description, image };
    const current = () => alive.current && revision.current === uploadVersion && currentScope.current === requestScope
      && currentResources.current?.available === true && currentResources.current.uploadTokenMetadata === uploader;
    setUploading(true); setUploadError(null);
    setValues((previous) => ({ ...previous, metadataCid: "" }));
    onChange({ status: "invalid" });
    try {
      const uploaded = await uploader(input);
      if (!current()) return;
      if (!uploaded || typeof uploaded.cid !== "string"
        || (!/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(uploaded.cid) && !/^b[a-z2-7]{50,119}$/.test(uploaded.cid))) {
        setUploadError(messages["upload.failed"]);
        return;
      }
      setValues((previous) => ({ ...previous, metadataCid: uploaded.cid }));
    } catch {
      if (current()) setUploadError(messages["upload.failed"]);
    } finally {
      uploadGuard.current = false;
      if (alive.current) setUploading(false);
    }
  };
  const field = (key: Exclude<keyof Values, "metadataCid">, hint: string) => <label key={key} style={fieldStyle}>
    <span>{messages[`fields.${key}`]}</span>
    {key === "totalLots" ? <select name={key} data-launcher-local-field={key} style={inputStyle} value={values[key]} disabled={!compatible}
      aria-invalid={Boolean(result.errors[key])}
      onChange={(event) => setValues((previous) => ({ ...previous, [key]: event.target.value }))}>
      {(compatible ? constraints.totalLotsOptions : ["3", "5"]).map((option) => <option key={option} value={option}>{option}</option>)}
    </select> : <input name={key} data-launcher-local-field={key} style={inputStyle} value={key === "pricePerLotWei" ? displayPrice : values[key]} disabled={!compatible}
      maxLength={key === "name" ? 64 : key === "symbol" ? 12 : 97}
      inputMode={key === "pricePerLotWei" ? "decimal" : "text"} autoComplete="off" spellCheck={false}
      aria-invalid={Boolean(result.errors[key])}
      onChange={(event) => {
        const next = event.target.value;
        if (key === "pricePerLotWei") {
          setDisplayPrice(next);
          setValues((previous) => ({ ...previous, pricePerLotWei: priceInWei(next) }));
        } else {
          invalidateMetadata();
          setValues((previous) => ({ ...previous, [key]: next }));
        }
      }} />}
    <span style={hintStyle}>{hint}</span>
    {result.errors[key] ? <span style={errorStyle}>{result.errors[key]}</span> : null}
  </label>;
  const fact = (label: string, value: string) => <div key={label} style={{ display: "grid", gap: 5, minWidth: 0 }}>
    <dt style={hintStyle}>{label}</dt><dd style={{ margin: 0, fontSize: 14, overflowWrap: "anywhere" }}>{value}</dd>
  </div>;
  return <section style={panel} data-launcher-local-surface="launcher-config" data-launcher-config-contract="corla-native-create/v1">
    <div style={card}>
      <h2 style={heading}>{messages["token.title"]}<span style={badge}>{messages["config.custom"]}</span></h2>
      <label style={fieldStyle}>
        <span>{messages["fields.image"]}</span>
        <input type="file" name="image" data-launcher-local-field="image" accept="image/png,image/jpeg,image/gif,image/webp"
          disabled={!compatible} style={{ ...inputStyle, height: "auto" }} aria-invalid={Boolean(image && !imageValid)}
          onChange={(event) => { invalidateMetadata(); setImage(event.currentTarget.files?.[0] ?? null); }} />
        <span style={hintStyle}>{image?.name ?? messages["hints.image"]}</span>
        {image && !imageValid ? <span style={errorStyle}>{result.errors.image}</span> : null}
      </label>
      <div style={grid}>{field("name", messages["hints.name"])}{field("symbol", messages["hints.symbol"])}</div>
      <label style={fieldStyle}>
        <span>{messages["fields.description"]}</span>
        <textarea name="description" data-launcher-local-field="description" value={description} maxLength={160}
          disabled={!compatible} style={{ ...inputStyle, height: 90, resize: "vertical" }} aria-invalid={Boolean(result.errors.description)}
          onChange={(event) => { invalidateMetadata(); setDescription(event.target.value); }} />
        <span style={hintStyle}>{messages["hints.description"]}</span>
        {result.errors.description ? <span style={errorStyle}>{result.errors.description}</span> : null}
      </label>
      <div style={{ display: "grid", gap: 10 }}>
        <button type="button" data-launcher-local-action="upload-metadata" disabled={!compatible || !uploadAvailable || !metadataReady || uploading}
          style={{ ...inputStyle, width: "fit-content", minWidth: 180, padding: "10px 16px", color: "#070808", background: "#D0FF00", borderColor: "#D0FF00", fontWeight: 600, opacity: !compatible || !uploadAvailable || !metadataReady || uploading ? 0.45 : 1 }}
          onClick={() => void upload()}>{messages[uploading ? "upload.uploading" : "upload.action"]}</button>
        <p style={hintStyle}>{messages["upload.hint"]}</p>
        {!uploadAvailable ? <p role="status" style={errorStyle}>{messages["upload.unavailable"]}</p> : null}
        {uploadError ? <p role="alert" style={errorStyle}>{uploadError}</p> : null}
        <div role="status" data-launcher-local-metadata-status={values.metadataCid ? "uploaded" : uploading ? "uploading" : "empty"}
          style={{ display: "grid", gap: 5, fontSize: 12, overflowWrap: "anywhere" }}>
          <span style={hintStyle}>{messages["metadata.label"]}</span>
          <span>{values.metadataCid ? messages["metadata.uploaded"] : messages["metadata.empty"]}</span>
          {values.metadataCid ? <span>{values.metadataCid}</span> : null}
        </div>
      </div>
      <dl style={facts}>{fact(messages["fixed.totalSupply"], compatible ? tokenAmount(constraints.totalSupply) : "—")}</dl>
    </div>
    <div style={card}>
      <h2 style={heading}>{messages["mint.title"]}<span style={badge}>{messages["fixed.public"]}</span></h2>
      <div style={grid}>{field("totalLots", messages["hints.totalLots"])}{field("pricePerLotWei", messages["hints.pricePerLotWei"])}</div>
      <dl style={facts}>{fact(messages["fixed.quote"], compatible ? constraints.quoteSymbol : "—")}{fact(messages["fixed.walletLimit"], values.totalLots)}</dl>
    </div>
    <div style={card}>
      <h2 style={heading}>{messages["vault.title"]}<span style={badge}>{messages["fixed.readOnly"]}</span></h2>
      <dl style={facts}>
        {fact(messages["fixed.buyTax"], compatible ? `${constraints.buyTaxBps / 100}%` : "—")}
        {fact(messages["fixed.sellTax"], compatible ? `${constraints.sellTaxBps / 100}%` : "—")}
        {fact(messages["fixed.duration"], compatible ? `${constraints.taxDurationSeconds / 86400} ${messages["units.days"]}` : "—")}
        {fact(messages["fixed.dividend"], compatible ? `${constraints.dividendBps / 100}%` : "—")}
        {fact(messages["fixed.liquidity"], compatible ? `${constraints.liquidityBps / 100}%` : "—")}
        {fact(messages["fixed.minimumShare"], compatible ? tokenAmount(constraints.minimumShareBalance) : "—")}
      </dl>
      <div style={{ display: "grid", gap: 5 }}><span style={hintStyle}>{messages["fixed.vaultFactory"]}</span>
        <span style={{ fontSize: 12, overflowWrap: "anywhere" }}>{compatible ? constraints.vaultFactory : "—"}</span></div>
      <p style={hintStyle}>{messages["fixed.hint"]}</p>
    </div>
    <p role="status" style={{ margin: 0, color: result.output.status === "valid" ? "#D0FF00" : "#D3B977", fontSize: 13 }}>
      {messages[!compatible ? "errors.context" : result.output.status === "valid" ? "config.valid" : "config.incomplete"]}
    </p>
  </section>;
}

export function Launcher({ context, messages, host }: LauncherProps) {
  const factory = context?.identity?.factoryAddress?.toLowerCase();
  const launcher = context?.launcherAddress?.toLowerCase();
  const expectedToken = context?.snapshot?.expectedToken?.toLowerCase();
  const addressPattern = /^0x(?!0{40}$)[a-f0-9]{40}$/;
  const destination = context?.identity?.chainId === 56
    && factory === "0xfba753f8b890eb35caa000c427f99ed5903ea517"
    && launcher && addressPattern.test(launcher)
    && expectedToken && addressPattern.test(expectedToken)
    ? `/apps/corla/mint/${expectedToken}?mint=${launcher}&factory=${factory}`
    : null;
  const redirect = host?.redirect;
  const attempted = useRef<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);

  useEffect(() => {
    if (!destination || !redirect || attempted.current === destination) return;
    attempted.current = destination;
    if (!redirect(destination)) setRejected(destination);
  }, [destination, redirect]);

  if (!context) {
    return <section style={card} data-launcher-local-surface="launcher-ui">
      <h2 style={heading}>{messages["runtime.title"]}<span style={badge}>{messages["fixed.readOnly"]}</span></h2>
      <p style={hintStyle}>{messages["runtime.placeholder"]}</p>
    </section>;
  }

  const status = !destination ? "runtime.projectUnavailable"
    : !redirect ? "runtime.redirectUnavailable"
    : rejected === destination ? "runtime.redirectRejected" : "runtime.opening";

  return <section style={card} data-launcher-local-surface="launcher-ui">
    <h2 style={heading}>{messages["runtime.project"]}</h2>
    <p role="status" style={hintStyle}>{messages[status]}</p>
    {destination ? <dl style={facts}>
      <div style={{ minWidth: 0 }}>
        <dt style={hintStyle}>{messages["runtime.launcherAddress"]}</dt>
        <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{launcher}</dd>
      </div>
      <div style={{ minWidth: 0 }}>
        <dt style={hintStyle}>{messages["runtime.expectedToken"]}</dt>
        <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{expectedToken}</dd>
      </div>
    </dl> : null}
  </section>;
}
