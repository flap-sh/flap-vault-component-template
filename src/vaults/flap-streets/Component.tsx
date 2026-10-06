"use client";
/* eslint-disable @next/next/no-img-element -- The artifact runtime uses bundled asset URLs, not Next Image. */

import { Canvas } from "@react-three/fiber";
import { Component as ReactComponent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CarFront, Flag, Navigation, Pause, Play, RotateCcw, Volume2, VolumeX, Zap } from "lucide-react";
import { useFlapSdk, type VaultComponentProps } from "@/src/sdk";
import { City } from "./City";
import flapLogoAsset from "./assets/flap-logo.png";
import engineUrl from "./engine.wav";
import tiresUrl from "./tires.wav";
import impactUrl from "./impact.wav";
import musicUrl from "./music.wav";
import sirenUrl from "./siren.wav";
import checkpointUrl from "./checkpoint.wav";
import { useDrivingSound } from "./sound";
import { DURATION, emptyInput, newDrive, scoreDrive, stepDrive, type Drive, type Input } from "./driving";

import { MAPS, MAP_IDS, ROADS, PEDESTRIAN_COUNT, pedestrianAt, trafficAt, type MapId } from "./world";

const KEY_MAP: Record<string, keyof Input> = { KeyR: "lookBack", KeyW: "forward", ArrowUp: "forward", KeyS: "reverse", ArrowDown: "reverse", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", Space: "brake", ShiftLeft: "boost", ShiftRight: "boost" };
const rendererOptions = { antialias: false, alpha: false };
const panel = "rounded-xl border border-white/10 bg-[#1A1B1F]/95";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#1f2937] px-4 text-sm font-semibold hover:bg-[#303c4e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7850ff]";

class SceneBoundary extends ReactComponent<{ children: ReactNode; fallback: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function MapCanvas({ drive, active, map, full = false, label }: { drive: RefObject<Drive>; active: boolean; map: MapId; full?: boolean; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let lastDraw = -Infinity;
    let size = 224;
    const draw = (time: number) => {
      if (active) frame = window.requestAnimationFrame(draw);
      if (time - lastDraw < 75) return;
      lastDraw = time;
      const scale = size / 224;
      ctx.setTransform(scale, 0, 0, scale, size / 2, size / 2);
      ctx.fillStyle = "#10151b"; ctx.fillRect(-112, -112, 224, 224);
      ctx.fillStyle = "#313b48";
      ROADS.forEach((r) => { ctx.fillRect(r - 7, -110, 14, 220); ctx.fillRect(-110, r - 7, 220, 14); });
      const s = drive.current;
      ctx.fillStyle = s.map === "coast" ? "#baa58d" : "#52616b";
      MAPS[s.map].buildings.forEach((b) => ctx.fillRect(b.x - b.width / 2, b.z - b.depth / 2, b.width, b.depth));
      MAPS[s.map].checkpoints.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.z, i === s.checkpoint ? 6 : 3, 0, Math.PI * 2);
        ctx.fillStyle = i < s.checkpoint ? "#9ca3af" : i === s.checkpoint ? "#ad8dff" : "#635079"; ctx.fill();
      });
      if (full) Array.from({ length: 10 }, (_, i) => {
        const p = trafficAt(s.elapsed, i, s.map); ctx.save(); ctx.translate(p.x, p.z); ctx.rotate(-p.yaw);
        ctx.fillStyle = "#d5b572"; ctx.fillRect(-1, -2, 2, 4); ctx.restore();
      });
      if (full) Array.from({ length: PEDESTRIAN_COUNT }, (_, i) => { const p = pedestrianAt(s.elapsed, i, s.map, s); ctx.fillStyle = "#f1be94"; ctx.beginPath(); ctx.arc(p.x, p.z, 0.85, 0, Math.PI * 2); ctx.fill(); });
      if (s.police.active) { ctx.save(); ctx.translate(s.police.x, s.police.z); ctx.rotate(-s.police.yaw); ctx.fillStyle = "#f0f4ff"; ctx.fillRect(-1.8, -2.7, 3.6, 5.4); ctx.fillStyle = "#f45876"; ctx.fillRect(-1.8, -0.7, 1.8, 1.4); ctx.fillStyle = "#4eafff"; ctx.fillRect(0, -0.7, 1.8, 1.4); ctx.restore(); }
      ctx.save(); ctx.translate(s.x, s.z); ctx.rotate(-s.yaw);
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-3, 4); ctx.lineTo(0, 2); ctx.lineTo(3, 4); ctx.closePath(); ctx.fill(); ctx.restore();
    };
    const resize = () => {
      size = Math.max(1, Math.round(canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1)));
      if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
      window.cancelAnimationFrame(frame); lastDraw = -Infinity;
      draw(performance.now());
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas); resize();
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, [drive, full, active, map]);
  return <canvas ref={ref} width={224} height={224} aria-label={label} role="img" className={full ? "h-auto max-h-full w-full max-w-[700px]" : "h-full w-full"} />;
}

