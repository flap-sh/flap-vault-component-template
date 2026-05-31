"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ActionAvailabilityStage, VaultComponentProps } from "@/src/sdk";
import {
  erc20Abi,
  formatTokenAmount,
  handleTxError,
  isActionAvailableForPhase,
  useFlapSdk,
} from "@/src/sdk";
import { Alert, Button, Input, TxButton } from "@/src/ui";
import type { TxButtonState } from "@/src/ui";
import { vaultAbi, viewerAbi } from "./VaultABI";

const TEAM_COUNT = 48;
const WORLD_CUP_VIEWER = "0x00036192958C2aaAF9F445d3Cdc2979995EA333e" as const;
const STAMP_BATCH_MAX = 100;
const STAMP_MINT_DEADLINE = 1784484000; // 2026-07-19 18:00 UTC — matches WorldCupVault.STAMP_MINT_DEADLINE
const CLAIM_RANGE_MAX = 1000;
const STAMP_BASE_COST = 20_000n * 10n ** 18n;
const STAMP_CAP_COST = 200_000n * 10n ** 18n;
const STAMP_CURVE_K = 500n;
const DEFLATION_MILESTONE = 1_000_000_000n * 10n ** 18n;
const MAX_UINT256 = 2n ** 256n - 1n;

const WC_STYLES = `
.wc-hub{
  --wc-bg:#050505;
  --wc-text:#fafafa;
  --wc-body:#e4e4e7;
  --wc-muted:#a1a1aa;
  --wc-gold:#d4af5a;
  --wc-gold-bright:#e8cc7a;
  --wc-gold-dim:rgba(212,175,90,.18);
  --wc-gold-deep:#8b6624;
  --wc-gold-glow:rgba(212,175,90,.14);
  --wc-cell-en:#6ec8ff;
  --wc-cell-zh:#f0c987;
  --wc-cell-en-selected:#9ee5ff;
  --wc-cell-zh-selected:#ffe9a8;
  --wc-border:rgba(255,255,255,.1);
  --wc-border-hover:rgba(255,255,255,.2);
  --wc-live:#ef4444;
  --wc-radius:12px;
  font-family:'Segoe UI','PingFang SC','Microsoft YaHei',system-ui,sans-serif;
  color:var(--wc-text);
  background:
    radial-gradient(ellipse 90% 55% at 50% -15%,rgba(212,175,90,.07) 0%,transparent 55%),
    radial-gradient(ellipse 60% 40% at 100% 20%,rgba(212,175,90,.04) 0%,transparent 50%),
    var(--wc-bg);
}
.wc-title-hero{
  font-family:inherit;
  font-weight:800;
  letter-spacing:.04em;
  line-height:1.08;
  color:var(--wc-text);
}
.wc-title-main{
  display:inline-block;
  background:linear-gradient(135deg,#fff 0%,#e8e8ec 45%,#c9b070 100%);
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
  text-shadow:none;
  filter:drop-shadow(0 0 10px rgba(255,255,255,.12)) drop-shadow(0 2px 20px rgba(0,0,0,.42));
  animation:wc-title-main-glow 2.8s ease-in-out infinite;
}
.wc-title-mark{
  display:inline-block;
  margin-left:.12em;
  font-weight:700;
  letter-spacing:.1em;
  background:linear-gradient(135deg,var(--wc-gold-bright) 0%,var(--wc-gold) 55%,var(--wc-gold-deep) 100%);
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
  filter:drop-shadow(0 0 14px rgba(212,175,90,.22));
  animation:wc-title-mark-glow 2.8s ease-in-out infinite;
}
@keyframes wc-title-main-glow{
  0%,100%{filter:drop-shadow(0 0 8px rgba(255,255,255,.1)) drop-shadow(0 2px 20px rgba(0,0,0,.42))}
  50%{filter:drop-shadow(0 0 26px rgba(255,255,255,.38)) drop-shadow(0 0 14px rgba(201,176,112,.22)) drop-shadow(0 2px 20px rgba(0,0,0,.38))}
}
@keyframes wc-title-mark-glow{
  0%,100%{filter:drop-shadow(0 0 12px rgba(212,175,90,.2)) drop-shadow(0 0 4px rgba(232,204,122,.12))}
  50%{filter:drop-shadow(0 0 36px rgba(232,204,122,.78)) drop-shadow(0 0 56px rgba(212,175,90,.32)) drop-shadow(0 0 10px rgba(255,236,180,.25))}
}
@media(prefers-reduced-motion:reduce){
  .wc-title-main,.wc-title-mark{animation:none}
}
.wc-num{font-variant-numeric:tabular-nums lining-nums;letter-spacing:-.03em;line-height:1.1}
.wc-section{
  position:relative;
  border:1px solid var(--wc-border);
  border-radius:var(--wc-radius);
  padding:1.375rem 1.25rem;
  background:
    linear-gradient(165deg,rgba(255,255,255,.035) 0%,rgba(255,255,255,.012) 42%,rgba(0,0,0,.15) 100%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 24px 48px -32px rgba(0,0,0,.65);
  transition:border-color .25s ease,box-shadow .25s ease,transform .25s ease;
  overflow:hidden;
}
.wc-section::before{
  content:'';
  position:absolute;left:0;right:0;top:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(212,175,90,.4) 20%,rgba(212,175,90,.55) 50%,rgba(212,175,90,.4) 80%,transparent);
  pointer-events:none;
}
.wc-section-head{
  display:flex;align-items:center;gap:.75rem;
  margin-bottom:1.125rem;padding-bottom:.875rem;
  border-bottom:1px solid rgba(255,255,255,.06);
}
.wc-section-head::before{
  content:'';
  width:3px;height:1.125rem;border-radius:999px;flex-shrink:0;
  background:linear-gradient(180deg,var(--wc-gold-bright) 0%,var(--wc-gold-deep) 100%);
  box-shadow:0 0 14px rgba(212,175,90,.45);
}
.wc-section-hero{
  border-color:rgba(212,175,90,.28);
  background:
    radial-gradient(ellipse 120% 85% at 100% -15%,var(--wc-gold-glow) 0%,transparent 58%),
    radial-gradient(ellipse 70% 55% at -5% 105%,rgba(212,175,90,.08) 0%,transparent 52%),
    linear-gradient(165deg,rgba(212,175,90,.09) 0%,rgba(255,255,255,.022) 38%,rgba(5,5,5,.4) 100%);
  box-shadow:inset 0 1px 0 rgba(212,175,90,.14),0 32px 64px -28px rgba(0,0,0,.75);
}
.wc-section-hero::after{
  content:'';
  position:absolute;inset:0;pointer-events:none;opacity:.04;
  background-image:linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px);
  background-size:32px 32px;
  mask-image:radial-gradient(ellipse 80% 70% at 50% 40%,#000 20%,transparent 75%);
}
.wc-section:hover{
  border-color:var(--wc-border-hover);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 28px 56px -28px rgba(0,0,0,.7);
}
.wc-section-hero:hover{
  border-color:rgba(212,175,90,.38);
  background:
    radial-gradient(ellipse 120% 85% at 100% -15%,rgba(212,175,90,.18) 0%,transparent 58%),
    radial-gradient(ellipse 70% 55% at -5% 105%,rgba(212,175,90,.1) 0%,transparent 52%),
    linear-gradient(165deg,rgba(212,175,90,.11) 0%,rgba(255,255,255,.025) 38%,rgba(5,5,5,.4) 100%);
}
.wc-section-title{
  font-size:1.0625rem;font-weight:650;letter-spacing:.025em;color:var(--wc-text);
  text-shadow:0 1px 12px rgba(0,0,0,.35);
}
.wc-tab-bar{
  display:inline-flex;flex-wrap:wrap;gap:.25rem;
  margin-bottom:1.125rem;padding:.28rem;
  border:1px solid rgba(255,255,255,.08);
  border-radius:999px;
  background:rgba(0,0,0,.45);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
}
.wc-tab{
  position:relative;
  padding:.5rem 1.125rem;
  border-radius:999px;
  font-size:.875rem;font-weight:500;
  color:var(--wc-muted);
  transition:color .2s ease,background .2s ease,box-shadow .2s ease;
}
.wc-tab:hover{color:var(--wc-body)}
.wc-tab-active{
  color:#0c0a06;
  background:linear-gradient(135deg,#e0c066 0%,#c59538 48%,#9a7228 100%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 4px 16px rgba(212,175,90,.22);
}
.wc-tab-active::after{display:none}
@keyframes wc-tab-in{from{opacity:.7;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
.wc-terminal-grid{
  display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:1px;
  background:var(--wc-border);border-radius:8px;overflow:hidden;
  box-shadow:0 12px 32px -16px rgba(0,0,0,.6);
}
@media(min-width:640px){.wc-terminal-grid{grid-template-columns:repeat(8,minmax(0,1fr))}}
.wc-terminal-cell{
  position:relative;display:flex;height:78px;min-width:0;
  flex-direction:column;align-items:center;justify-content:flex-end;
  gap:.22rem;padding:.5rem .28rem .42rem;
  border:none;background:var(--wc-bg);cursor:pointer;
  transition:transform .18s ease,background .18s ease,box-shadow .18s ease;
}
@media(min-width:768px){.wc-terminal-cell{height:84px}}
.wc-terminal-cell:hover{background:rgba(255,255,255,.05);transform:scale(1.04);z-index:1}
.wc-terminal-cell-selected{
  outline:1px solid rgba(212,175,90,.75);
  outline-offset:-1px;
  background:linear-gradient(180deg,rgba(212,175,90,.12) 0%,rgba(200,162,75,.04) 100%);
  box-shadow:inset 0 0 0 1px var(--wc-gold-dim),0 0 28px rgba(212,175,90,.18);
  z-index:2;
}
.wc-cell-index{position:absolute;left:.4rem;top:.32rem;font-size:10px;line-height:1;color:var(--wc-muted);font-weight:500}
.wc-cell-code{
  margin-top:.55rem;
  font-size:13px;font-weight:700;line-height:1;letter-spacing:.1em;
  color:var(--wc-cell-en);
  flex-shrink:0;
}
.wc-cell-name{
  width:100%;max-width:100%;padding:0 .15rem;
  font-size:12px;font-weight:600;line-height:1.28;color:var(--wc-cell-zh);text-align:center;
  flex-shrink:0;height:2.56em;max-height:2.56em;
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;
  overflow:hidden;white-space:normal;overflow-wrap:anywhere;word-break:normal;
}
.wc-terminal-cell-selected .wc-cell-code{color:var(--wc-cell-en-selected)}
.wc-terminal-cell-selected .wc-cell-name{color:var(--wc-cell-zh-selected)}
.wc-mint-panel{
  margin-top:.875rem;
  border-top:1px solid transparent;
  padding-top:1rem;
  border-radius:0 0 8px 8px;
  transition:border-color .2s ease,background .2s ease,box-shadow .2s ease;
}
.wc-mint-panel-active{
  border-top-color:rgba(212,175,90,.35);
  background:linear-gradient(180deg,rgba(212,175,90,.11) 0%,rgba(212,175,90,.02) 100%);
  box-shadow:inset 0 1px 0 rgba(212,175,90,.12);
  margin-left:-.5rem;margin-right:-.5rem;
  padding-left:.5rem;padding-right:.5rem;
}
.wc-mint-head{margin-bottom:.875rem}
.wc-mint-team{font-size:.9375rem;font-weight:600;color:var(--wc-text);letter-spacing:.01em}
.wc-mint-flow{display:grid;gap:.875rem;grid-template-columns:1fr}
@media(min-width:640px){.wc-mint-flow{grid-template-columns:repeat(3,minmax(0,1fr));align-items:end}}
.wc-mint-field{display:flex;min-width:0;flex-direction:column;gap:.4rem}
.wc-mint-field-label{font-size:.8125rem;font-weight:500;color:var(--wc-muted);letter-spacing:.03em}
.wc-mint-field-value{font-size:.9375rem;color:var(--wc-text)}
.wc-mint-qty-row{display:flex;align-items:center;gap:.5rem}
.wc-mint-qty-unit{font-size:.875rem;color:var(--wc-body);white-space:nowrap}
.wc-mint-summary{
  margin-top:.875rem;padding:.75rem .875rem;
  border:1px solid rgba(212,175,90,.18);
  border-radius:8px;
  background:linear-gradient(135deg,rgba(255,255,255,.04) 0%,rgba(212,175,90,.04) 100%);
  font-size:.875rem;line-height:1.65;color:var(--wc-body);
}
.wc-mint-summary-note{display:block;margin-top:.35rem;font-size:.8125rem;color:var(--wc-muted)}
.wc-mint-actions{display:flex;flex-wrap:wrap;gap:.625rem;margin-top:.875rem;justify-content:flex-end}
.wc-tape-row{border-bottom:1px solid rgba(255,255,255,.05);transition:background .12s ease}
.wc-tape-row:hover{background:rgba(255,255,255,.04)}
.wc-tape-row-selected{background:linear-gradient(90deg,rgba(212,175,90,.08) 0%,rgba(212,175,90,.02) 100%)}
.wc-filter{font-size:.8125rem;color:var(--wc-muted);padding:.125rem .375rem;transition:color .12s ease}
.wc-filter:hover{color:var(--wc-body)}
.wc-filter-active{color:var(--wc-text);font-weight:500}
.wc-market-toolbar{display:flex;flex-direction:column;gap:.875rem;margin-bottom:.875rem}
.wc-market-search{width:100%;max-width:280px}
.wc-market-controls{display:flex;flex-direction:column;gap:.625rem}
@media(min-width:768px){.wc-market-controls{flex-direction:row;flex-wrap:wrap;align-items:center;gap:1rem 1.5rem}}
.wc-market-group{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .55rem}
.wc-market-group-label{font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--wc-muted);white-space:nowrap}
.wc-market-chips{display:flex;flex-wrap:wrap;gap:.4rem}
.wc-chip{
  border:1px solid var(--wc-border);background:rgba(255,255,255,.03);
  padding:.375rem .7rem;font-size:.8125rem;line-height:1.2;color:var(--wc-body);
  border-radius:999px;
  transition:border-color .15s ease,background .15s ease,color .15s ease,box-shadow .15s ease;
}
.wc-chip:hover{border-color:var(--wc-border-hover);color:var(--wc-text)}
.wc-chip-active{
  border-color:rgba(212,175,90,.55);
  background:linear-gradient(135deg,rgba(212,175,90,.2) 0%,rgba(212,175,90,.07) 100%);
  color:var(--wc-text);font-weight:600;
  box-shadow:0 0 16px rgba(212,175,90,.12);
}
.wc-market-table-wrap{
  overflow-x:auto;border:1px solid var(--wc-border);border-radius:8px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
}
.wc-market-empty{padding:1.75rem;text-align:center;font-size:.875rem;color:var(--wc-muted)}
.wc-live-dot{width:6px;height:6px;border-radius:999px;background:var(--wc-live);animation:wc-pulse 2s ease infinite;box-shadow:0 0 8px rgba(239,68,68,.55)}
.wc-live-dot-green{width:6px;height:6px;border-radius:999px;background:#4ade80;animation:wc-pulse 2s ease infinite;box-shadow:0 0 8px rgba(74,222,128,.55)}
@keyframes wc-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.85)}}
.wc-input{
  border:1px solid var(--wc-border)!important;
  background:rgba(0,0,0,.35)!important;
  color:var(--wc-text)!important;
  border-radius:8px!important;
  transition:border-color .15s ease,box-shadow .15s ease!important;
}
.wc-input:focus{
  border-color:rgba(212,175,90,.45)!important;
  outline:none!important;
  box-shadow:0 0 0 2px rgba(212,175,90,.15)!important;
}
.wc-input::placeholder{color:var(--wc-muted)!important}
.wc-heat{font-family:ui-monospace,Consolas,monospace;font-size:10px;letter-spacing:.03em}
.wc-heat-lit{color:rgba(244,244,245,.7)}
.wc-heat-dim{color:rgba(255,255,255,.12)}
.wc-trend-up{color:var(--wc-gold-bright);font-weight:600}
.wc-trend-flat{color:var(--wc-muted)}
.wc-trend-unknown{color:var(--wc-muted)}
.wc-burn{display:flex;gap:3px}
.wc-burn-seg{flex:1;height:7px;border-radius:2px;background:rgba(255,255,255,.08);transition:background .35s ease,box-shadow .35s ease}
.wc-burn-lit{background:linear-gradient(90deg,rgba(212,175,90,.85),rgba(244,244,245,.9));box-shadow:0 0 8px rgba(212,175,90,.35)}
.wc-pool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
@media(max-width:640px){.wc-pool-grid{grid-template-columns:1fr}}
.wc-pool-card{
  min-width:0;padding:1rem 1.125rem;border-radius:10px;
  border:1px solid var(--wc-border);
  background:linear-gradient(160deg,rgba(255,255,255,.04) 0%,rgba(255,255,255,.01) 100%);
  transition:border-color .22s ease,transform .22s ease,box-shadow .22s ease;
}
.wc-pool-card:hover{
  border-color:rgba(255,255,255,.16);
  transform:translateY(-2px);
  box-shadow:0 16px 32px -20px rgba(0,0,0,.55);
}
.wc-pool-card-accent{
  border-color:rgba(212,175,90,.35);
  background:linear-gradient(145deg,rgba(212,175,90,.14) 0%,rgba(212,175,90,.03) 45%,rgba(255,255,255,.02) 100%);
  box-shadow:inset 0 1px 0 rgba(212,175,90,.15),0 20px 40px -24px rgba(212,175,90,.15);
}
.wc-pool-card-accent:hover{
  border-color:rgba(212,175,90,.5);
  box-shadow:inset 0 1px 0 rgba(212,175,90,.2),0 24px 48px -20px rgba(212,175,90,.22);
}
.wc-pool-num{font-size:1.375rem;font-weight:600;color:var(--wc-text);line-height:1.15;letter-spacing:-.02em}
.wc-stat-inline{font-size:.875rem;color:var(--wc-body)}
.wc-stat-inline strong{color:var(--wc-text);font-weight:600}
.wc-subtitle{font-size:1rem;line-height:1.7;font-weight:400;letter-spacing:.015em;color:var(--wc-muted)}
.wc-pill{
  display:inline-flex;align-items:center;gap:.4rem;
  padding:.4rem .75rem;border-radius:999px;
  border:1px solid var(--wc-border);
  background:rgba(255,255,255,.045);
  font-size:.875rem;line-height:1.2;color:var(--wc-body);
  transition:border-color .2s ease,box-shadow .2s ease;
}
.wc-pill:hover{border-color:var(--wc-border-hover)}
.wc-pill strong{color:var(--wc-text);font-weight:650;font-variant-numeric:tabular-nums}
.wc-pill-accent{
  border-color:rgba(212,175,90,.5);
  background:linear-gradient(135deg,rgba(212,175,90,.18) 0%,rgba(212,175,90,.06) 100%);
  box-shadow:0 0 20px rgba(212,175,90,.1);
}
.wc-verified-badge{
  display:inline-flex;align-items:center;gap:.45rem;
  padding:.4rem .75rem;border-radius:8px;
  border:1px solid rgba(212,175,90,.55);
  background:linear-gradient(180deg,rgba(212,175,90,.12) 0%,rgba(212,175,90,.04) 100%);
  color:var(--wc-gold-bright);
  font-size:.8125rem;font-weight:650;letter-spacing:.04em;line-height:1;
  text-shadow:0 0 16px rgba(212,175,90,.28);
}
.wc-verified-badge-icon{
  display:inline-flex;flex-shrink:0;color:var(--wc-gold-bright);
  filter:drop-shadow(0 0 5px rgba(212,175,90,.45));
}
.wc-badge-row{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-top:.875rem}
.wc-badge{
  display:inline-flex;align-items:center;gap:.45rem;
  padding:.3rem .65rem;border-radius:999px;
  font-size:.8125rem;font-weight:500;color:var(--wc-body);
  border:1px solid var(--wc-border);background:rgba(255,255,255,.04);
}
.wc-badge-live{border-color:rgba(239,68,68,.4);color:#fecaca;background:rgba(239,68,68,.08)}
.wc-badge-progress{border-color:rgba(74,222,128,.42);color:#bbf7d0;background:rgba(74,222,128,.1)}
.wc-rule-grid{display:grid;gap:.875rem;margin-top:1.375rem}
@media(min-width:640px){.wc-rule-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.wc-rule-lead{
  grid-column:1/-1;
  padding:1.125rem 1.25rem;border-radius:10px;
  border:1px solid rgba(212,175,90,.25);
  border-left:3px solid var(--wc-gold);
  background:linear-gradient(105deg,rgba(212,175,90,.16) 0%,rgba(212,175,90,.05) 38%,rgba(255,255,255,.02) 100%);
  font-size:.9375rem;line-height:1.75;color:var(--wc-body);
  box-shadow:inset 0 1px 0 rgba(212,175,90,.1);
}
.wc-rule-flywheel-bridge{
  padding:1rem 1.25rem;border-radius:10px;
  border:1px dashed rgba(212,175,90,.22);
  background:linear-gradient(105deg,rgba(212,175,90,.08) 0%,rgba(255,255,255,.015) 100%);
}
.wc-flywheel-headline{
  margin:0;font-size:.9375rem;font-weight:650;line-height:1.5;color:var(--wc-gold-bright);
}
.wc-flywheel-intro{margin:.45rem 0 0;font-size:.875rem;line-height:1.65;color:var(--wc-body)}
.wc-rule-card{
  padding:1.125rem 1.25rem;border-radius:10px;
  border:1px solid var(--wc-border);
  background:linear-gradient(160deg,rgba(255,255,255,.045) 0%,rgba(255,255,255,.012) 100%);
  transition:border-color .22s ease,background .22s ease,transform .22s ease,box-shadow .22s ease;
}
.wc-rule-card:hover{
  border-color:rgba(212,175,90,.35);
  background:linear-gradient(160deg,rgba(212,175,90,.1) 0%,rgba(255,255,255,.03) 100%);
  transform:translateY(-2px);
  box-shadow:0 16px 32px -22px rgba(0,0,0,.5);
}
.wc-rule-card-wide{grid-column:1/-1}
.wc-rule-label{
  margin-bottom:.45rem;
  font-size:.875rem;font-weight:650;letter-spacing:.04em;
  text-transform:none;color:var(--wc-gold-bright);
}
.wc-rule-body{font-size:.9375rem;line-height:1.75;color:var(--wc-body)}
.wc-caption{font-size:.8125rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--wc-muted)}
.wc-caption-bright{color:var(--wc-body)}
.wc-prose{font-size:.875rem;line-height:1.65;color:var(--wc-body)}
.wc-prose-muted{font-size:.875rem;line-height:1.65;color:var(--wc-muted)}
.wc-prose-fine{font-size:.8125rem;line-height:1.6;color:var(--wc-muted)}
.wc-claim-hero .wc-num{font-size:clamp(1.75rem,4vw,2.5rem);font-weight:650;letter-spacing:-.03em}
.wc-hub .wc-btn-gold{
  min-height:2.75rem!important;
  padding-left:1.125rem!important;padding-right:1.125rem!important;
  border:1px solid rgba(212,175,90,.6)!important;
  background:linear-gradient(135deg,#e0c066 0%,#c59538 45%,#8b6624 100%)!important;
  color:#0c0a06!important;
  border-radius:10px!important;
  font-size:.875rem!important;font-weight:650!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 6px 22px rgba(212,175,90,.22)!important;
  transition:transform .18s ease,box-shadow .18s ease,filter .18s ease!important;
}
.wc-hub .wc-btn-gold:hover:not(:disabled){
  transform:translateY(-1px);
  filter:brightness(1.05);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 10px 28px rgba(212,175,90,.28)!important;
}
.wc-hub .wc-btn-gold-ghost{
  min-height:2.75rem!important;
  padding-left:1.125rem!important;padding-right:1.125rem!important;
  border:1px solid rgba(212,175,90,.35)!important;
  background:linear-gradient(180deg,rgba(212,175,90,.16) 0%,rgba(212,175,90,.05) 100%)!important;
  color:var(--wc-text)!important;
  border-radius:10px!important;
  font-size:.875rem!important;font-weight:600!important;
  transition:transform .18s ease,border-color .18s ease,background .18s ease!important;
}
.wc-hub .wc-btn-gold-ghost:hover:not(:disabled){
  transform:translateY(-1px);
  border-color:rgba(212,175,90,.52)!important;
  background:linear-gradient(180deg,rgba(212,175,90,.22) 0%,rgba(212,175,90,.08) 100%)!important;
}
.wc-hero-link{
  display:inline-flex;align-items:center;gap:.45rem;
  height:2.5rem;padding:0 1rem;font-size:.875rem;font-weight:650;line-height:1;
  text-decoration:none!important;white-space:nowrap;border-radius:10px;
  transition:transform .18s ease,box-shadow .18s ease;
}
.wc-hero-link:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(212,175,90,.12)}
.wc-hero-link-icon{font-size:.9375rem;line-height:1;opacity:.9}
@media(min-width:768px){
  .wc-section{padding:1.625rem 1.5rem}
  .wc-section-title{font-size:1.1875rem}
  .wc-subtitle{font-size:1.0625rem}
  .wc-pool-num{font-size:1.5rem}
  .wc-rule-lead{font-size:.9375rem}
  .wc-rule-body{font-size:1rem}
}
@media(max-width:639px){
  .wc-hub .wc-section .text-xs{font-size:.8125rem;line-height:1.55}
  .wc-hub .wc-section .text-sm{font-size:.875rem;line-height:1.6}
}
.wc-market-table-wrap th{font-size:.75rem;letter-spacing:.06em}
.wc-market-table-wrap td{font-size:.8125rem}
@media(min-width:768px){
  .wc-market-table-wrap th{font-size:.8125rem}
  .wc-market-table-wrap td{font-size:.875rem}
}
`;

