"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import flapLogoAsset from "./assets/flap-logo.png";
import { ArenaWorld, type ArenaInput } from "./scene/ArenaWorld";
import { ControlButton } from "./scene/ControlButton";

type Renderer = "webgl2" | "webgl1" | "2d";
type RenderState = "loading" | "ready" | "fallback" | "error";
type GamePhase = "briefing" | "playing" | "complete";

const TOTAL_CORES = 7;
const EMPTY_INPUT: ArenaInput = { forward: false, backward: false, left: false, right: false, boost: false };
const KEYBOARD_INPUTS: Record<string, keyof ArenaInput> = {
  ArrowUp: "forward",
  KeyW: "forward",
  ArrowDown: "backward",
  KeyS: "backward",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ShiftLeft: "boost",
  ShiftRight: "boost",
  Space: "boost",
};

export default function FlapGamefiArena(_props: VaultComponentProps) {
  const { i18n, wallet } = useFlapSdk();
  const t = i18n.t;
  const rootRef = useRef<HTMLDivElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<ArenaInput>({ ...EMPTY_INPUT });
  const [renderer, setRenderer] = useState<Renderer>("webgl2");
  const [renderState, setRenderState] = useState<RenderState>("loading");
  const [phase, setPhase] = useState<GamePhase>("briefing");
  const [collectedIds, setCollectedIds] = useState<number[]>([]);
  const [boosting, setBoosting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [runId, setRunId] = useState(0);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [playerPosition, setPlayerPosition] = useState({ x: 0, z: 0 });
  const logoUrl = typeof flapLogoAsset === "string" ? flapLogoAsset : flapLogoAsset.src;
  const progress = Math.round((collectedIds.length / TOTAL_CORES) * 100);

  const setInput = useCallback((key: keyof ArenaInput, active: boolean) => {
    inputRef.current[key] = active;
    if (key === "boost") setBoosting(active);
  }, []);

  const resetInputs = useCallback(() => {
    inputRef.current = { ...EMPTY_INPUT };
    setBoosting(false);
  }, []);

  const startRun = useCallback(() => {
    resetInputs();
    setCollectedIds([]);
    setPlayerPosition({ x: 0, z: 0 });
    setRunId((value) => value + 1);
    setPhase("playing");
    rootRef.current?.focus();
  }, [resetInputs]);

  const collectCore = useCallback((id: number) => {
    setCollectedIds((current) => {
      if (current.includes(id)) return current;
      const next = [...current, id];
      if (next.length === TOTAL_CORES) setPhase("complete");
      return next;
    });
  }, []);

  useEffect(() => {
    const probe = document.createElement("canvas");
    const supportsWebGL2 = Boolean(probe.getContext("webgl2"));
    setRenderer(supportsWebGL2 ? "webgl2" : "2d");
    setRenderState(supportsWebGL2 ? "loading" : "fallback");

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(motionQuery.matches);
    const onMotionChange = () => setReducedMotion(motionQuery.matches);
    motionQuery.addEventListener("change", onMotionChange);

    let resizeFrame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        setLayoutRevision((value) => value + 1);
      });
    });
    if (rootRef.current) observer.observe(rootRef.current);

    return () => {
      observer.disconnect();
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  useEffect(() => {
    if (renderer !== "2d" || !fallbackCanvasRef.current) return;
    const canvas = fallbackCanvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = width;
    canvas.height = height;
    const backdrop = context.createRadialGradient(width * 0.5, height * 0.45, 0, width * 0.5, height * 0.45, Math.max(width, height) * 0.72);
    backdrop.addColorStop(0, "#37206b");
    backdrop.addColorStop(0.44, "#101433");
    backdrop.addColorStop(1, "#050711");
    context.fillStyle = backdrop;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(131,104,255,0.34)";
    context.lineWidth = Math.max(1, dpr);
    for (let radius = 0.16; radius < 0.72; radius += 0.11) {
      context.beginPath();
      context.ellipse(width * 0.5, height * 0.53, width * radius, height * radius * 0.48, 0, 0, Math.PI * 2);
      context.stroke();
    }
    for (let index = 0; index < TOTAL_CORES; index += 1) {
      const angle = (index / TOTAL_CORES) * Math.PI * 2 - 0.7;
      const x = width * 0.5 + Math.cos(angle) * width * 0.28;
      const y = height * 0.53 + Math.sin(angle) * height * 0.2;
      context.save();
      context.translate(x, y);
      context.rotate(Math.PI / 4);
      context.shadowColor = "#73f5ff";
      context.shadowBlur = 18 * dpr;
      context.fillStyle = "#8bf8ff";
      context.fillRect(-7 * dpr, -7 * dpr, 14 * dpr, 14 * dpr);
      context.restore();
    }
  }, [layoutRevision, renderer]);

  return (
    <div
      ref={rootRef}
      className="relative h-screen min-h-screen w-full overflow-hidden bg-[#050711] text-white [overflow-anchor:none]"
      tabIndex={0}
      onKeyDown={(event) => {
        const key = KEYBOARD_INPUTS[event.code];
        if (!key || phase !== "playing") return;
        event.preventDefault();
        setInput(key, true);
      }}
      onKeyUp={(event) => {
        const key = KEYBOARD_INPUTS[event.code];
        if (!key) return;
        event.preventDefault();
        setInput(key, false);
      }}
      onBlur={resetInputs}
      data-flap-3d-state={renderState}
      data-flap-3d-renderer={renderer}
      data-flap-reduced-motion={reducedMotion ? "true" : "false"}
      data-flap-game-state={phase}
      data-flap-game-score={collectedIds.length}
      data-flap-player-x={playerPosition.x.toFixed(2)}
      data-flap-player-z={playerPosition.z.toFixed(2)}
    >
      <main className="absolute inset-0" aria-label={t("canvasLabel")}>
        {renderer === "webgl2" && renderState !== "error" ? (
          <Canvas
            dpr={[1, 2]}
            camera={{ position: [7.5, 8.4, 9.5], fov: 48, near: 0.1, far: 120 }}
            gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener(
                "webglcontextlost",
                (event) => {
                  event.preventDefault();
                  resetInputs();
                  setRenderState("error");
                },
                { once: true },
              );
              setRenderState("ready");
            }}
          >
            <Suspense fallback={null}>
              <ArenaWorld
                key={runId}
                phase={phase}
                inputRef={inputRef}
                collectedIds={collectedIds}
                reducedMotion={reducedMotion}
                onCollect={collectCore}
                onPlayerPosition={setPlayerPosition}
              />
            </Suspense>
          </Canvas>
        ) : (
          <canvas ref={fallbackCanvasRef} className="h-full w-full" aria-label={t("fallbackCanvasLabel")} />
        )}
      </main>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col p-3 sm:p-5 lg:p-7">
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 rounded-full border border-white/15 bg-[#080a19]/72 py-2 pl-2 pr-3 shadow-2xl backdrop-blur-xl sm:gap-3 sm:pr-4">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white">
              <img src={logoUrl} alt={t("logoAlt")} className="h-7 w-7 object-contain" />
            </span>
            <span>
              <span className="block text-[9px] font-black uppercase tracking-[0.27em] text-[#a995ff] sm:text-[10px]">{t("brandEyebrow")}</span>
              <span className="block whitespace-nowrap text-xs font-semibold sm:text-sm">{t("showcaseOnly")}</span>
            </span>
          </div>

          <div className="rounded-2xl border border-white/15 bg-[#080a19]/72 px-3 py-2 text-right shadow-2xl backdrop-blur-xl sm:px-4 sm:py-3">
            <span className="block text-[9px] font-black uppercase tracking-[0.24em] text-white/45 sm:text-[10px]">{t("coresLabel")}</span>
            <span className="mt-0.5 block font-mono text-xl font-black text-[#8cf8ff] sm:text-2xl" data-testid="arena-score">
              {collectedIds.length}<span className="text-sm text-white/35">/{TOTAL_CORES}</span>
            </span>
          </div>
        </header>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10 sm:mx-auto sm:max-w-md">
          <div className="h-full rounded-full bg-gradient-to-r from-[#7f5cff] via-[#c06cff] to-[#72f5ff] shadow-[0_0_18px_rgba(114,245,255,0.8)] transition-[width]" style={{ width: `${progress}%` }} />
        </div>

        {wallet.isWrongNetwork ? (
          <p className="mx-auto mt-3 max-w-lg rounded-full border border-amber-300/35 bg-amber-950/75 px-4 py-2 text-center text-xs text-amber-100 backdrop-blur-md">
            {t("wrongNetwork")}
          </p>
        ) : null}

        {renderState === "fallback" ? (
          <div className="pointer-events-auto mx-auto mt-auto mb-auto max-w-md rounded-[28px] border border-white/15 bg-[#080a19]/82 p-6 text-center shadow-2xl backdrop-blur-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#8cf8ff]">{t("fallbackKicker")}</p>
            <h1 className="mt-3 text-3xl font-black uppercase tracking-[-0.04em]">{t("fallbackTitle")}</h1>
            <p className="mt-3 text-sm leading-6 text-white/65">{t("fallback")}</p>
          </div>
        ) : null}

        {renderState === "error" ? (
          <div className="pointer-events-auto mx-auto mt-auto mb-auto max-w-md rounded-[28px] border border-red-300/25 bg-red-950/85 p-6 text-center shadow-2xl backdrop-blur-xl">
            <p className="text-sm leading-6 text-red-100">{t("error")}</p>
          </div>
        ) : null}

        {renderState !== "fallback" && renderState !== "error" && phase === "briefing" ? (
          <section className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.36em] text-[#9ff9ff] sm:text-xs">{t("introKicker")}</p>
            <h1 className="max-w-4xl text-5xl font-black uppercase leading-[0.82] tracking-[-0.065em] drop-shadow-[0_10px_34px_rgba(3,4,16,0.8)] sm:text-7xl lg:text-[6.5rem]">
              <span className="block">{t("titleLine1")}</span>
              <span className="block bg-gradient-to-r from-[#a890ff] via-[#e2a4ff] to-[#8cf8ff] bg-clip-text text-transparent">{t("titleLine2")}</span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/70 sm:text-base">{t("subtitle")}</p>
            <button
              type="button"
              onClick={startRun}
              className="mt-7 min-w-52 rounded-full border border-white/30 bg-white px-8 py-4 text-sm font-black uppercase tracking-[0.22em] text-[#171126] shadow-[0_20px_65px_rgba(126,89,255,0.45)] transition hover:-translate-y-0.5 hover:bg-[#f2edff]"
            >
              {t("start")}
            </button>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">{t("controlsHint")}</p>
          </section>
        ) : null}

        {renderState !== "fallback" && renderState !== "error" && phase === "complete" ? (
          <section className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-[#070817]/35 px-4 text-center backdrop-blur-[3px]">
            <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#8cf8ff] sm:text-xs">{t("completeKicker")}</p>
            <h1 className="mt-3 text-5xl font-black uppercase leading-none tracking-[-0.055em] sm:text-7xl">{t("completeTitle")}</h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-white/70 sm:text-base">{t("completeCopy")}</p>
            <button type="button" onClick={startRun} className="mt-7 rounded-full bg-white px-8 py-4 text-sm font-black uppercase tracking-[0.2em] text-[#171126] shadow-2xl transition hover:-translate-y-0.5">
              {t("playAgain")}
            </button>
          </section>
        ) : null}

        {phase === "playing" && renderState === "ready" ? (
          <section className="mt-auto flex items-end justify-between gap-3" aria-label={t("touchControlsLabel")}>
            <div className="pointer-events-auto grid w-[150px] grid-cols-3 gap-1.5 sm:w-[174px] sm:gap-2" data-testid="arena-direction-controls">
              <span />
              <ControlButton label={t("moveForward")} glyph="↑" onChange={(active) => setInput("forward", active)} />
              <span />
              <ControlButton label={t("moveLeft")} glyph="←" onChange={(active) => setInput("left", active)} />
              <ControlButton label={t("moveBackward")} glyph="↓" onChange={(active) => setInput("backward", active)} />
              <ControlButton label={t("moveRight")} glyph="→" onChange={(active) => setInput("right", active)} />
            </div>

            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <div className="hidden rounded-2xl border border-white/10 bg-[#080a19]/64 px-3 py-2 text-right backdrop-blur-md sm:block">
                <span className="block text-[9px] font-black uppercase tracking-[0.22em] text-white/40">{t("coordinatesLabel")}</span>
                <span className="font-mono text-xs text-white/70">X {playerPosition.x.toFixed(1)} · Z {playerPosition.z.toFixed(1)}</span>
              </div>
              <ControlButton
                label={t("boost")}
                glyph={t("boostGlyph")}
                active={boosting}
                large
                onChange={(active) => setInput("boost", active)}
              />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
