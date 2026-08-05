"use client";

import type React from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

type DocMode = "custom" | "miniApp";
type SearchParamsLike = {
  get: (name: string) => string | null;
  toString: () => string;
};

function readDocMode(searchParams: SearchParamsLike): DocMode {
  const value = searchParams.get("tab") ?? searchParams.get("mode");
  return value === "mini-app" || value === "miniApp" || value === "mini" ? "miniApp" : "custom";
}

function writeDocMode(mode: DocMode) {
  return mode === "miniApp" ? "mini-app" : "custom";
}

type MiniAppGuideContent = {
  requirementsKicker: string;
  comparisonKicker: string;
  summary: {
    kicker: string;
    title: string;
    description: string;
    items: string[];
  };
  requirementsTitle: string;
  requirementsDescription: string;
  requirements: Array<{
    title: string;
    body: string;
  }>;
  examples: {
    kicker: string;
    title: string;
    description: string;
    capabilityLabel: string;
    capabilityFeatures: string[];
    farmBadge: string;
    farmTitle: string;
    farmDescription: string;
    farmCta: string;
    skiesBadge: string;
    skiesTitle: string;
    skiesDescription: string;
    skiesCta: string;
    gameBadge: string;
    gameTitle: string;
    gameDescription: string;
    gameCta: string;
    technicalBadge: string;
    technicalTitle: string;
    technicalDescription: string;
    technicalCta: string;
  };
  comparisonTitle: string;
  comparisonDescription: string;
  comparisonTopicHeader: string;
  comparisonCustomHeader: string;
  comparisonMiniAppHeader: string;
  comparisonRows: Array<{
    topic: string;
    custom: string;
    miniApp: string;
  }>;
  preview: {
    kicker: string;
    title: string;
    description: string;
    imageAlt: string;
    caption: string;
    routeLabel: string;
    route: string;
  };
  workflowTitle: string;
  workflow: string[];
  rulesTitle: string;
  rules: string[];
  doneTitle: string;
  doneBody: string;
};

export default function HomePage() {
  const { lang, languageCode } = useLang();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sop = lang.home.sop;
  const docMode = readDocMode(searchParams);
  const miniApp = sop.miniApp;
  const quickStart = docMode === "miniApp" ? miniApp.quickStart : sop.quickStart;
  const developerEntry = sop.developerEntry;
  const agentGuide = sop.agentGuide;
  const intro =
    docMode === "miniApp"
      ? { label: miniApp.label, title: miniApp.title, description: miniApp.description }
      : { label: sop.label, title: sop.title, description: sop.description };
  const setDocMode = (mode: DocMode) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", writeDocMode(mode));
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

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
          <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 clamp(16px,4vw,32px)" }}>
            <MiniAppGuide doc={miniApp} galleryOnly />
            <ModeTabs mode={docMode} onChange={setDocMode} labels={sop.modeTabs} />

            {/* ── HERO: 2-col grid ─────────────────────────────────── */}
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 40, alignItems: "start" }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT, margin: "0 0 14px" }}>
                  {quickStart.kicker}
                </p>
                <h1 style={{ fontSize: "clamp(32px,3.6vw,42px)", fontWeight: 760, lineHeight: 1.04, letterSpacing: "-0.025em", margin: "0 0 18px", color: TEXT }}>
                  {quickStart.title}
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
                {intro.label}
              </p>
              <h2 style={{ fontSize: "clamp(32px,4vw,42px)", fontWeight: 760, lineHeight: 1.04, letterSpacing: "-0.025em", margin: "0 0 22px", color: TEXT }}>
                {intro.title}
              </h2>
              <p style={{ fontSize: 17, lineHeight: 1.65, color: TEXT2, maxWidth: "56ch" }}>
                {intro.description}
              </p>
            </section>

            {docMode === "custom" ? (
              <>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, marginBottom: 14 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 14 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
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
                {sop.scopeDescription}
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
                {agentGuide.kicker}
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 28, marginTop: 28, alignItems: "start" }}>
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
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
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
                {sop.stepsLabel}
              </p>
              <h2 style={{ fontSize: 28, fontWeight: 680, lineHeight: 1.2, margin: "0 0 8px", color: TEXT }}>
                {sop.stepsTitle}
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: TEXT2, margin: "0 0 28px" }}>
                {sop.stepsDescription}
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
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 14 }}>
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
                {sop.rulesTitle}
              </p>
              <h3 style={{ fontSize: 24, fontWeight: 680, lineHeight: 1.2, margin: "0 0 24px", color: TEXT }}>
                {sop.rulesDescription}
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
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
              </>
            ) : (
              <MiniAppGuide doc={miniApp} hideGallery />
            )}

          </div>
        </main>
        </div>{/* /relative z-1 */}
      </div>
    </VaultRuntimeProvider>
  );
}