function toChainTeamId(uiTeamIndex: number) {
  return uiTeamIndex + 1;
}

function stampPriceAtMinted(minted: bigint) {
  const spread = STAMP_CAP_COST - STAMP_BASE_COST;
  return STAMP_BASE_COST + (spread * minted) / (minted + STAMP_CURVE_K);
}

function estimateBatchMintCost(minted: bigint, count: bigint) {
  let total = 0n;
  let n = minted;
  for (let i = 0n; i < count; i++) {
    total += stampPriceAtMinted(n);
    n += 1n;
  }
  return total;
}

function totalMintBurnFromTeamCounts(counts: readonly bigint[]) {
  let total = 0n;
  for (const count of counts) {
    total += estimateBatchMintCost(0n, count);
  }
  return total;
}

const TEAM_CODES = [
  "MEX", "RSA", "KOR", "CZE", "CAN", "BIH", "QAT", "SUI", "BRA", "MAR", "HAI", "SCO", "USA", "PAR", "AUS", "TUR",
  "GER", "CUW", "CIV", "ECU", "NED", "JPN", "SWE", "TUN", "BEL", "EGY", "IRN", "NZL", "ESP", "CPV", "KSA", "URU",
  "FRA", "SEN", "IRQ", "NOR", "ARG", "ALG", "AUT", "JOR", "POR", "COD", "UZB", "COL", "ENG", "CRO", "GHA", "PAN",
] as const;
// UI index N == on-chain teamId N+1. Order matches deployed NFT metadata (…/meta/{teamId}.json).

