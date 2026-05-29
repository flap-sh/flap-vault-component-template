"use client";

import type React from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, FileText, FolderCode, Terminal, Zap } from "lucide-react";
import { useLang } from "@/src/i18n/useLang";
import type { VaultManifest } from "@/src/sdk";
import { createLocalOracleReader, VaultRuntimeProvider } from "@/src/sdk";
import { FlapNavbar } from "@/src/shell/FlapNavbar";
import exampleManifest from "@/src/vaults/example/manifest.json";
import exampleI18n from "@/src/vaults/example/i18n.json";

const homeManifest = exampleManifest as VaultManifest;
const homeI18n = exampleI18n as Record<string, Record<string, string>>;
const entryIcons = [FileText, FolderCode, Terminal];

/* ── design tokens ─────────────────────────────────────────── */
const BG       = "#05070b";
const BG2      = "#0a0d14";
const PANEL    = "#0c1018";
const PANEL2   = "#11161f";
const PANEL3   = "#161c27";
const BORDER   = "#1d2433";
const BORDSTR  = "#2a3447";
const TEXT     = "#e6e9ef";
const TEXT2    = "#aeb6c4";
const TEXT3    = "#6b7589";
const ACCENT   = "#4d8dff";
const ACCENT2  = "#6aa9ff";
const ACCSOFT  = "rgba(77,141,255,0.12)";
const ACCLINE  = "rgba(77,141,255,0.35)";
const OK       = "#36d399";
const MONO     = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const backdropStyle: CSSProperties = {
  background:
    "radial-gradient(1300px 900px at 10% 6%, rgba(139,92,246,0.28), transparent 68%), radial-gradient(1000px 760px at 92% 88%, rgba(215,248,74,0.09), transparent 70%), radial-gradient(1700px 1100px at 50% 112%, rgba(91,33,182,0.24), transparent 78%)",
};
const gridStyle: CSSProperties = {
  background:
    "linear-gradient(transparent 0,transparent 21px,rgba(255,255,255,0.04) 21px,rgba(255,255,255,0.04) 22px),linear-gradient(90deg,transparent 0,transparent 21px,rgba(255,255,255,0.04) 21px,rgba(255,255,255,0.04) 22px)",
  backgroundSize: "22px 22px",
  maskImage: "radial-gradient(ellipse 95% 72% at 50% 42%, black 62%, transparent 100%)",
  WebkitMaskImage: "radial-gradient(ellipse 95% 72% at 50% 42%, black 62%, transparent 100%)",
};

