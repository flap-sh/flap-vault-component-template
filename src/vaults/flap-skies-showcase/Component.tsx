"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import flapLogoAsset from "./assets/flap-logo.png";
import { FlapSkiesWorld, type SkyZone } from "./scene/World";

type Renderer = "webgl2" | "webgl1" | "2d";
type RenderState = "loading" | "ready" | "fallback" | "error";
type ExperiencePhase = "intro" | "explore";

export default function FlapSkiesShowcase(_props: VaultComponentProps) {
  const { i18n, wallet } = useFlapSdk();
  const t = i18n.t;
  const rootRef = useRef<HTMLDivElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const [renderer, setRenderer] = useState<Renderer>("webgl2");
  const [renderState, setRenderState] = useState<RenderState>("loading");
  const [phase, setPhase] = useState<ExperiencePhase>("intro");
  const [selectedZone, setSelectedZone] = useState<SkyZone>("portal");
  const [boosted, setBoosted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const logoUrl = typeof flapLogoAsset === "string" ? flapLogoAsset : flapLogoAsset.src;
  const zoneOptions: Array<{ id: SkyZone; label: string }> = [
    { id: "forest", label: t("zones.forest") },
    { id: "portal", label: t("zones.portal") },
    { id: "summit", label: t("zones.summit") },
  ];

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

    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#07091f");
    sky.addColorStop(0.58, "#241d57");
    sky.addColorStop(1, "#805cff");
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);

    context.fillStyle = "rgba(255,255,255,0.78)";
    for (let index = 0; index < 64; index += 1) {
      const x = ((index * 71) % 997) / 997 * width;
      const y = ((index * 113) % 991) / 991 * height;
      const radius = index % 7 === 0 ? 2.2 * dpr : 1.1 * dpr;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    const planetRadius = Math.min(width, height) * 0.31;
    const centerX = width * 0.5;
    const centerY = height * 0.52;
    const ocean = context.createRadialGradient(
      centerX - planetRadius * 0.35,
      centerY - planetRadius * 0.4,
      planetRadius * 0.08,
      centerX,
      centerY,
      planetRadius,
    );
    ocean.addColorStop(0, "#42dbff");
    ocean.addColorStop(0.52, "#127cb3");
    ocean.addColorStop(1, "#09264f");
    context.fillStyle = ocean;
    context.beginPath();
    context.arc(centerX, centerY, planetRadius, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#63c66d";
    for (let index = 0; index < 9; index += 1) {
      const angle = (index / 9) * Math.PI * 2 + 0.35;
      const distance = planetRadius * (0.28 + (index % 3) * 0.15);
      context.beginPath();
      context.ellipse(
        centerX + Math.cos(angle) * distance,
        centerY + Math.sin(angle) * distance,
        planetRadius * (0.12 + (index % 2) * 0.04),
        planetRadius * 0.08,
        angle,
        0,
        Math.PI * 2,
      );
      context.fill();
    }

    context.strokeStyle = "rgba(180,159,255,0.86)";
    context.lineWidth = Math.max(1, dpr);
    context.setLineDash([10 * dpr, 12 * dpr]);
    context.beginPath();
    context.ellipse(centerX, centerY, planetRadius * 1.42, planetRadius * 0.46, -0.24, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = "#ffffff";
    context.save();
    context.translate(centerX + planetRadius * 1.04, centerY - planetRadius * 0.36);
    context.rotate(-0.28);
    context.fillRect(-18 * dpr, -5 * dpr, 36 * dpr, 10 * dpr);
    context.fillRect(-5 * dpr, -18 * dpr, 10 * dpr, 36 * dpr);
    context.restore();
  }, [layoutRevision, phase, renderer, selectedZone]);

  return (
    <div
      ref={rootRef}
      className="relative h-screen min-h-[620px] w-full overflow-hidden bg-[#07091f] text-white [overflow-anchor:none]"
      data-flap-3d-state={renderState}
      data-flap-3d-renderer={renderer}
      data-flap-reduced-motion={reducedMotion ? "true" : "false"}
      data-flap-skies-phase={phase}
    >
      <main className="absolute inset-0" aria-label={t("canvasLabel")}>
        {renderer === "webgl2" && renderState !== "error" ? (
          <Canvas
            dpr={[1, 2]}
            camera={{ position: [0, 0.45, 7.4], fov: 42 }}
            gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener(
                "webglcontextlost",
                (event) => {
                  event.preventDefault();
                  setRenderState("error");
                },
                { once: true },
              );
              setRenderState("ready");
            }}
          >
            <Suspense fallback={null}>
              <FlapSkiesWorld
                phase={phase}
                selectedZone={selectedZone}
                speed={boosted ? 1.25 : 0.58}
                reducedMotion={reducedMotion}
              />
            </Suspense>
          </Canvas>
        ) : (
          <canvas ref={fallbackCanvasRef} className="h-full w-full" aria-label={t("fallbackCanvasLabel")} />
        )}
      </main>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:gap-3">
          <div className="flex items-center gap-2.5 rounded-full border border-white/15 bg-[#07091f]/55 py-2 pl-2 pr-3 shadow-2xl backdrop-blur-md sm:gap-3 sm:pr-4">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white">
              <img src={logoUrl} alt={t("logoAlt")} className="h-7 w-7 object-contain" />
            </span>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-[#c9bcff]">{t("brandEyebrow")}</span>
              <span className="block whitespace-nowrap text-xs font-semibold tracking-wide sm:text-sm">{t("showcaseOnly")}</span>
            </span>
          </div>

          <div
            aria-hidden={phase !== "explore"}
            className={`flex items-center gap-2 self-end transition-opacity sm:self-auto ${
              phase === "explore" ? "pointer-events-auto opacity-100" : "pointer-events-none invisible opacity-0"
            }`}
          >
              <button
                type="button"
                onClick={() => setBoosted((value) => !value)}
                tabIndex={phase === "explore" ? 0 : -1}
                className="rounded-full border border-white/15 bg-[#07091f]/55 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md transition hover:bg-white/15"
                aria-pressed={boosted}
              >
                {boosted ? t("boost") : t("cruise")}
              </button>
              <button
                type="button"
                onClick={() => setPhase("intro")}
                tabIndex={phase === "explore" ? 0 : -1}
                className="rounded-full border border-white/15 bg-[#07091f]/55 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md transition hover:bg-white/15"
              >
                {t("return")}
              </button>
          </div>
        </header>

        {wallet.isWrongNetwork ? (
          <p className="mx-auto mt-3 max-w-xl rounded-full border border-amber-300/35 bg-amber-950/75 px-4 py-2 text-center text-xs text-amber-100 backdrop-blur-md">
            {t("wrongNetwork")}
          </p>
        ) : null}

        <section
          aria-hidden={phase !== "intro"}
          className={`absolute inset-0 flex flex-col items-center justify-center px-4 text-center transition-opacity duration-300 ${
            phase === "intro" ? "pointer-events-auto opacity-100" : "pointer-events-none invisible opacity-0"
          }`}
        >
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.38em] text-[#d3c9ff] sm:text-xs">{t("introKicker")}</p>
            <h1 className="max-w-5xl text-5xl font-black uppercase leading-[0.82] tracking-[-0.07em] text-white drop-shadow-[0_8px_28px_rgba(4,6,23,0.65)] sm:text-7xl lg:text-[7.4rem]">
              <span className="block">{t("titleLine1")}</span>
              <span className="block bg-gradient-to-r from-white via-[#d9d0ff] to-[#8f75ff] bg-clip-text text-transparent">{t("titleLine2")}</span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/75 sm:text-base">{t("subtitle")}</p>
            <button
              type="button"
              tabIndex={phase === "intro" ? 0 : -1}
              onClick={(event) => {
                event.currentTarget.blur();
                setPhase("explore");
              }}
              className="mt-7 min-w-48 rounded-full border border-white/30 bg-white px-8 py-4 text-sm font-black uppercase tracking-[0.24em] text-[#171233] shadow-[0_18px_55px_rgba(120,89,255,0.38)] transition hover:-translate-y-0.5 hover:bg-[#f3efff]"
            >
              {t("launch")}
            </button>
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{t("dragHint")}</p>
        </section>

        <section
          aria-hidden={phase !== "explore"}
          className={`mt-auto grid gap-3 transition-opacity sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end ${
            phase === "explore" ? "opacity-100" : "pointer-events-none invisible opacity-0"
          }`}
        >
            <div className="max-w-sm rounded-[26px] border border-white/15 bg-[#07091f]/58 p-4 shadow-2xl backdrop-blur-xl sm:p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#b9a7ff]">{t("mission")}</p>
              <h2 className="mt-2 text-xl font-black uppercase tracking-tight">{t("missionTitle")}</h2>
              <p className="mt-1 text-sm leading-5 text-white/65">{t("missionCopy")}</p>
              <div className="mt-4 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full w-[68%] rounded-full bg-gradient-to-r from-[#7d5cff] to-[#52e2ff]" />
                </span>
                <span className="text-xs font-semibold text-white/70">{t("missionProgress")}</span>
              </div>
            </div>

            <div className="pointer-events-auto rounded-[26px] border border-white/15 bg-[#07091f]/58 p-2 shadow-2xl backdrop-blur-xl">
              <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">{t("regionLabel")}</p>
              <div className="grid grid-cols-3 gap-1">
                {zoneOptions.map((zone) => (
                  <button
                    key={zone.id}
                    type="button"
                    tabIndex={phase === "explore" ? 0 : -1}
                    onClick={() => setSelectedZone(zone.id)}
                    aria-pressed={selectedZone === zone.id}
                    className={`rounded-[18px] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] transition ${
                      selectedZone === zone.id ? "bg-white text-[#171233]" : "text-white/60 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {zone.label}
                  </button>
                ))}
              </div>
            </div>
        </section>
      </div>

      {renderState === "fallback" ? (
        <p className="absolute inset-x-4 bottom-4 z-20 mx-auto max-w-xl rounded-2xl border border-white/15 bg-[#07091f]/80 p-3 text-center text-xs text-white/70 backdrop-blur-md">
          {t("fallback")}
        </p>
      ) : null}
      {renderState === "error" ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#07091f]/90 p-6 text-center backdrop-blur-md">
          <p className="max-w-md rounded-3xl border border-red-300/25 bg-red-950/60 p-6 text-sm leading-6 text-red-100">{t("error")}</p>
        </div>
      ) : null}
    </div>
  );
}