function formatTeamLabel(teamId: number, teamName: string) {
  const code = TEAM_CODES[teamId] ?? "";
  return code ? `${code} · ${teamName}` : teamName;
}

function teamNameLabel(translate: (key: string) => string, teamId: number) {
  return translate(["teams", String(teamId)].join("."));
}

type ActionKey = "approve" | "mint" | "freeze" | "claim" | "claimBatch";
type MarketFilter = "all" | "minted" | "empty";
type MarketSort = "heat" | "minted" | "price";
type TeamTrend = "unknown" | "flat" | "up";

type MintView = "select" | "market";

interface TeamMarketRow {
  teamId: number;
  minted: bigint;
  price: bigint;
  trend: TeamTrend;
  mintDelta: bigint;
}

interface VaultSnapshot {
  totalBurned: bigint;
  totalRoyaltyReceived: bigint;
  totalBnbBuyback: bigint;
  stampMinted: bigint;
  pools: bigint[];
  teams: TeamMarketRow[];
  championTeamId?: number;
  finalized?: boolean;
  viewerResolved?: boolean;
  viewerWinnerTeamId?: number;
  viewerWinnerName?: string;
  tokenDecimals: number;
  tokenSymbol: string;
  walletBalance?: bigint;
  allowance?: bigint;
  myStamps?: bigint[];
  myStampCount?: bigint;
  myPendingReward?: bigint;
  myMintSpent?: bigint;
  myClaimedBnb?: bigint;
  myTokenBalance?: bigint;
}