export default function HomePage() {
  const { lang, languageCode } = useLang();
  const sop = lang.home.sop;
  const quickStart = sop.quickStart;
  const developerEntry = sop.developerEntry;
  const agentGuide = sop.agentGuide;

  return (
    <VaultRuntimeProvider
      manifest={homeManifest}
      i18n={homeI18n}
      locale={languageCode}
      oracleReader={createLocalOracleReader()}
    >
      <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", background: BG, color: TEXT, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14, lineHeight: 1.6, WebkitFontSmoothing: "antialiased" }}>
        {/* purple radial gradient backdrop */}
        <div aria-hidden="true" style={{ pointerEvents: "none", position: "absolute", inset: 0, zIndex: 0, ...backdropStyle }} />
        {/* subtle grid overlay */}
        <div aria-hidden="true" style={{ pointerEvents: "none", position: "absolute", inset: 0, zIndex: 0, opacity: 0.55, ...gridStyle }} />

        <div style={{ position: "relative", zIndex: 1 }}>
        <FlapNavbar manifest={homeManifest} />

        <main style={{ padding: "56px 0 120px" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 32px" }}>

            {/* ── HERO: 2-col grid ─────────────────────────────────── */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 40, alignItems: "start" }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT, margin: "0 0 14px" }}>
                  {quickStart.kicker}
                </p>
                <h1 style={{ fontSize: "clamp(32px,3.6vw,42px)", fontWeight: 760, lineHeight: 1.04, letterSpacing: "-0.025em", margin: "0 0 18px", color: TEXT }}>
                  把一段 prompt 交给你的 Agent，它就能生成受控的 Vault UI。
                </h1>
                <p style={{ fontSize: 17, lineHeight: 1.65, color: TEXT2, maxWidth: "56ch" }}>
                  {quickStart.description}
                </p>
              </div>
              <div style={{ background: PANEL2, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 32 }}>
                <p style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: TEXT3, margin: "0 0 6px" }}>
                  {quickStart.promptLabel}
                </p>
                <pre style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.7, color: "#c5d2e6", background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                  <PromptHighlight text={quickStart.prompt} />
                </pre>
              </div>
            </section>

            {/* ── SOP intro ────────────────────────────────────────── */}
            <section style={{ marginTop: 72 }}>
              <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT, margin: "0 0 14px" }}>
                {sop.label}
              </p>
              <h2 style={{ fontSize: "clamp(32px,4vw,42px)", fontWeight: 760, lineHeight: 1.04, letterSpacing: "-0.025em", margin: "0 0 22px", color: TEXT }}>
                {sop.title}
              </h2>
              <p style={{ fontSize: 17, lineHeight: 1.65, color: TEXT2, maxWidth: "56ch" }}>
                {sop.description}
              </p>
            </section>

            {/* ── Developer Entry card ─────────────────────────────── */}
            <section style={{ marginTop: 72, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 32 }}>
              <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: TEXT3, margin: "0 0 14px" }}>
                {developerEntry.kicker}
              </p>
              <h3 style={{ fontSize: 24, fontWeight: 680, lineHeight: 1.2, margin: "0 0 14px", color: TEXT }}>
                {developerEntry.title}
              </h3>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: TEXT2, maxWidth: "64ch", margin: "0 0 28px" }}>
                {developerEntry.description}
              </p>

              <hr style={{ height: 1, background: BORDER, border: 0, margin: "0 0 28px" }} />

              {/* real examples */}
              <SubLabel>{developerEntry.realExamplesLabel}</SubLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <Link href="/community-buyback-example" style={btnPrimary}>
                  {developerEntry.openCommunityBuybackExample} <ArrowSpan />
                </Link>
                <Link href="/flapixel-example" style={btnPrimary}>
                  {developerEntry.openFlapixelExample} <ArrowSpan />
                </Link>
              </div>
              <p style={{ fontSize: 13.5, color: TEXT3, margin: "0 0 32px" }}>
                {developerEntry.realExamplesDescription}
              </p>

              <SubLabel muted>{developerEntry.referenceExamplesLabel}</SubLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 14 }}>
                <Link href="/example" style={btnSecondary}>
                  {developerEntry.openPreview} <ArrowSpan />
                </Link>
                <Link href="/dex-listed-example" style={btnSecondary}>
                  {developerEntry.openDexListedPreview} <ArrowSpan />
                </Link>
                <Link href="/action-gallery-example" style={btnSecondary}>
                  {developerEntry.openActionGalleryPreview} <ArrowSpan />
                </Link>
              </div>
              <p style={{ fontSize: 13.5, color: TEXT3, margin: "0 0 32px" }}>
                {developerEntry.referenceExamplesDescription}
              </p>

              <hr style={{ height: 1, background: BORDER, border: 0, margin: "0 0 28px" }} />

              {/* 3-col info grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                {developerEntry.cards.map((card, i) => {
                  const Icon = entryIcons[i] ?? FileText;
                  return (
                    <div key={card.title}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, fontWeight: 640, color: TEXT, margin: "0 0 14px" }}>
                        <Icon size={16} style={{ color: ACCENT2, flexShrink: 0 }} />
                        {card.title}
                      </div>
                      <p style={{ fontSize: 13.5, color: TEXT2, margin: "0 0 14px" }}>{card.body}</p>
                      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
                        {card.items.map((item) => (
                          <li key={item} style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT2 }}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {/* done callout */}
              <div style={{ display: "flex", gap: 14, borderRadius: 10, padding: "16px 18px", background: "rgba(54,211,153,0.07)", border: "1px solid rgba(54,211,153,0.2)", color: TEXT2, fontSize: 14, lineHeight: 1.6, marginTop: 28 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={OK} strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><path d="M20 6 9 17l-5-5"/></svg>
                <div>
                  <strong style={{ color: TEXT, fontWeight: 600 }}>{developerEntry.doneTitle} · </strong>
                  {developerEntry.doneBody}
                </div>
              </div>
            </section>

            {/* ── Dev scope card ───────────────────────────────────── */}
            <section style={{ marginTop: 72, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 32 }}>
              <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: TEXT3, margin: "0 0 24px" }}>
                {sop.scopeTitle}
              </p>
              <h3 style={{ fontSize: 24, fontWeight: 680, lineHeight: 1.2, margin: "0 0 24px", color: TEXT }}>
                在模板提供的组件结构内完成 Vault UI 定制。
              </h3>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 14 }}>
                {sop.scopeItems.map((item) => (
                  <li key={item} style={{ position: "relative", paddingLeft: 26, fontSize: 14.5, lineHeight: 1.62, color: TEXT2 }}>
                    <span style={{ position: "absolute", left: 6, top: 9, width: 7, height: 7, borderRadius: "50%", border: `2px solid ${ACCENT}`, display: "inline-block" }} />
                    <RichText text={item} />
                  </li>
                ))}
              </ul>
            </section>

            {/* ── Agent guide card ─────────────────────────────────── */}
            <section style={{ marginTop: 72, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 32 }}>
              <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: TEXT3, margin: "0 0 14px" }}>
                AI Agent / Skill
              </p>
              <h3 style={{ fontSize: 24, fontWeight: 680, lineHeight: 1.2, margin: "0 0 14px", color: TEXT }}>
                {agentGuide.title}
              </h3>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: TEXT2, maxWidth: "64ch", margin: "0 0 24px" }}>
                {agentGuide.description}
              </p>

              {/* skill callout */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, background: ACCSOFT, border: `1px solid ${ACCLINE}`, borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(77,141,255,0.18)", display: "grid", placeItems: "center", color: ACCENT2, flexShrink: 0 }}>
                  <Zap size={20} />
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT, margin: "0 0 3px" }}>{agentGuide.skillTitle}</p>
                  <div style={{ fontFamily: MONO, fontSize: 14, color: TEXT }}>{agentGuide.skillName}</div>
                  <div style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT3, marginTop: 2 }}>{agentGuide.skillPath}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginTop: 28, alignItems: "start" }}>
                {/* docs column */}
                <div>
                  <SubLabel>{agentGuide.docsTitle}</SubLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {agentGuide.docs.map((doc) => (
                      <div key={doc.path} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT }}>{doc.path}</div>
                        <div style={{ fontSize: 13, color: TEXT3, marginTop: 4 }}>{doc.description}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* inputs + outputs + workflow */}
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                  <div>
                    <SubLabel muted>{agentGuide.inputsTitle}</SubLabel>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 14 }}>
                      {agentGuide.inputs.map((item) => (
                        <li key={item} style={{ position: "relative", paddingLeft: 26, fontSize: 14.5, lineHeight: 1.62, color: TEXT2 }}>
                          <span style={{ position: "absolute", left: 6, top: 9, width: 7, height: 7, borderRadius: "50%", border: `2px solid ${ACCENT}`, display: "inline-block" }} />
                          <RichText text={item} />
                        </li>
                      ))}
                    </ul>
                  </div>

                  <hr style={{ height: 1, background: BORDER, border: 0 }} />

                  <div>
                    <SubLabel>{agentGuide.outputsTitle}</SubLabel>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {agentGuide.outputs.map((f) => (
                        <span key={f} style={{ display: "inline-flex", alignItems: "center", fontFamily: MONO, fontSize: 13, color: TEXT2, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px" }}>
                          <strong style={{ color: ACCENT2, fontWeight: 500 }}>{f.replace("src/vaults/", "src/vaults/​")}</strong>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <SubLabel>{agentGuide.workflowTitle}</SubLabel>
                    <ol style={{ margin: 0, padding: 0, listStyle: "none", counterReset: "wf", display: "flex", flexDirection: "column", gap: 16 }}>
                      {agentGuide.workflow.map((item, i) => (
                        <li key={item} style={{ position: "relative", paddingLeft: 40, fontSize: 14.5, lineHeight: 1.6, color: TEXT2 }}>
                          <span style={{ position: "absolute", left: 0, top: 0, width: 24, height: 24, borderRadius: 7, background: BG2, border: `1px solid ${BORDSTR}`, color: ACCENT2, fontFamily: MONO, fontSize: 12, fontWeight: 600, display: "grid", placeItems: "center" }}>
                            {i + 1}
                          </span>
                          <RichText text={item} />
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            </section>

            {/* ── 7 Steps ──────────────────────────────────────────── */}
            <section style={{ marginTop: 72 }}>
              <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT, margin: "0 0 8px" }}>
                流程
              </p>
              <h2 style={{ fontSize: 28, fontWeight: 680, lineHeight: 1.2, margin: "0 0 8px", color: TEXT }}>
                七步完成一个 Vault UI。
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: TEXT2, margin: "0 0 28px" }}>
                从安装依赖到打包给 Artifact Workbench，按顺序执行即可。
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {sop.steps.map((step, i) => (
                  <div key={step.title} style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 24, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "28px 32px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: ACCENT2, width: 44, height: 44, borderRadius: 11, background: BG2, border: `1px solid ${BORDSTR}`, display: "grid", placeItems: "center" }}>
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 660, color: TEXT, margin: "6px 0 6px" }}>{step.title}</div>
                      <p style={{ fontSize: 14.5, lineHeight: 1.65, color: TEXT2, margin: "0 0 18px" }}>{step.body}</p>
                      {step.code ? (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, fontFamily: MONO, fontSize: 14, color: TEXT, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 18px", marginBottom: step.files?.length || step.items?.length ? 14 : 0 }}>
                          <span style={{ color: ACCENT, fontWeight: 700, flexShrink: 0 }}>$</span>
                          <code style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>{step.code}</code>
                        </div>
                      ) : null}
                      {step.files?.length ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                          {step.files.map((f) => (
                            <span key={f} style={{ display: "inline-flex", alignItems: "center", fontFamily: MONO, fontSize: 13, color: TEXT2, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px" }}>{f}</span>
                          ))}
                        </div>
                      ) : null}
                      {step.items?.length ? (
                        <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 14 }}>
                          {step.items.map((item) => (
                            <li key={item} style={{ position: "relative", paddingLeft: 26, fontSize: 14.5, lineHeight: 1.62, color: TEXT2 }}>
                              <span style={{ position: "absolute", left: 6, top: 9, width: 7, height: 7, borderRadius: "50%", border: `2px solid ${ACCENT}`, display: "inline-block" }} />
                              <RichText text={item} />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Submission requirements ──────────────────────────── */}
            <section style={{ marginTop: 72, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 32 }}>
              <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: TEXT3, margin: "0 0 24px" }}>
                提交要求
              </p>
              <h3 style={{ fontSize: 24, fontWeight: 680, lineHeight: 1.2, margin: "0 0 24px", color: TEXT }}>
                交付前逐条对照。
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {sop.rules.map((rule, i) => (
                  <div key={rule} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px", fontSize: 14, lineHeight: 1.6, color: TEXT2, gridColumn: i === sop.rules.length - 1 && sop.rules.length % 2 !== 0 ? "1 / -1" : undefined }}>
                    <RichText text={rule} />
                  </div>
                ))}
              </div>
            </section>

            {/* ── Footer CTA ───────────────────────────────────────── */}
            <section style={{ marginTop: 44 }}>
              <hr style={{ height: 1, background: BORDER, border: 0, margin: "0 0 32px" }} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
                <Link href="/example" style={btnSecondary}>
                  {developerEntry.openPreview} <ArrowSpan />
                </Link>
                <Link href="/dex-listed-example" style={btnSecondary}>
                  {developerEntry.openDexListedPreview} <ArrowSpan />
                </Link>
                <Link href="/action-gallery-example" style={btnSecondary}>
                  {developerEntry.openActionGalleryPreview} <ArrowSpan />
                </Link>
              </div>
            </section>

          </div>
        </main>
        </div>{/* /relative z-1 */}
      </div>
    </VaultRuntimeProvider>
  );
}

/* ── tiny helpers ──────────────────────────────────────────── */

function SubLabel({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <p style={{ fontSize: 13, fontWeight: 600, color: muted ? "#4a5366" : "#e6e9ef", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: 2, background: muted ? "#4a5366" : ACCENT, flexShrink: 0 }} />
      {children}
    </p>
  );
}

function ArrowSpan() {
  return <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.5)" }}>→</span>;
}

/**
 * Syntax-highlights the AI agent prompt template:
 *   <placeholder>  → blue  (tok-key)
 *   filename.ext   → green (tok-str)
 */
function PromptHighlight({ text }: { text: string }) {
  // Split on <...> placeholders AND known file/path tokens
  const TOKEN = /(<[^>]+>|(?:AGENTS|agent-contract|docs\/ai-agent|docs\/ui-pattern-snippets)\.(?:md|json))/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const isPlaceholder = tok.startsWith("<");
    parts.push(
      <span key={m.index} style={{ color: isPlaceholder ? "#6aa9ff" : "#5fd0a8" }}>{tok}</span>
    );
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** Wraps backtick-delimited tokens in a mono highlight span */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} style={{ fontFamily: MONO, fontSize: "0.92em", color: ACCENT2, background: ACCSOFT, padding: "1px 5px", borderRadius: 5 }}>
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        )
      )}
    </>
  );
}

const btnPrimary: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  height: 44,
  padding: "0 18px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  border: "none",
  background: "linear-gradient(135deg,#3f7bff 0%,#2f9bff 100%)",
  color: "#fff",
  cursor: "pointer",
  textDecoration: "none",
};

const btnSecondary: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  height: 44,
  padding: "0 18px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  border: `1px solid ${BORDSTR}`,
  background: PANEL2,
  color: TEXT,
  cursor: "pointer",
  textDecoration: "none",
};