/* ── tiny helpers ──────────────────────────────────────────── */

function ModeTabs({
  mode,
  onChange,
  labels,
}: {
  mode: DocMode;
  onChange: (mode: DocMode) => void;
  labels: {
    customLabel: string;
    customDescription: string;
    miniAppLabel: string;
    miniAppDescription: string;
  };
}) {
  return (
    <section style={{ margin: "0 0 36px", background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
        <ModeTabButton active={mode === "custom"} label={labels.customLabel} description={labels.customDescription} onClick={() => onChange("custom")} />
        <ModeTabButton active={mode === "miniApp"} label={labels.miniAppLabel} description={labels.miniAppDescription} onClick={() => onChange("miniApp")} />
      </div>
    </section>
  );
}

function ModeTabButton({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 76,
        border: `1px solid ${active ? ACCLINE : "transparent"}`,
        borderRadius: 10,
        background: active ? ACCSOFT : "transparent",
        color: TEXT,
        cursor: "pointer",
        padding: "14px 16px",
        textAlign: "left",
      }}
    >
      <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{label}</span>
      <span style={{ display: "block", marginTop: 4, fontSize: 13, lineHeight: 1.5, color: active ? TEXT2 : TEXT3 }}>{description}</span>
    </button>
  );
}

function MiniAppGuide({ doc, galleryOnly = false, hideGallery = false }: { doc: MiniAppGuideContent; galleryOnly?: boolean; hideGallery?: boolean }) {
  return (
    <>
      {!galleryOnly ? <section style={{ marginTop: 72, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 32 }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: TEXT3, margin: "0 0 14px" }}>
          {doc.summary.kicker}
        </p>
        <h3 style={{ fontSize: 24, fontWeight: 680, lineHeight: 1.2, margin: "0 0 14px", color: TEXT }}>
          {doc.summary.title}
        </h3>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: TEXT2, maxWidth: "70ch", margin: "0 0 24px" }}>
          {doc.summary.description}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
          {doc.summary.items.map((item) => (
            <div key={item} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px", fontSize: 14, lineHeight: 1.6, color: TEXT2 }}>
              <RichText text={item} />
            </div>
          ))}
        </div>
      </section> : null}

      {!hideGallery ? <section data-testid="mini-app-example-gallery" style={{ marginTop: 0, padding: "28px 0 52px" }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT, margin: "0 0 8px" }}>
          {doc.examples.kicker}
        </p>
        <h2 style={{ fontSize: 28, fontWeight: 680, lineHeight: 1.2, margin: "0 0 8px", color: TEXT }}>
          {doc.examples.title}
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: TEXT2, margin: "0 0 28px", maxWidth: "72ch" }}>
          {doc.examples.description}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 18, padding: "14px 16px", borderRadius: 12, border: `1px solid ${ACCLINE}`, background: ACCSOFT }}>
          <strong style={{ color: ACCENT2, fontSize: 13.5 }}>{doc.examples.capabilityLabel}</strong>
          {doc.examples.capabilityFeatures.map((feature) => (
            <span key={feature} style={{ padding: "4px 8px", borderRadius: 999, border: `1px solid ${BORDER}`, background: BG2, color: TEXT2, fontFamily: MONO, fontSize: 11.5 }}>
              {feature}
            </span>
          ))}
        </div>

        <div data-testid="mini-app-example-grid" className="grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-4">
          <article data-testid="flap-farm-guide-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14 }}>
            <div className="h-[210px] md:h-[220px] xl:h-[180px]" style={{ overflow: "hidden", borderBottom: `1px solid ${BORDER}`, background: BG2 }}>
              <Image src="/docs/mini-app-flap-farm-preview.png" alt={doc.preview.imageAlt} width={1440} height={2824} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} />
            </div>
            <div style={{ display: "flex", flex: 1, flexDirection: "column", padding: 20 }}>
              <span style={{ alignSelf: "flex-start", display: "inline-flex", borderRadius: 999, padding: "4px 9px", background: "rgba(54,211,153,0.09)", border: "1px solid rgba(54,211,153,0.22)", color: OK, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{doc.examples.farmBadge}</span>
              <h3 style={{ margin: "13px 0 8px", color: TEXT, fontSize: 19, lineHeight: 1.3 }}>{doc.examples.farmTitle}</h3>
              <p style={{ flex: 1, margin: "0 0 18px", color: TEXT2, fontSize: 13.5, lineHeight: 1.65 }}>{doc.examples.farmDescription}</p>
              <Link href={doc.preview.route} style={{ ...btnPrimary, width: "100%" }}>
                {doc.examples.farmCta} <ArrowSpan />
              </Link>
            </div>
          </article>

          <article data-testid="flap-gamefi-arena-preview-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: PANEL, border: "1px solid rgba(139,98,255,0.46)", borderRadius: 14, boxShadow: "0 18px 70px rgba(139,98,255,0.15)" }}>
            <div className="h-[210px] md:h-[220px] xl:h-[180px]" style={{ position: "relative", overflow: "hidden", borderBottom: `1px solid ${BORDER}`, background: "#050711" }}>
              <Image
                src="/docs/flap-gamefi-arena-preview.jpg"
                alt={doc.examples.gameTitle}
                width={2056}
                height={1032}
                style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 58%", transform: "scale(1.03)" }}
              />
              <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 58%,rgba(4,5,17,0.82) 100%)" }} />
              <span style={{ position: "absolute", left: 14, right: 14, bottom: 12, padding: "4px 8px", borderRadius: 999, border: "1px solid rgba(145,246,255,0.28)", background: "rgba(5,7,17,0.66)", color: "#9ff9ff", fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.09em", textAlign: "center", textTransform: "uppercase", backdropFilter: "blur(8px)" }}>Interactive GameFi · Flap Showcase Only</span>
            </div>
            <div style={{ display: "flex", flex: 1, flexDirection: "column", padding: 20 }}>
              <span style={{ alignSelf: "flex-start", display: "inline-flex", borderRadius: 999, padding: "4px 9px", background: "rgba(139,98,255,0.12)", border: "1px solid rgba(139,98,255,0.35)", color: "#b69cff", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {doc.examples.gameBadge}
              </span>
              <h3 style={{ margin: "13px 0 8px", color: TEXT, fontSize: 19, lineHeight: 1.3 }}>{doc.examples.gameTitle}</h3>
              <p style={{ flex: 1, margin: "0 0 18px", color: TEXT2, fontSize: 13.5, lineHeight: 1.65 }}>{doc.examples.gameDescription}</p>
              <Link href="/flap-gamefi-arena" style={{ ...btnPrimary, width: "100%" }}>
                {doc.examples.gameCta} <ArrowSpan />
              </Link>
            </div>
          </article>

          <article data-testid="flap-skies-preview-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: PANEL, border: `1px solid ${ACCLINE}`, borderRadius: 14, boxShadow: "0 18px 70px rgba(77,141,255,0.12)" }}>
            <div className="h-[210px] md:h-[220px] xl:h-[180px]" style={{ position: "relative", overflow: "hidden", borderBottom: `1px solid ${BORDER}`, background: "#050718" }}>
              <Image
                src="/docs/flap-skies-preview.jpg"
                alt={doc.examples.skiesTitle}
                width={1800}
                height={1269}
                style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 48%", transform: "scale(1.045)" }}
              />
              <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 64%,rgba(3,5,18,0.76) 100%)" }} />
              <span style={{ position: "absolute", left: 14, bottom: 12, padding: "4px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.22)", background: "rgba(5,7,24,0.62)", color: "rgba(255,255,255,0.9)", fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", backdropFilter: "blur(8px)" }}>Flap Showcase Only</span>
            </div>
            <div style={{ display: "flex", flex: 1, flexDirection: "column", padding: 20 }}>
              <span style={{ alignSelf: "flex-start", display: "inline-flex", borderRadius: 999, padding: "4px 9px", background: ACCSOFT, border: `1px solid ${ACCLINE}`, color: ACCENT2, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {doc.examples.skiesBadge}
              </span>
              <h3 style={{ margin: "13px 0 8px", color: TEXT, fontSize: 19, lineHeight: 1.3 }}>{doc.examples.skiesTitle}</h3>
              <p style={{ flex: 1, margin: "0 0 18px", color: TEXT2, fontSize: 13.5, lineHeight: 1.65 }}>{doc.examples.skiesDescription}</p>
              <Link href="/flap-skies-showcase" style={{ ...btnPrimary, width: "100%" }}>
                {doc.examples.skiesCta} <ArrowSpan />
              </Link>
            </div>
          </article>

          <article data-testid="three-r3f-preview-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: PANEL, border: `1px solid ${ACCLINE}`, borderRadius: 14, boxShadow: "0 18px 70px rgba(120,93,255,0.10)" }}>
            <div aria-hidden="true" className="h-[210px] md:h-[220px] xl:h-[180px]" style={{ position: "relative", overflow: "hidden", borderBottom: `1px solid ${BORDER}`, background: "linear-gradient(145deg,#090b1f 0%,#16133b 55%,#071b2b 100%)" }}>
              <div style={{ position: "absolute", inset: 0, opacity: 0.55, backgroundImage: "linear-gradient(rgba(119,117,255,0.28) 1px,transparent 1px),linear-gradient(90deg,rgba(119,117,255,0.28) 1px,transparent 1px)", backgroundSize: "28px 28px", transform: "perspective(340px) rotateX(58deg) scale(1.55) translateY(42px)" }} />
              <div style={{ position: "absolute", left: "22%", top: "27%", width: 94, height: 94, borderRadius: 24, transform: "rotate(28deg)", background: "linear-gradient(135deg,#b38cff,#4d8dff)", boxShadow: "0 18px 65px rgba(117,105,255,0.48)" }} />
              <div style={{ position: "absolute", right: "20%", top: "36%", width: 88, height: 88, borderRadius: "50%", background: "radial-gradient(circle at 32% 28%,#b9fff2,#3cc9bd 30%,#156377 72%,#09293d)", boxShadow: "0 18px 65px rgba(57,207,198,0.36)" }} />
              <span style={{ position: "absolute", left: 14, right: 14, bottom: 14, color: "rgba(255,255,255,0.78)", fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.09em", textAlign: "center", textTransform: "uppercase" }}>Capability Fixture · three-r3f-v1</span>
            </div>
            <div style={{ display: "flex", flex: 1, flexDirection: "column", padding: 20 }}>
              <span style={{ alignSelf: "flex-start", display: "inline-flex", borderRadius: 999, padding: "4px 9px", background: ACCSOFT, border: `1px solid ${ACCLINE}`, color: ACCENT2, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {doc.examples.technicalBadge}
              </span>
              <h3 style={{ margin: "13px 0 8px", color: TEXT, fontSize: 19, lineHeight: 1.3 }}>{doc.examples.technicalTitle}</h3>
              <p style={{ flex: 1, margin: "0 0 18px", color: TEXT2, fontSize: 13.5, lineHeight: 1.65 }}>{doc.examples.technicalDescription}</p>
              <Link href="/three-r3f-example" style={{ ...btnPrimary, width: "100%" }}>
                {doc.examples.technicalCta} <ArrowSpan />
              </Link>
            </div>
          </article>
        </div>
      </section> : null}

      {!galleryOnly ? <>
      <section style={{ marginTop: 72, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 32 }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: TEXT3, margin: "0 0 14px" }}>
          {doc.requirementsKicker}
        </p>
        <h3 style={{ fontSize: 24, fontWeight: 680, lineHeight: 1.2, margin: "0 0 14px", color: TEXT }}>
          {doc.requirementsTitle}
        </h3>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: TEXT2, maxWidth: "70ch", margin: "0 0 24px" }}>
          {doc.requirementsDescription}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
          {doc.requirements.map((item) => (
            <div key={item.title} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px", fontSize: 14, lineHeight: 1.6, color: TEXT2 }}>
              <div style={{ marginBottom: 8, fontSize: 15, fontWeight: 700, color: TEXT }}>{item.title}</div>
              <RichText text={item.body} />
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 72 }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT, margin: "0 0 8px" }}>
          {doc.comparisonKicker}
        </p>
        <h2 style={{ fontSize: 28, fontWeight: 680, lineHeight: 1.2, margin: "0 0 8px", color: TEXT }}>
          {doc.comparisonTitle}
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: TEXT2, margin: "0 0 28px", maxWidth: "68ch" }}>
          {doc.comparisonDescription}
        </p>
        <div style={{ overflowX: "auto", border: `1px solid ${BORDER}`, borderRadius: 14, background: PANEL }}>
          <div style={{ minWidth: 760 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(120px,0.7fr) minmax(220px,1fr) minmax(220px,1fr)", background: PANEL3, borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 13, fontWeight: 700 }}>
            <CompareCell muted>{doc.comparisonTopicHeader}</CompareCell>
            <CompareCell>{doc.comparisonCustomHeader}</CompareCell>
            <CompareCell>{doc.comparisonMiniAppHeader}</CompareCell>
          </div>
          {doc.comparisonRows.map((row) => (
            <div key={row.topic} style={{ display: "grid", gridTemplateColumns: "minmax(120px,0.7fr) minmax(220px,1fr) minmax(220px,1fr)", borderTop: `1px solid ${BORDER}` }}>
              <CompareCell muted>{row.topic}</CompareCell>
              <CompareCell><RichText text={row.custom} /></CompareCell>
              <CompareCell><RichText text={row.miniApp} /></CompareCell>
            </div>
          ))}
          </div>
        </div>
      </section>

      <section style={{ marginTop: 72, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 18 }}>
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 32 }}>
          <SubLabel>{doc.workflowTitle}</SubLabel>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 16 }}>
            {doc.workflow.map((item, i) => (
              <li key={item} style={{ position: "relative", paddingLeft: 40, fontSize: 14.5, lineHeight: 1.6, color: TEXT2 }}>
                <span style={{ position: "absolute", left: 0, top: 0, width: 24, height: 24, borderRadius: 7, background: BG2, border: `1px solid ${BORDSTR}`, color: ACCENT2, fontFamily: MONO, fontSize: 12, fontWeight: 600, display: "grid", placeItems: "center" }}>
                  {i + 1}
                </span>
                <RichText text={item} />
              </li>
            ))}
          </ol>
        </div>
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 32 }}>
          <SubLabel>{doc.rulesTitle}</SubLabel>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 14 }}>
            {doc.rules.map((item) => (
              <li key={item} style={{ position: "relative", paddingLeft: 26, fontSize: 14.5, lineHeight: 1.62, color: TEXT2 }}>
                <span style={{ position: "absolute", left: 6, top: 9, width: 7, height: 7, borderRadius: "50%", border: `2px solid ${ACCENT}`, display: "inline-block" }} />
                <RichText text={item} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section style={{ marginTop: 44 }}>
        <div style={{ display: "flex", gap: 14, borderRadius: 10, padding: "16px 18px", background: "rgba(54,211,153,0.07)", border: "1px solid rgba(54,211,153,0.2)", color: TEXT2, fontSize: 14, lineHeight: 1.6 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={OK} strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><path d="M20 6 9 17l-5-5"/></svg>
          <div>
            <strong style={{ color: TEXT, fontWeight: 600 }}>{doc.doneTitle} · </strong>
            {doc.doneBody}
          </div>
        </div>
      </section>
      </> : null}
    </>
  );
}

function CompareCell({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div style={{ padding: "15px 16px", color: muted ? TEXT3 : TEXT2, fontSize: 13.5, lineHeight: 1.6, wordBreak: "break-word", borderLeft: muted ? 0 : `1px solid ${BORDER}` }}>
      {children}
    </div>
  );
}

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