function sumBigints(values: readonly bigint[]) {
  return values.reduce((total, value) => total + value, 0n);
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="wc-section">
      <div className="wc-section-head">
        <h2 className="wc-section-title">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function RuleCard({ label, body, wide }: { label: string; body: string; wide?: boolean }) {
  return (
    <article className={["wc-rule-card", wide ? "wc-rule-card-wide" : ""].join(" ")}>
      <h3 className="wc-rule-label">{label}</h3>
      <p className="wc-rule-body">{body}</p>
    </article>
  );
}

function VerifiedBadge({ label }: { label: string }) {
  return (
    <span className="wc-verified-badge">
      <span className="wc-verified-badge-icon" aria-hidden>
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
          <path
            d="M8 1.4 2.8 3.35v3.85c0 3.35 2.15 6.45 5.2 7.4 3.05-.95 5.2-4.05 5.2-7.4V3.35L8 1.4Z"
            fill="currentColor"
            opacity=".18"
          />
          <path
            d="M8 1.4 2.8 3.35v3.85c0 3.35 2.15 6.45 5.2 7.4 3.05-.95 5.2-4.05 5.2-7.4V3.35L8 1.4Z"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
          <path d="M5.35 7.95 6.95 9.55 10.65 5.85" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label}
    </span>
  );
}

function HeroTitle({ title }: { title: string }) {
  const splitIndex = title.toUpperCase().lastIndexOf(" NFT");
  if (splitIndex > 0) {
    return (
      <h1 className="wc-title-hero text-4xl sm:text-5xl lg:text-[3.25rem]">
        <span className="wc-title-main">{title.slice(0, splitIndex)}</span>
        <span className="wc-title-mark">{title.slice(splitIndex)}</span>
      </h1>
    );
  }
  return <h1 className="wc-title-hero text-4xl sm:text-5xl lg:text-[3.25rem]">{title}</h1>;
}

function NumDisplay({ value, unit, size = "md" }: { value: string; unit?: string; size?: "sm" | "md" | "lg" | "hero" }) {
  const sizeClass = size === "hero" ? "text-3xl sm:text-4xl" : size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-xl";
  return (
    <span className="inline-flex items-baseline gap-x-1.5">
      <span className={["wc-num text-[var(--wc-text)]", sizeClass].join(" ")}>{value}</span>
      {unit ? <span className="text-xs text-[var(--wc-muted)]">{unit}</span> : null}
    </span>
  );
}

function HeatBlocks({ heat }: { heat: number }) {
  const filled = Math.min(8, Math.max(0, Math.round((heat / 100) * 8)));
  return (
    <div className="flex items-center gap-1.5">
      <span className="wc-heat" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className={i < filled ? "wc-heat-lit" : "wc-heat-dim"}>
            █
          </span>
        ))}
      </span>
      <span className="wc-num text-[10px] text-[var(--wc-muted)]">{heat}%</span>
    </div>
  );
}

function BurnSegments({ progress, segments = 16 }: { progress: number; segments?: number }) {
  const lit = Math.min(segments, Math.max(0, Math.round((progress / 100) * segments)));
  return (
    <div className="wc-burn" role="presentation">
      {Array.from({ length: segments }, (_, i) => (
        <div key={i} className={["wc-burn-seg", i < lit ? "wc-burn-lit" : ""].join(" ")} />
      ))}
    </div>
  );
}