function TouchButton({ label, children, onChange, className = "" }: { label: string; children: ReactNode; onChange: (pressed: boolean) => void; className?: string }) {
  const pulse = useRef<number | null>(null);
  useEffect(() => () => { if (pulse.current !== null) window.clearTimeout(pulse.current); }, []);
  return <button type="button" aria-label={label} className={`${button} h-12 w-12 touch-none select-none whitespace-nowrap !p-0 active:bg-[#6033ff] sm:h-14 sm:w-14 ${className}`}
    onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onChange(true); }}
    onPointerUp={() => onChange(false)} onPointerCancel={() => onChange(false)} onLostPointerCapture={() => onChange(false)}
    onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(true); } }}
    onKeyUp={() => onChange(false)}
    onClick={(e) => { if (e.detail === 0) { onChange(true); if (pulse.current !== null) window.clearTimeout(pulse.current); pulse.current = window.setTimeout(() => onChange(false), 160); } }}
  >{children}</button>;
}

export default function FlapStreets(_props: VaultComponentProps) {
  const { i18n, wallet } = useFlapSdk();
  const t = i18n.t;
  const mapCopy = {
    downtown: { name: t("map_downtown"), help: t("mapHelp_downtown"), stops: [t("stop_downtown_0"), t("stop_downtown_1"), t("stop_downtown_2"), t("stop_downtown_3")] },
    night: { name: t("map_night"), help: t("mapHelp_night"), stops: [t("stop_night_0"), t("stop_night_1"), t("stop_night_2"), t("stop_night_3")] },
    coast: { name: t("map_coast"), help: t("mapHelp_coast"), stops: [t("stop_coast_0"), t("stop_coast_1"), t("stop_coast_2"), t("stop_coast_3")] },
  };
  const root = useRef<HTMLDivElement>(null);
  const drive = useRef(newDrive());
  const input = useRef(emptyInput());
  const [view, setView] = useState<Drive>({ ...drive.current });
  const [renderer, setRenderer] = useState<"webgl2" | "2d">("webgl2");
  const [ready, setReady] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [quality, setQuality] = useState<"low" | "high">("low");
  const sound = useDrivingSound();
  const audioTick = sound.tick;
  const logoUrl = typeof flapLogoAsset === "string" ? flapLogoAsset : flapLogoAsset.src;
  const shop = t("shop"); const shopSub = t("shopSub");
  const labels = useMemo(() => [shop, shopSub], [shop, shopSub]);
  const clearInput = useCallback(() => { input.current = emptyInput(); }, []);
  const fallback = useCallback((lost = false) => { setContextLost(lost); setRenderer("2d"); setReady(true); clearInput(); }, [clearInput]);
  const onReady = useCallback(() => setReady(true), []);
  const publish = () => setView({ ...drive.current });
  const start = () => { sound.pause(); drive.current = { ...newDrive(drive.current.map), phase: "playing" }; sound.start(); clearInput(); publish(); root.current?.focus({ preventScroll: true }); };
  const pause = () => { drive.current.phase = drive.current.phase === "playing" ? "paused" : "playing"; if (drive.current.phase === "playing") sound.begin(); else sound.pause(); clearInput(); publish(); root.current?.focus({ preventScroll: true }); };

  const selectMap = (map: MapId) => { sound.pause(); clearInput(); drive.current = newDrive(map); publish(); };
  const chooseMap = () => { if (drive.current.phase === "playing") pause(); };

  useEffect(() => {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    if (!gl) fallback();
    else gl.getExtension("WEBGL_lose_context")?.loseContext();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [fallback]);

  useEffect(() => {
    if (view.phase !== "playing") return;
    let frame = 0;
    let previous: number | null = null;
    let lastPublish = 0;
    const tick = (now: number) => {
      const dt = previous === null ? 0 : (now - previous) / 1000;
      previous = now;
      const oldPhase = drive.current.phase;
      // A visibility gap pauses rather than consuming the player's timer.
      if (dt > 0.5 && drive.current.phase === "playing") { drive.current.phase = "paused"; input.current = emptyInput(); }
      const oldCheckpoint = drive.current.checkpoint;
      const oldBumps = drive.current.bumps;
      stepDrive(drive.current, input.current, dt);
      audioTick(drive.current, oldBumps, oldCheckpoint);
      if (now - lastPublish > 100 || drive.current.phase !== oldPhase || drive.current.checkpoint !== oldCheckpoint || drive.current.bumps !== oldBumps) {
        lastPublish = now; setView({ ...drive.current });
      }
      if (drive.current.phase === "playing") frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [audioTick, view.phase]);

  const playing = view.phase === "playing";
  const over = view.phase === "complete" || view.phase === "timeout" || view.phase === "busted";
  const time = Math.max(0, Math.ceil(DURATION - view.elapsed));
  const checkpoint = MAPS[view.map].checkpoints[view.checkpoint];
  const meters = checkpoint ? Math.round(Math.hypot(checkpoint.x - view.x, checkpoint.z - view.z)) : 0;
  const heading = checkpoint ? Math.atan2(checkpoint.x - view.x, -(checkpoint.z - view.z)) + view.yaw : 0;
  const fallbackNode = <div className="absolute inset-0 flex items-center justify-center bg-[#070808] p-6"><MapCanvas drive={drive} active={playing} map={view.map} full label={t("map")} /></div>;

  return <div ref={root} tabIndex={0} className="relative h-screen min-h-screen w-full overflow-hidden bg-[#070808] text-[#f9fafb] outline-none [font-family:ui-rounded,-apple-system,BlinkMacSystemFont,Segoe_UI,sans-serif]"
    data-flap-3d-state={contextLost ? "error" : ready ? renderer === "2d" ? "fallback" : "ready" : "loading"} data-flap-3d-renderer={renderer} data-flap-reduced-motion={String(reducedMotion)}
    data-flap-game-state={view.phase} data-flap-game-score={view.checkpoint} data-flap-player-x={view.x.toFixed(2)} data-flap-player-z={view.z.toFixed(2)}
    data-flap-map={view.map} data-flap-police={String(view.police.active)} data-flap-pedestrians={PEDESTRIAN_COUNT} data-flap-escaped={view.escaped} data-flap-game-bumps={view.bumps} data-flap-game-speed={view.speed.toFixed(2)} data-flap-audio-enabled={String(sound.enabled)}
    onBlur={(e) => { clearInput(); if (!e.currentTarget.contains(e.relatedTarget) && drive.current.phase === "playing") { drive.current.phase = "paused"; sound.pause(); publish(); } }}
    onKeyDown={(e) => {
      if (e.code === "Escape" && (drive.current.phase === "playing" || drive.current.phase === "paused")) { e.preventDefault(); if (!e.repeat) pause(); return; }
      const key = KEY_MAP[e.code]; if (key && drive.current.phase === "playing" && e.target === e.currentTarget) { e.preventDefault(); input.current[key] = true; }
    }}
    onKeyUp={(e) => { const key = KEY_MAP[e.code]; if (key) { e.preventDefault(); input.current[key] = false; } }}
  >
    <audio ref={sound.music} src={musicUrl} loop preload="auto" onError={sound.fail} />
    <audio ref={sound.siren} src={sirenUrl} loop preload="auto" onError={sound.fail} />
    <audio ref={sound.engine} src={engineUrl} loop preload="auto" onError={sound.fail} />
    <audio ref={sound.tires} src={tiresUrl} loop preload="auto" onError={sound.fail} />
    <audio ref={sound.impact} src={impactUrl} preload="auto" onError={sound.fail} />
    <audio ref={sound.checkpoint} src={checkpointUrl} preload="auto" onError={sound.fail} />
    <div className="absolute inset-0" onPointerDown={() => root.current?.focus({ preventScroll: true })}>
      {renderer === "webgl2" ? <SceneBoundary fallback={fallbackNode} onError={fallback}>
        <Canvas frameloop={playing ? "always" : "demand"} dpr={quality === "high" ? [1, 1.5] : 1} shadows={quality === "high"} camera={{ position: [16, 10, 49], fov: 58, near: 0.2, far: 280 }} gl={rendererOptions}
          onCreated={({ gl }) => { gl.domElement.addEventListener("webglcontextlost", (event) => { event.preventDefault(); fallback(true); }, { once: true }); }}>
          <City key={view.map} map={view.map} drive={drive} labels={labels} reducedMotion={reducedMotion} onReady={onReady} />
        </Canvas>
      </SceneBoundary> : fallbackNode}
    </div>
    <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/65 to-transparent" />
    <header className="pointer-events-none absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-3 pr-12 sm:inset-x-7">
      <div>
        <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-[#070808]/90 py-2 pl-2 pr-4 font-mono">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white"><img src={logoUrl} alt={t("logoAlt")} className="h-8 w-8 object-contain" /></span>
          <span><span className="block text-[9px] font-black uppercase tracking-[0.27em] text-[#a995ff] sm:text-[10px]">{t("brandEyebrow")}</span><span className="mt-1 block whitespace-nowrap text-xs font-bold sm:text-sm">{t("showcaseOnly")}</span></span>
        </div>
        <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">{t("title")}</h2><p className="mt-1 hidden text-xs text-white/70 sm:block">{mapCopy[view.map].name}</p>
      </div>
      <div className="pointer-events-auto absolute right-0 top-20 flex gap-2 sm:static">
        <button type="button" className={`${button} w-11 !p-0`} onClick={() => { sound.toggle(playing); root.current?.focus({ preventScroll: true }); }} aria-label={t(sound.enabled ? "muteSound" : "enableSound")} title={t(sound.enabled ? "muteSound" : "enableSound")} aria-pressed={sound.enabled}>{sound.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
        <button type="button" className={`${button} px-3`} onClick={() => setQuality((q) => q === "high" ? "low" : "high")} aria-label={t("quality")} aria-pressed={quality === "high"}>{t(quality === "high" ? "high" : "low")}</button>
        {playing && <button type="button" className={`${button} w-11 !p-0`} onClick={chooseMap} aria-label={t("changeMap")} title={t("changeMap")}><Flag size={17} /></button>}
        {playing && <button type="button" className={`${button} w-11 p-0`} onClick={pause} aria-label={t("pause")}><Pause size={17} /></button>}
      </div>
    </header>
    {renderer === "2d" && <div className="absolute inset-x-4 top-36 text-center text-xs text-[#c6b2ff]">{t("fallback")}</div>}
    {sound.failed && <p role="status" className="absolute inset-x-4 bottom-1 text-center text-[11px] text-[#c6b2ff]">{t("audioUnavailable")}</p>}
    {wallet.isWrongNetwork && <p role="status" className="absolute inset-x-4 bottom-2 z-10 mx-auto max-w-lg rounded-lg border border-[#ffd641]/25 bg-[#070808]/95 px-3 py-2 text-center text-[11px] leading-4 text-[#ffd641]">{t("wrongNetwork")}</p>}
    {!ready && <div className="absolute inset-0 grid place-items-center bg-[#070808]"><p role="status">{t("loading")}</p></div>}
    {(view.phase === "briefing" || view.phase === "paused" || over) && ready && <div className="absolute inset-x-0 bottom-4 top-40 flex items-center justify-center px-5 sm:justify-start sm:px-10">
      <section className={`${panel} max-h-full w-full max-w-[370px] overflow-y-auto p-5 shadow-2xl sm:p-6`} aria-label={t("briefing")}>
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[#bca3ff]"><CarFront size={18} />{t("edition")}</div>
        <h3 className="whitespace-pre-line text-3xl font-bold leading-tight">{t(view.phase === "paused" ? "paused" : view.phase === "complete" ? "complete" : view.phase === "busted" ? "busted" : view.phase === "timeout" ? "timeout" : "introTitle")}</h3>
        <p className="mt-3 text-sm leading-6 text-[#9ca3af]">{t(view.phase === "paused" ? "pauseHelp" : view.phase === "busted" ? "bustedHelp" : over ? "resultHelp" : "introHelp")}</p>
        {over ? <div className="my-5 flex items-baseline gap-3"><strong className="font-mono text-4xl">{scoreDrive(view)}</strong><span className="text-sm text-[#9ca3af]">{t("points")}</span></div> : <div className="my-3 flex gap-5 border-y border-white/10 py-2 text-sm"><span><strong className="mr-2 text-lg">4</strong>{t("stops")}</span><span><strong className="mr-2 text-lg">3</strong>{t("minutes")}</span></div>}
        <label className="mb-3 block text-xs text-[#9ca3af]">{t("chooseMap")}
          <select aria-label={t("chooseMap")} value={view.map} onChange={(e) => selectMap(e.target.value as MapId)} className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-[#1f2937] px-3 text-sm text-white focus:outline-[#7850ff]">{MAP_IDS.map((id) => <option key={id} value={id}>{mapCopy[id].name}</option>)}</select>
          <span className="mt-1.5 block leading-4">{mapCopy[view.map].help}</span>
          {view.phase === "paused" && <span className="mt-1 block text-[#bca3ff]">{t("mapReset")}</span>}
        </label>
        <button type="button" onClick={view.phase === "paused" ? pause : start} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#6033ff] px-4 text-sm font-bold hover:bg-[#7750ff]">{over ? <RotateCcw size={17} /> : <Play size={17} />}{t(view.phase === "paused" ? "resume" : over ? "again" : "start")}</button>
        <p className="mt-3 text-xs leading-5 text-[#9ca3af]">{t("controls")}</p><p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-[#9ca3af]">{t("localNote")}</p>
        <p className="mt-2 text-[11px] text-[#bca3ff]">{t("soundHint")}</p>
      </section>
    </div>}
    {playing && <>
      <div className={`${panel} pointer-events-none absolute left-4 top-44 flex max-w-[calc(100%-32px)] items-center gap-4 px-4 py-3 sm:left-7`}>
        <Navigation size={23} style={{ transform: `rotate(${heading}rad)` }} className="shrink-0 text-[#bca3ff]" />
        <div><p className="text-[10px] uppercase tracking-widest text-[#9ca3af]">{t("nextStop")} {Math.min(4, view.checkpoint + 1)} / 4</p><p className="mt-1 text-sm font-semibold">{mapCopy[view.map].stops[Math.min(3, view.checkpoint)]}<span className="ml-3 font-mono text-[#bca3ff]">{meters}{t("meters")}</span></p></div>
        <span className="border-l border-white/10 pl-4 font-mono text-xl">{Math.floor(time / 60)}:{String(time % 60).padStart(2, "0")}</span>
      </div>
      {view.police.active && <div className={`${panel} absolute inset-x-4 top-64 max-w-sm border-[#ff637e]/35 px-3 py-2 sm:left-7`}>
        <div className="flex items-center justify-between gap-3"><div><p role="status" className="text-xs font-bold text-[#ff9fb1]">{t(view.police.escape > 0 ? "escaping" : "pursuit")} · {Math.round(Math.hypot(view.police.x - view.x, view.police.z - view.z))}{t("meters")}</p><p className="mt-1 text-[10px] text-[#c3c9d2]">{t(view.police.caught > 0 ? "policeClose" : "policeHelp")}</p></div><TouchButton label={t("rearView")} onChange={(v) => { input.current.lookBack = v; }}><RotateCcw size={18} /></TouchButton></div>
        <div role="progressbar" aria-label={t(view.police.caught > 0 ? "capture" : "escapeProgress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((view.police.caught > 0 ? view.police.caught / 2.5 : view.police.escape / 5) * 100)} className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className={view.police.caught > 0 ? "h-full bg-[#ff637e]" : "h-full bg-[#80ddc1]"} style={{ width: `${(view.police.caught > 0 ? view.police.caught / 2.5 : view.police.escape / 5) * 100}%` }} /></div>
      </div>}
      {!view.police.active && view.escaped > 0 && <p className="pointer-events-none absolute left-4 top-64 text-xs text-[#80ddc1]">{t("escaped")} · {view.escaped}</p>}
      {view.impactAge < 0.8 && <div role="status" className="pointer-events-none absolute inset-x-4 top-[365px] text-center text-sm font-semibold text-[#ffc2a3]">{t("collision")}</div>}
      {!reducedMotion && view.impactAge < 0.3 && <div aria-hidden="true" className="pointer-events-none absolute inset-0 border-[6px] border-[#ffad76]" style={{ opacity: Math.max(0, 0.3 - view.impactAge) * view.impact }} />}
      <div className="pointer-events-none absolute inset-x-4 bottom-48 flex items-end justify-between sm:inset-x-7 sm:bottom-40">
        <div className={`${panel} h-28 w-28 overflow-hidden p-1 sm:h-36 sm:w-36`}><MapCanvas drive={drive} active={playing} map={view.map} label={t("map")} /></div>
        <div className={`${panel} min-w-28 p-4 text-right`}><strong className="font-mono text-4xl tabular-nums">{Math.round(Math.abs(view.speed) * 3.6)}</strong><span className="ml-2 text-[10px] text-[#9ca3af]">{t("speedUnit")}</span><p className="mt-1 flex items-center justify-end gap-2 text-xs text-[#bca3ff]"><Flag size={12} />{view.checkpoint} / 4</p></div>
      </div>
      {playing && <div className={`absolute inset-x-4 flex items-end justify-between gap-3 sm:inset-x-7 ${wallet.isWrongNetwork ? "bottom-16" : "bottom-8"}`}>
        <div className="grid grid-cols-3 gap-1.5"><span /><TouchButton label={t("accelerate")} onChange={(v) => { input.current.forward = v; }}><ArrowUp size={22} /></TouchButton><span />
          <TouchButton label={t("left")} onChange={(v) => { input.current.left = v; }}><ArrowLeft size={22} /></TouchButton>
          <TouchButton label={t("reverse")} onChange={(v) => { input.current.reverse = v; }}><ArrowDown size={22} /></TouchButton>
          <TouchButton label={t("right")} onChange={(v) => { input.current.right = v; }}><ArrowRight size={22} /></TouchButton>
        </div>
        <div className="mb-1 hidden text-center text-xs leading-6 text-white/80 lg:block">{t("controls")}<br />{t("checkpointHelp")}</div>
        <div className="flex flex-col gap-2 sm:flex-row"><TouchButton label={t("boost")} onChange={(v) => { input.current.boost = v; }} className="border-[#7850ff]/60"><Zap size={22} /></TouchButton><TouchButton label={t("brake")} onChange={(v) => { input.current.brake = v; }}><span className="text-[10px]">{t("brake")}</span></TouchButton></div>
      </div>}
    </>}
  </div>;
}