export default function WorldcupVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const { context, i18n } = sdk;
  const t = i18n.t;

  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [mintAmount, setMintAmount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null);
  const [txState, setTxState] = useState<TxButtonState>("idle");
  const [mintView, setMintView] = useState<MintView>("select");
  const [marketSearch, setMarketSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [marketSort, setMarketSort] = useState<MarketSort>("heat");
  const [claimRangeStart, setClaimRangeStart] = useState(0n);
  const resetTimerRef = useRef<number | null>(null);
  const prevMintedRef = useRef<bigint[] | null>(null);

  const mintClosedByDeadline = Math.floor(Date.now() / 1000) >= STAMP_MINT_DEADLINE;
  const mintAvailable = !snapshot?.finalized && !mintClosedByDeadline;
  const wrongNetwork = sdk.wallet.isWrongNetwork;
  const actionStage: ActionAvailabilityStage = "both";
  const marketPhase = context.host?.marketPhase ?? "unknown";
  const vaultActionsAvailable = isActionAvailableForPhase(actionStage, marketPhase);
  const marketPhaseLabel =
    marketPhase === "internal-market"
      ? t("badges.internalMarket")
      : marketPhase === "dex-listed"
        ? t("badges.dexListed")
        : t("badges.phaseUnknown");
  const tokenDecimals = snapshot?.tokenDecimals ?? 18;
  const tokenLabel = context.tokenName ?? "世界杯NFT";
  const i18nToken = useMemo(() => ({ tokenSymbol: tokenLabel }), [tokenLabel]);
  const paymentSymbol = context.paymentToken?.symbol ?? "BNB";

  const parsedMintAmount = useMemo(() => {
    const trimmed = mintAmount.trim();
    if (!/^\d+$/.test(trimmed)) return 0n;
    try {
      const parsed = BigInt(trimmed);
      return parsed > 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  }, [mintAmount]);

  const selectedTeam = useMemo(
    () => (selectedTeamId === null ? undefined : snapshot?.teams.find((row) => row.teamId === selectedTeamId)),
    [selectedTeamId, snapshot?.teams],
  );

  const mintUnitPrice = selectedTeam?.price ?? 0n;
  const mintQuoteUnitPrice =
    selectedTeam && mintUnitPrice > 0n ? mintUnitPrice : selectedTeam ? stampPriceAtMinted(selectedTeam.minted) : 0n;
  const mintQuoteIsEstimate = Boolean(selectedTeam && mintUnitPrice === 0n && mintQuoteUnitPrice > 0n);
  const mintTotalCost =
    selectedTeam && parsedMintAmount > 0n
      ? parsedMintAmount === 1n
        ? mintUnitPrice
        : estimateBatchMintCost(selectedTeam.minted, parsedMintAmount)
      : 0n;
  const mintQuoteTotal =
    selectedTeam && parsedMintAmount > 0n
      ? parsedMintAmount === 1n
        ? mintQuoteUnitPrice
        : estimateBatchMintCost(selectedTeam.minted, parsedMintAmount)
      : 0n;
  const priceUnavailable = selectedTeamId !== null && mintUnitPrice === 0n;
  const mintCountTooLarge = parsedMintAmount > BigInt(STAMP_BATCH_MAX);
  const approveAmount =
    mintTotalCost > 0n
      ? parsedMintAmount > 1n
        ? MAX_UINT256
        : mintTotalCost
      : selectedTeamId !== null && parsedMintAmount > 0n
        ? MAX_UINT256
        : 0n;
  const needsApproval = approveAmount > 0n && (snapshot?.allowance ?? 0n) < approveAmount;
  const canPrepareMint =
    mintAvailable && Boolean(context.userAddress) && !wrongNetwork && selectedTeamId !== null && parsedMintAmount > 0n;

  const maxTeamMinted = useMemo(() => {
    const values = snapshot?.teams.map((row) => row.minted) ?? [];
    return values.length ? values.reduce((max, value) => (value > max ? value : max), 0n) : 0n;
  }, [snapshot?.teams]);

  const burnProgress = useMemo(() => {
    const burned = snapshot?.totalBurned ?? 0n;
    if (burned <= 0n) return 0;
    const scaled = Number((burned * 10_000n) / DEFLATION_MILESTONE) / 100;
    return Math.min(100, scaled);
  }, [snapshot?.totalBurned]);

  const mintBurnTotal = useMemo(
    () => totalMintBurnFromTeamCounts((snapshot?.teams ?? []).map((row) => row.minted)),
    [snapshot?.teams],
  );

  const royaltyBurnTotal = useMemo(() => {
    const total = snapshot?.totalBurned ?? 0n;
    return total > mintBurnTotal ? total - mintBurnTotal : 0n;
  }, [mintBurnTotal, snapshot?.totalBurned]);

  const filteredMarketTeams = useMemo(() => {
    const rows = snapshot?.teams ?? [];
    const query = marketSearch.trim().toLowerCase();
    let filtered = rows.filter((row) => {
      if (marketFilter === "minted" && row.minted <= 0n) return false;
      if (marketFilter === "empty" && row.minted > 0n) return false;
      if (!query) return true;
      const code = (TEAM_CODES[row.teamId] ?? "").toLowerCase();
      const name = teamNameLabel(t, row.teamId).toLowerCase();
      return code.includes(query) || name.includes(query);
    });
    filtered = [...filtered].sort((a, b) => {
      if (marketSort === "minted") return Number(b.minted - a.minted);
      if (marketSort === "price") return Number(b.price - a.price);
      const heatA = maxTeamMinted > 0n ? Number((a.minted * 100n) / maxTeamMinted) : 0;
      const heatB = maxTeamMinted > 0n ? Number((b.minted * 100n) / maxTeamMinted) : 0;
      return heatB - heatA;
    });
    return filtered;
  }, [marketFilter, marketSearch, marketSort, maxTeamMinted, snapshot?.teams, t]);

  const loadData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      else setRefreshing(true);
      try {
        const [totalBurned, totalRoyaltyReceived, totalBnbBuyback, stampMinted, poolsTuple, tokenDecimalsRaw, tokenSymbolRaw, championRaw, finalized, mintedAll] =
          await Promise.all([
            sdk.readContract<bigint>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "totalBurnedWC26" }).catch(() => 0n),
            sdk.readContract<bigint>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "totalRoyaltyReceived" }).catch(() => 0n),
            sdk.readContract<bigint>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "totalBnbBuyback" }).catch(() => 0n),
            sdk.readContract<bigint>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "stampMinted" }).catch(() => 0n),
            sdk.readContract<readonly [bigint, bigint, bigint]>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "pools" }).catch(() => [0n, 0n, 0n] as const),
            sdk.readContract<number>({ contract: "token", address: context.tokenAddress, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
            sdk.readContract<string>({ contract: "token", address: context.tokenAddress, abi: erc20Abi, functionName: "symbol" }).catch(() => "世界杯NFT"),
            sdk.readContract<number>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "champion" }).catch(() => 0),
            sdk.readContract<boolean>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "frozen" }).catch(() => false),
            sdk.readContract<bigint[]>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "stampsMintedAllTeams" }).catch(() => [] as bigint[]),
          ]);

        const pools = [...poolsTuple];
        const championTeamId = championRaw >= 1 && championRaw <= TEAM_COUNT ? championRaw - 1 : undefined;

        const teamRowsRaw = await Promise.all(
          Array.from({ length: TEAM_COUNT }, async (_, teamId) => {
            const chainTeamId = toChainTeamId(teamId);
            const minted = mintedAll[teamId] ?? 0n;
            const price = await sdk
              .readContract<bigint>({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "stampPrice", args: [chainTeamId] })
              .catch(() => 0n);
            return { teamId, minted, price };
          }),
        );

        const prevMinted = prevMintedRef.current;
        const teamRows: TeamMarketRow[] = teamRowsRaw.map((row) => {
          if (!prevMinted) {
            return { ...row, trend: "unknown", mintDelta: 0n };
          }
          const before = prevMinted[row.teamId] ?? 0n;
          const mintDelta = row.minted - before;
          return { ...row, trend: mintDelta > 0n ? "up" : "flat", mintDelta };
        });
        prevMintedRef.current = teamRowsRaw.map((row) => row.minted);

        let viewerResolved: boolean | undefined;
        let viewerWinnerTeamId: number | undefined;
        let viewerWinnerName: string | undefined;
        try {
          const winner = await sdk.readContract<readonly [bigint, string, boolean, bigint, string]>({
            contract: "external",
            address: WORLD_CUP_VIEWER,
            abi: viewerAbi,
            functionName: "getWorldCupWinner",
          });
          viewerResolved = winner[2];
          viewerWinnerTeamId = Number(winner[3]);
          viewerWinnerName = winner[4] || undefined;
        } catch {
          viewerResolved = undefined;
        }

        let walletBalance: bigint | undefined;
        let allowance: bigint | undefined;
        let myStamps: bigint[] | undefined;
        let myStampCount: bigint | undefined;
        let myPendingReward: bigint | undefined;
        let myMintSpent: bigint | undefined;
        let myClaimedBnb: bigint | undefined;
        let myTokenBalance: bigint | undefined;

        if (context.userAddress && !wrongNetwork) {
          const [balance, approved, stampsAll, myInfoTuple] = await Promise.all([
            sdk.readContract<bigint>({ contract: "token", address: context.tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [context.userAddress] }).catch(() => undefined),
            sdk.readContract<bigint>({ contract: "token", address: context.tokenAddress, abi: erc20Abi, functionName: "allowance", args: [context.userAddress, context.vaultAddress] }).catch(() => undefined),
            sdk
              .simulateContract({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "myStampsAllTeams" })
              .then((result) => result.result as bigint[])
              .catch(() => undefined),
            sdk
              .simulateContract({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "myInfo" })
              .then((result) => result.result as readonly [bigint, bigint, bigint, bigint, bigint])
              .catch(() => undefined),
          ]);

          walletBalance = balance;
          allowance = approved;
          myStamps = stampsAll;
          if (myInfoTuple) {
            myTokenBalance = myInfoTuple[0];
            myStampCount = myInfoTuple[1];
            myPendingReward = myInfoTuple[2];
            myMintSpent = myInfoTuple[3];
            myClaimedBnb = myInfoTuple[4];
          } else {
            myStampCount = stampsAll ? sumBigints(stampsAll) : undefined;
            myTokenBalance = balance;
          }
        }

        setSnapshot({
          totalBurned,
          totalRoyaltyReceived,
          totalBnbBuyback,
          stampMinted,
          pools,
          teams: teamRows,
          championTeamId,
          finalized,
          viewerResolved,
          viewerWinnerTeamId,
          viewerWinnerName,
          tokenDecimals: tokenDecimalsRaw,
          tokenSymbol: tokenSymbolRaw,
          walletBalance,
          allowance,
          myStamps,
          myStampCount,
          myPendingReward,
          myMintSpent,
          myClaimedBnb,
          myTokenBalance,
        });
        setLastUpdated(new Date());
        setError(null);
      } catch (nextError) {
        setError(handleTxError(nextError, { unknown: t("errors.loadFailed") }));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [context.tokenAddress, context.userAddress, context.vaultAddress, sdk, t, wrongNetwork],
  );

  useEffect(() => {
    prevMintedRef.current = null;
  }, [context.vaultAddress]);

  useEffect(() => {
    setClaimRangeStart(0n);
  }, [context.userAddress, snapshot?.myStampCount]);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData({ silent: true }), 15000);
    return () => window.clearInterval(timer);
  }, [loadData, sdk.refetchNonce]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const buttonState = (action: ActionKey) => (activeAction === action ? txState : "idle");

  const stageError = useCallback(() => {
    if (!context.userAddress) return t("errors.connectWallet");
    if (wrongNetwork) return t("errors.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel });
    if (!vaultActionsAvailable) return t("errors.stageUnavailable");
    if (snapshot?.finalized) return t("errors.mintFrozen");
    if (mintClosedByDeadline) return t("errors.mintClosed");
    return null;
  }, [context.userAddress, mintClosedByDeadline, sdk.wallet.requiredChainLabel, snapshot?.finalized, t, vaultActionsAvailable, wrongNetwork]);

  const claimStageError = useCallback(() => {
    if (!context.userAddress) return t("errors.connectWallet");
    if (wrongNetwork) return t("errors.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel });
    if (!vaultActionsAvailable) return t("errors.stageUnavailable");
    if (!snapshot?.finalized) return t("errors.claimNotFrozen");
    if ((snapshot?.myPendingReward ?? 0n) <= 0n) return t("errors.claimUnavailable");
    return null;
  }, [context.userAddress, sdk.wallet.requiredChainLabel, snapshot?.finalized, snapshot?.myPendingReward, t, vaultActionsAvailable, wrongNetwork]);

  const freezeStageError = useCallback(() => {
    if (!context.userAddress) return t("errors.connectWallet");
    if (wrongNetwork) return t("errors.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel });
    if (!vaultActionsAvailable) return t("errors.stageUnavailable");
    if (snapshot?.finalized) return t("errors.freezeAlreadyDone");
    if (!mintClosedByDeadline) return t("errors.freezeTooEarly");
    if (snapshot?.viewerResolved === false) return t("errors.freezeViewerPending");
    return null;
  }, [context.userAddress, mintClosedByDeadline, sdk.wallet.requiredChainLabel, snapshot?.finalized, snapshot?.viewerResolved, t, vaultActionsAvailable, wrongNetwork]);

  const handleSwitchNetwork = useCallback(async () => {
    setError(null);
    try {
      await sdk.wallet.switchChain();
    } catch (nextError) {
      setError(handleTxError(nextError, { wrongNetwork: t("errors.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel }) }));
    }
  }, [sdk.wallet, t]);

  const runAction = useCallback(
    async (action: ActionKey, task: () => Promise<void>) => {
      setError(null);
      setActiveAction(action);
      try {
        await task();
        setTxState("success");
        await loadData({ silent: true });
      } catch (nextError) {
        setTxState("failed");
        setError(
          handleTxError(nextError, {
            wrongNetwork: t("errors.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel }),
            simulationFailed: t("errors.mintSimulationFailed", undefined, i18nToken),
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
    [i18nToken, loadData, sdk.wallet.requiredChainLabel, t],
  );

  async function handleApprove() {
    const reason = stageError();
    if (reason) {
      setError(reason);
      return;
    }
    if (approveAmount <= 0n) {
      setError(t("errors.amountRequired"));
      return;
    }
    await runAction("approve", async () => {
      setTxState("approving");
      const hash = await sdk.writeContract({
        contract: "token",
        address: context.tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [context.vaultAddress, approveAmount],
      });
      setTxState("approval_confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.approveSuccess", undefined, i18nToken));
    });
  }

  async function handleMint() {
    const reason = stageError();
    if (reason) {
      setError(reason);
      return;
    }
    if (selectedTeamId === null) {
      setError(t("errors.selectTeam"));
      return;
    }
    if (parsedMintAmount <= 0n) {
      setError(t("errors.amountRequired"));
      return;
    }
    if (mintCountTooLarge) {
      setError(t("errors.batchTooLarge", undefined, { max: String(STAMP_BATCH_MAX) }));
      return;
    }
    if (mintTotalCost > 0n && (snapshot?.walletBalance ?? snapshot?.myTokenBalance ?? 0n) < mintTotalCost) {
      setError(t("errors.insufficientBalance", undefined, i18nToken));
      return;
    }
    if (needsApproval) {
      setError(t("errors.approvalRequired", undefined, i18nToken));
      return;
    }
    const chainTeamId = toChainTeamId(selectedTeamId);
    await runAction("mint", async () => {
      setTxState("simulating");
      const simulation =
        parsedMintAmount === 1n
          ? await sdk.simulateContract({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "mintStamp", args: [chainTeamId, MAX_UINT256] })
          : await sdk.simulateContract({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "mintStampBatch", args: [chainTeamId, parsedMintAmount, 0n] });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.mintSuccess"));
    });
  }

  async function handleFreeze() {
    const reason = freezeStageError();
    if (reason) {
      setError(reason);
      return;
    }
    await runAction("freeze", async () => {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "freeze",
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.freezeSuccess"));
    });
  }

  async function handleClaimAll() {
    const reason = claimStageError();
    if (reason) {
      setError(reason);
      return;
    }
    await runAction("claim", async () => {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "claimAll" });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.claimSuccess"));
    });
  }

  async function handleClaimBatch() {
    const reason = claimStageError();
    if (reason) {
      setError(reason);
      return;
    }
    const total = snapshot?.myStampCount ?? 0n;
    if (total <= 0n) {
      setError(t("errors.claimUnavailable"));
      return;
    }
    const start = claimRangeStart;
    const end = start + BigInt(CLAIM_RANGE_MAX) > total ? total : start + BigInt(CLAIM_RANGE_MAX);
    if (start >= end) {
      setError(t("errors.claimBatchDone"));
      return;
    }
    await runAction("claimBatch", async () => {
      setTxState("simulating");
      const simulation = await sdk.simulateContract({
        contract: "vault",
        address: context.vaultAddress,
        abi: vaultAbi,
        functionName: "claimRange",
        args: [start, end],
      });
      setTxState("writing");
      const hash = await sdk.writeContract(simulation.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      if (end < total) {
        setClaimRangeStart(end);
        sdk.notify.success(t("messages.claimBatchSuccess", undefined, { start: String(start + 1n), end: end.toString(), total: total.toString() }));
      } else {
        setClaimRangeStart(0n);
        sdk.notify.success(t("messages.claimSuccess"));
      }
    });
  }

  const poolCards = [
    { label: t("pools.champion"), index: 0, note: t("pools.championNote") },
    { label: t("pools.participant"), index: 1, note: t("pools.participantNote") },
    { label: t("pools.royalty"), index: 2, note: t("pools.royaltyNote") },
  ];

  const myStampTotal = snapshot?.myStampCount ?? (snapshot?.myStamps ? sumBigints(snapshot.myStamps) : 0n);
  const needsBatchClaim = myStampTotal > BigInt(CLAIM_RANGE_MAX);
  const batchClaimEnd =
    claimRangeStart + BigInt(CLAIM_RANGE_MAX) > myStampTotal ? myStampTotal : claimRangeStart + BigInt(CLAIM_RANGE_MAX);
  const unitPriceText =
    selectedTeam && mintQuoteUnitPrice > 0n
      ? `${formatTokenAmount(mintQuoteUnitPrice, tokenDecimals, 4)} ${tokenLabel}`
      : selectedTeamId !== null
        ? t("notices.priceUnavailable")
        : "—";
  const mintQuoteTotalText =
    selectedTeam && parsedMintAmount > 0n && mintQuoteTotal > 0n
      ? formatTokenAmount(mintQuoteTotal, tokenDecimals, 4)
      : "—";
  const mintSummaryText =
    selectedTeam && parsedMintAmount > 0n && mintQuoteTotal > 0n
      ? t("mint.costSummary", undefined, {
          tokenAmount: mintQuoteTotalText,
          tokenSymbol: tokenLabel,
          count: parsedMintAmount.toString(),
        })
      : selectedTeamId !== null
        ? t("mint.summaryPending")
        : t("mint.noneSelected");

  const vaultExplorerUrl = context.explorerBaseUrl
    ? `${context.explorerBaseUrl.replace(/\/$/, "")}/address/${context.vaultAddress}`
    : undefined;

  const settlementChampionLabel = useMemo(() => {
    if (!snapshot?.finalized) return null;
    if (snapshot.championTeamId !== undefined) {
      return formatTeamLabel(snapshot.championTeamId, teamNameLabel(t, snapshot.championTeamId));
    }
    if (snapshot.viewerWinnerName) return snapshot.viewerWinnerName;
    return t("labels.unavailable");
  }, [snapshot?.championTeamId, snapshot?.finalized, snapshot?.viewerWinnerName, t]);

  return (
    <>
      <style>{WC_STYLES}</style>
      <div className="wc-hub mx-auto w-full max-w-[1080px] min-w-0 space-y-5 overflow-x-hidden px-4 pb-6 lg:px-6">
        <section className="wc-section wc-section-hero relative overflow-hidden">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[rgba(212,175,90,.09)] blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-40 w-40 rounded-full bg-[rgba(255,255,255,.03)] blur-3xl" aria-hidden />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <HeroTitle title={t("title")} />
              <p className="wc-subtitle mt-3 max-w-3xl">{t("subtitle")}</p>
            </div>
            {vaultExplorerUrl ? (
              <a href={vaultExplorerUrl} target="_blank" rel="noopener noreferrer nofollow" className="wc-btn-gold-ghost wc-hero-link shrink-0">
                {t("buttons.viewContract")}
                <span className="wc-hero-link-icon" aria-hidden>
                  ↗
                </span>
              </a>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <VerifiedBadge label={t("hero.lowRisk")} />
            <span className={["wc-badge", !snapshot?.finalized ? "wc-badge-progress" : ""].join(" ")}>
              {!snapshot?.finalized ? <span className="wc-live-dot-green" aria-hidden /> : null}
              {snapshot?.finalized ? t("badges.finalized") : t("badges.voting")}
            </span>
            <span className={["wc-badge", vaultActionsAvailable ? "" : "wc-badge-progress"].join(" ")}>{marketPhaseLabel}</span>
          </div>
          <div className="wc-rule-grid">
            <p className="wc-rule-lead">{t("intro.overview")}</p>
            <RuleCard label={t("intro.pricingLabel")} body={t("intro.pricing")} />
            <RuleCard label={t("intro.deflationLabel")} body={t("intro.deflation")} />
            <RuleCard label={t("intro.settlementLabel")} body={t("intro.settlement")} wide />
          </div>
        </section>

        {wrongNetwork ? (
          <Alert tone="warning">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs">{t("notices.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel })}</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => void handleSwitchNetwork()} disabled={!sdk.wallet.canSwitchChain || sdk.wallet.isSwitchingChain}>
                {sdk.wallet.isSwitchingChain ? t("buttons.switchingNetwork") : t("buttons.switchNetwork", undefined, { requiredChain: sdk.wallet.requiredChainLabel })}
              </Button>
            </div>
          </Alert>
        ) : null}
        {snapshot?.finalized ? <Alert tone="info">{t("notices.mintFrozen")}</Alert> : null}
        {!snapshot?.finalized && mintClosedByDeadline ? <Alert tone="info">{t("notices.mintClosed")}</Alert> : null}
        {loading && !snapshot ? <Alert tone="info">{t("notices.loading")}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <SectionBlock title={t("sections.pools")}>
          <div className="mb-3 flex items-center justify-between gap-2 text-xs text-[var(--wc-body)]">
            <span className="truncate">{refreshing ? t("pools.refreshing") : lastUpdated ? t("pools.lastUpdated", undefined, { time: lastUpdated.toLocaleTimeString() }) : ""}</span>
            <Button type="button" size="sm" variant="secondary" className="wc-btn-gold-ghost" onClick={() => void loadData({ silent: true })} disabled={refreshing}>
              {t("buttons.refresh")}
            </Button>
          </div>
          <div className="wc-pool-grid">
            {poolCards.map((pool) => (
              <div key={pool.label} className={["wc-pool-card", pool.index === 0 ? "wc-pool-card-accent" : ""].filter(Boolean).join(" ")}>
                <p className="wc-caption wc-caption-bright">{pool.label}</p>
                <p className="wc-pool-num wc-num mt-2">
                  {formatTokenAmount(snapshot?.pools[pool.index], 18, 4)}{" "}
                  <span className="text-xs font-normal text-[var(--wc-muted)]">{paymentSymbol}</span>
                </p>
                <p className="mt-2 text-[11px] leading-snug text-[var(--wc-muted)]">{pool.note}</p>
              </div>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock title={t("sections.mint")}>
          <div className="wc-tab-bar">
            <button type="button" onClick={() => setMintView("select")} className={["wc-tab", mintView === "select" ? "wc-tab-active" : ""].join(" ")}>
              {t("sections.mint")}
            </button>
            <button type="button" onClick={() => setMintView("market")} className={["wc-tab", mintView === "market" ? "wc-tab-active" : ""].join(" ")}>
              {t("sections.market")}
            </button>
          </div>

          {mintView === "select" ? (
            <>
              <div className="wc-terminal-grid">
                {Array.from({ length: TEAM_COUNT }, (_, teamId) => {
                  const selected = selectedTeamId === teamId;
                  return (
                    <button
                      key={teamId}
                      type="button"
                      title={formatTeamLabel(teamId, teamNameLabel(t, teamId))}
                      onClick={() => setSelectedTeamId(teamId)}
                      className={["wc-terminal-cell", selected ? "wc-terminal-cell-selected" : ""].join(" ")}
                    >
                      <span className="wc-cell-index">{String(toChainTeamId(teamId)).padStart(2, "0")}</span>
                      <span className="wc-cell-code">{TEAM_CODES[teamId]}</span>
                      <span className="wc-cell-name">{teamNameLabel(t, teamId)}</span>
                    </button>
                  );
                })}
              </div>
              <div className={["wc-mint-panel", selectedTeamId !== null ? "wc-mint-panel-active" : ""].join(" ")}>
                <div className="wc-mint-head">
                  <p className="wc-mint-team">
                    {selectedTeamId === null ? t("mint.noneSelected") : formatTeamLabel(selectedTeamId, teamNameLabel(t, selectedTeamId))}
                  </p>
                </div>
                <div className="wc-mint-flow">
                  <div className="wc-mint-field">
                    <span className="wc-mint-field-label">{t("mint.amount")}</span>
                    <span className="mb-1 block text-xs text-[var(--wc-muted)]">
                      {t("mint.amountHint", undefined, { max: String(STAMP_BATCH_MAX) })}
                    </span>
                    <div className="wc-mint-qty-row">
                      <Input
                        value={mintAmount}
                        onChange={(e) => setMintAmount(e.target.value)}
                        placeholder={t("mint.amountPlaceholder")}
                        className="wc-input h-9 w-20 shrink-0 px-2 text-sm"
                        aria-label={t("mint.amount")}
                      />
                      <span className="wc-mint-qty-unit">{t("mint.stampUnit")}</span>
                    </div>
                  </div>
                  <div className="wc-mint-field">
                    <span className="wc-mint-field-label">{t("mint.unitPrice")}</span>
                    <p className={mintQuoteUnitPrice > 0n ? "wc-mint-field-value wc-num text-[var(--wc-gold)]" : "wc-mint-field-value"}>
                      {unitPriceText}
                      {mintQuoteUnitPrice > 0n ? <span className="text-xs text-[var(--wc-body)]"> / {t("mint.perStamp")}</span> : null}
                    </p>
                  </div>
                  <div className="wc-mint-field">
                    <span className="wc-mint-field-label">{t("mint.totalCost")}</span>
                    <p className="wc-mint-field-value">
                      <span className="wc-num text-base text-[var(--wc-text)]">{mintQuoteTotalText}</span>
                      {mintQuoteTotal > 0n ? <span className="ml-1 text-xs text-[var(--wc-body)]">{tokenLabel}</span> : null}
                    </p>
                  </div>
                </div>
                <p className="wc-mint-summary">
                  {mintSummaryText}
                  {mintQuoteIsEstimate ? <span className="wc-mint-summary-note">{t("mint.estimateNote")}</span> : null}
                </p>
                <div className="wc-mint-actions">
                  <TxButton className="wc-btn-gold-ghost" idleLabel={t("buttons.approve")} state={buttonState("approve")} onClick={() => void handleApprove()} disabled={!canPrepareMint || !needsApproval || loading} />
                  <TxButton className="wc-btn-gold" idleLabel={t("buttons.mint")} state={buttonState("mint")} onClick={() => void handleMint()} disabled={!canPrepareMint || needsApproval || loading || priceUnavailable || mintCountTooLarge} />
                </div>
              </div>
              {priceUnavailable ? <Alert tone="info" className="mt-2 py-2 text-xs">{t("notices.priceUnavailable")}</Alert> : null}
              {mintCountTooLarge ? <Alert tone="warning" className="mt-2 py-2 text-xs">{t("errors.batchTooLarge", undefined, { max: String(STAMP_BATCH_MAX) })}</Alert> : null}
            </>
          ) : (
            <>
              <div className="wc-market-toolbar">
                <Input
                  value={marketSearch}
                  onChange={(e) => setMarketSearch(e.target.value)}
                  placeholder={t("market.search")}
                  className="wc-input wc-market-search h-8 text-xs"
                />
                <div className="wc-market-controls">
                  <div className="wc-market-group">
                    <span className="wc-market-group-label">{t("market.filterLabel")}</span>
                    <div className="wc-market-chips">
                      {(["all", "minted", "empty"] as const).map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setMarketFilter(key)}
                          className={["wc-chip", marketFilter === key ? "wc-chip-active" : ""].join(" ")}
                        >
                          {key === "all" ? t("market.filterAll") : key === "minted" ? t("market.filterMinted") : t("market.filterEmpty")}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="wc-market-group">
                    <span className="wc-market-group-label">{t("market.sortLabel")}</span>
                    <div className="wc-market-chips">
                      {(["heat", "minted", "price"] as const).map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setMarketSort(key)}
                          className={["wc-chip", marketSort === key ? "wc-chip-active" : ""].join(" ")}
                        >
                          {key === "heat" ? t("market.sortHeat") : key === "minted" ? t("market.sortMinted") : t("market.sortPrice")}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="wc-market-table-wrap">
                {filteredMarketTeams.length === 0 ? (
                  <p className="wc-market-empty">{t("market.empty")}</p>
                ) : (
                  <table className="w-full min-w-[520px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="h-9 border-b border-[var(--wc-border)] bg-[rgba(255,255,255,.02)] text-[10px] uppercase tracking-wide text-[var(--wc-body)]">
                        <th className="px-2 py-2 font-medium">{t("market.colCode")}</th>
                        <th className="px-2 py-2 font-medium">{t("market.colNation")}</th>
                        <th className="px-2 py-2 text-right font-medium">{t("market.colMinted")}</th>
                        <th className="px-2 py-2 text-right font-medium">{t("market.colPrice", undefined, i18nToken)}</th>
                        <th className="px-2 py-2 font-medium">{t("market.colHeat")}</th>
                        <th className="px-2 py-2 font-medium">{t("market.colTrend")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMarketTeams.map((row) => {
                        const heat = maxTeamMinted > 0n ? Number((row.minted * 100n) / maxTeamMinted) : 0;
                        const selected = selectedTeamId === row.teamId;
                        return (
                          <tr
                            key={row.teamId}
                            className={["wc-tape-row h-9 cursor-pointer", selected ? "wc-tape-row-selected" : ""].join(" ")}
                            onClick={() => {
                              setSelectedTeamId(row.teamId);
                              setMintView("select");
                            }}
                          >
                            <td className="px-2 py-2 font-mono text-[11px]">{TEAM_CODES[row.teamId]}</td>
                            <td className="max-w-[8rem] truncate px-2 py-2">{teamNameLabel(t, row.teamId)}</td>
                            <td className="wc-num px-2 py-2 text-right text-[var(--wc-text)]">{row.minted.toString()}</td>
                            <td className={["wc-num px-2 py-2 text-right", selected ? "text-[var(--wc-gold)]" : "text-[var(--wc-text)]"].join(" ")}>
                              {row.price > 0n ? formatTokenAmount(row.price, tokenDecimals, 2) : t("labels.unavailable")}
                            </td>
                            <td className="px-2 py-2">
                              <HeatBlocks heat={heat} />
                            </td>
                            <td className="px-2 py-2">
                              {row.trend === "up" ? (
                                <span className="wc-num wc-trend-up">{t("market.trendUp", undefined, { count: row.mintDelta.toString() })}</span>
                              ) : row.trend === "flat" ? (
                                <span className="wc-trend-flat">{t("market.trendFlat")}</span>
                              ) : (
                                <span className="wc-trend-unknown">{t("market.trendUnknown")}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </SectionBlock>

        <SectionBlock title={t("sections.holdings")}>
          {!context.userAddress ? (
            <p className="text-sm text-[var(--wc-muted)]">{t("holdings.connect")}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--wc-body)]">
                <p>
                  {t("holdings.tokenBalance", undefined, i18nToken)}{" "}
                  <span className="wc-num font-medium text-[var(--wc-text)]">
                    {formatTokenAmount(snapshot?.walletBalance ?? snapshot?.myTokenBalance, tokenDecimals, 4)}
                  </span>
                </p>
                <p>
                  {t("holdings.mintSpent", undefined, i18nToken)}{" "}
                  <span className="wc-num font-medium text-[var(--wc-text)]">
                    {formatTokenAmount(snapshot?.myMintSpent, tokenDecimals, 4)}
                  </span>
                </p>
                <p>
                  {t("holdings.stampCount")}{" "}
                  <span className="wc-num font-medium text-[var(--wc-text)]">{myStampTotal.toString()}</span>
                </p>
              </div>
              {myStampTotal > 0n ? (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {(snapshot?.myStamps ?? []).map((count, teamId) =>
                    count > 0n ? (
                      <button
                        key={teamId}
                        type="button"
                        onClick={() => {
                          setSelectedTeamId(teamId);
                          setMintView("select");
                        }}
                        className="text-sm text-[var(--wc-text)] transition-opacity hover:opacity-70"
                      >
                        <span className="text-[var(--wc-cell-zh)]">{teamNameLabel(t, teamId)}</span>{" "}
                        <span className="wc-num text-[var(--wc-cell-en)]">{TEAM_CODES[teamId]}</span>{" "}
                        <span className="wc-num">×{count.toString()}</span>
                      </button>
                    ) : null,
                  )}
                </div>
              ) : (
                <p className="text-sm text-[var(--wc-muted)]">{t("holdings.emptyTeam")}</p>
              )}
            </div>
          )}
        </SectionBlock>

        <SectionBlock title={t("sections.deflation")}>
          <p className="text-sm leading-relaxed text-[var(--wc-muted)]">{t("deflation.milestoneNote")}</p>
          <div className="wc-pool-grid mt-4">
            <div className="wc-pool-card">
              <p className="wc-caption wc-caption-bright">{t("deflation.mintBurn")}</p>
              <p className="wc-pool-num wc-num mt-2">
                {formatTokenAmount(mintBurnTotal, tokenDecimals, 2)}{" "}
                <span className="text-xs font-normal text-[var(--wc-muted)]">{tokenLabel}</span>
              </p>
            </div>
            <div className="wc-pool-card">
              <p className="wc-caption wc-caption-bright">{t("deflation.royaltyBurn")}</p>
              <p className="wc-pool-num wc-num mt-2">
                {formatTokenAmount(royaltyBurnTotal, tokenDecimals, 2)}{" "}
                <span className="text-xs font-normal text-[var(--wc-muted)]">{tokenLabel}</span>
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-[var(--wc-body)]">
            <span>{t("deflation.progress")}</span>
            <span className="wc-num text-[var(--wc-text)]">{burnProgress.toFixed(2)}%</span>
          </div>
          <div className="mt-2">
            <BurnSegments progress={burnProgress} segments={16} />
          </div>
          <p className="wc-caption wc-caption-bright mt-5">{t("deflation.royaltySection")}</p>
          <div className="wc-pool-grid mt-3">
            <div className="wc-pool-card">
              <p className="wc-caption wc-caption-bright">{t("deflation.royaltyPending")}</p>
              <p className="wc-pool-num wc-num mt-2">
                {formatTokenAmount(snapshot?.pools[2], 18, 4)}{" "}
                <span className="text-xs font-normal text-[var(--wc-muted)]">{paymentSymbol}</span>
              </p>
            </div>
            <div className="wc-pool-card">
              <p className="wc-caption wc-caption-bright">{t("deflation.royaltyReceived")}</p>
              <p className="wc-pool-num wc-num mt-2">
                {formatTokenAmount(snapshot?.totalRoyaltyReceived, 18, 4)}{" "}
                <span className="text-xs font-normal text-[var(--wc-muted)]">{paymentSymbol}</span>
              </p>
            </div>
            <div className="wc-pool-card">
              <p className="wc-caption wc-caption-bright">{t("deflation.buybackBnb")}</p>
              <p className="wc-pool-num wc-num mt-2">
                {formatTokenAmount(snapshot?.totalBnbBuyback, 18, 4)}{" "}
                <span className="text-xs font-normal text-[var(--wc-muted)]">{paymentSymbol}</span>
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[var(--wc-muted)]">{t("deflation.buybackNote")}</p>
        </SectionBlock>

        <SectionBlock title={t("sections.claim")}>
          {!snapshot?.finalized ? (
            <p className="mb-3 text-sm leading-relaxed text-[var(--wc-body)]">{t("claim.notFinalized")}</p>
          ) : null}
          <p className={["text-sm leading-relaxed text-[var(--wc-body)]", snapshot?.finalized ? "mb-4" : "mb-3"].join(" ")}>
            {t("claim.hint")}
          </p>
          {snapshot?.finalized ? (
            <p className="mb-4 text-[11px] leading-snug text-[var(--wc-muted)]">
              {t("claim.championNote", undefined, { max: String(CLAIM_RANGE_MAX) })}
            </p>
          ) : null}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="wc-claim-hero">
              <p className="wc-caption wc-caption-bright">{t("claim.pending")}</p>
              <NumDisplay value={formatTokenAmount(snapshot?.myPendingReward, 18, 4)} unit={paymentSymbol} size="hero" />
              {context.userAddress && snapshot?.finalized ? (
                <p className="mt-2 text-xs text-[var(--wc-body)]">
                  {t("claim.claimedBnb")}{" "}
                  <span className="wc-num text-[var(--wc-text)]">{formatTokenAmount(snapshot?.myClaimedBnb, 18, 4)}</span>{" "}
                  {paymentSymbol}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:min-w-[14rem] sm:items-end">
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <TxButton
                  className="wc-btn-gold"
                  idleLabel={t("buttons.claimAll")}
                  state={buttonState("claim")}
                  onClick={() => void handleClaimAll()}
                  disabled={Boolean(claimStageError()) || loading}
                />
                <TxButton
                  className="wc-btn-gold-ghost"
                  idleLabel={t("buttons.claimBatch")}
                  state={buttonState("claimBatch")}
                  onClick={() => void handleClaimBatch()}
                  disabled={
                    Boolean(claimStageError()) ||
                    loading ||
                    myStampTotal <= BigInt(CLAIM_RANGE_MAX) ||
                    claimRangeStart >= myStampTotal
                  }
                />
              </div>
              <p className="text-sm leading-relaxed text-[var(--wc-muted)]">{t("claim.allHint", undefined, { max: String(CLAIM_RANGE_MAX) })}</p>
              <p className="text-sm leading-relaxed text-[var(--wc-muted)]">
                {t("claim.batchLargeOnly", undefined, { max: String(CLAIM_RANGE_MAX) })}
              </p>
              {needsBatchClaim && claimRangeStart < myStampTotal ? (
                <p className="text-sm leading-relaxed text-[var(--wc-body)]">
                  {t("claim.batchHint", undefined, {
                    start: String(claimRangeStart + 1n),
                    end: batchClaimEnd.toString(),
                    total: myStampTotal.toString(),
                    max: String(CLAIM_RANGE_MAX),
                  })}
                </p>
              ) : null}
            </div>
          </div>
        </SectionBlock>

        <SectionBlock title={t("sections.settlement")}>
          {snapshot?.finalized ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-[var(--wc-body)]">{t("settlement.done")}</p>
              {settlementChampionLabel ? (
                <p className="text-sm text-[var(--wc-body)]">
                  {t("settlement.champion")}{" "}
                  <span className="font-medium text-[var(--wc-gold)]">{settlementChampionLabel}</span>
                </p>
              ) : null}
              <p className="text-sm leading-relaxed text-[var(--wc-muted)]">{t("settlement.after")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-[var(--wc-muted)]">{t("settlement.intro")}</p>
                <p className="text-sm leading-relaxed text-[var(--wc-body)]">{t("settlement.after")}</p>
                {!mintClosedByDeadline ? (
                  <p className="text-sm leading-relaxed text-[var(--wc-muted)]">{t("settlement.waitDeadline")}</p>
                ) : snapshot?.viewerResolved === false ? (
                  <p className="text-sm leading-relaxed text-[var(--wc-muted)]">{t("settlement.viewerPending")}</p>
                ) : snapshot?.viewerResolved && snapshot.viewerWinnerName ? (
                  <p className="text-sm leading-relaxed text-[var(--wc-body)]">
                    {t("settlement.viewerReady")}{" "}
                    <span className="text-[var(--wc-gold)]">{snapshot.viewerWinnerName}</span>
                  </p>
                ) : null}
              </div>
              <TxButton
                className="wc-btn-gold shrink-0"
                idleLabel={t("buttons.freeze")}
                state={buttonState("freeze")}
                onClick={() => void handleFreeze()}
                disabled={Boolean(freezeStageError()) || loading}
              />
            </div>
          )}
        </SectionBlock>

        <SectionBlock title={t("sections.flywheel")}>
          <div className="wc-rule-flywheel-bridge">
            <p className="wc-flywheel-headline">{t("flywheel.headline")}</p>
            <p className="wc-flywheel-intro">{t("flywheel.intro")}</p>
          </div>
          <div className="wc-rule-grid mt-4">
            <RuleCard label={t("flywheel.mintBurnLabel")} body={t("flywheel.mintBurn", undefined, { tokenSymbol: tokenLabel })} />
            <RuleCard label={t("flywheel.eliminationLabel")} body={t("flywheel.elimination", undefined, { tokenSymbol: tokenLabel })} />
            <RuleCard label={t("flywheel.secondaryLabel")} body={t("flywheel.secondary", undefined, { tokenSymbol: tokenLabel })} />
            <RuleCard label={t("flywheel.floorLabel")} body={t("flywheel.floor")} />
            <RuleCard label={t("flywheel.momentumLabel")} body={t("flywheel.momentum", undefined, { tokenSymbol: tokenLabel })} wide />
          </div>
        </SectionBlock>
      </div>
    </>
  );
}
