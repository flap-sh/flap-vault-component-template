"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, StatusBadge } from "@/src/ui";
import localFontUrl from "./assets/kenpixel.ttf";
import { CapabilityScene } from "./scene/Scene";

type Renderer = "webgl2" | "webgl1" | "2d";
type RenderState = "loading" | "ready" | "fallback" | "error";

export default function ThreeR3FExample(_props: VaultComponentProps) {
  const { context, i18n, wallet } = useFlapSdk();
  const t = i18n.t;
  const host = readTaxVaultHostContext(context.host);
  const riskLevel = host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel ?? null;
  const riskLabel =
    riskLevel === 1
      ? t("risk.low")
      : riskLevel === 2
        ? t("risk.lowMedium")
        : riskLevel === 3
          ? t("risk.medium")
          : riskLevel === 4
            ? t("risk.high")
            : riskLevel === 0
              ? t("risk.unverified")
              : t("risk.missing");
  const riskTone = riskLevel === null || riskLevel === 0 || riskLevel >= 4 ? "danger" : riskLevel >= 3 ? "warning" : "success";
  const rootRef = useRef<HTMLDivElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const [renderer, setRenderer] = useState<Renderer>("webgl2");
  const [renderState, setRenderState] = useState<RenderState>("loading");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const probe = document.createElement("canvas");
    const supportsWebGL2 = Boolean(probe.getContext("webgl2"));
    setRenderer(supportsWebGL2 ? "webgl2" : "2d");
    setRenderState(supportsWebGL2 ? "loading" : "fallback");
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", onChange);
    const observer = new ResizeObserver(() => {
      const frame = window.requestAnimationFrame(() => undefined);
      window.cancelAnimationFrame(frame);
    });
    if (rootRef.current) observer.observe(rootRef.current);
    const font = new FontFace("FlapThreeFixture", `url(${localFontUrl})`);
    void font.load().then((loaded) => document.fonts.add(loaded));
    return () => {
      observer.disconnect();
      media.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    if (renderer !== "2d" || !fallbackCanvasRef.current) return;
    const canvas = fallbackCanvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * window.devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * window.devicePixelRatio));
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#111827");
    gradient.addColorStop(1, "#312e81");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }, [renderer]);

  return (
    <div
      ref={rootRef}
      className="w-full space-y-3 bg-slate-950 text-white"
      data-flap-3d-state={renderState}
      data-flap-3d-renderer={renderer}
      data-flap-reduced-motion={reducedMotion ? "true" : "false"}
    >
      <header className="px-5 pb-4 pt-6">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-300">{t("subtitle")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge tone={riskTone}>{riskLabel}</StatusBadge>
        </div>
        {riskLevel === null ? <Alert tone="danger" className="mt-3">{t("risk.missingDescription")}</Alert> : null}
        {wallet.isWrongNetwork ? <p className="mt-2 rounded-xl bg-amber-950/80 p-3 text-sm text-amber-100">{t("wrongNetwork")}</p> : null}
      </header>
      <main className="relative h-[70vh] min-h-[420px] overflow-hidden" aria-label={t("canvasLabel")}>
        {renderer === "webgl2" && renderState !== "error" ? (
          <Canvas
            dpr={[1, 2]}
            camera={{ position: [0, 0, 4.5], fov: 48 }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener("webglcontextlost", (event) => {
                event.preventDefault();
                setRenderState("error");
              }, { once: true });
              setRenderState("ready");
            }}
          >
            <Suspense fallback={null}>
              <CapabilityScene reducedMotion={reducedMotion} />
            </Suspense>
          </Canvas>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <canvas ref={fallbackCanvasRef} className="h-48 w-full max-w-lg rounded-3xl" />
            <p className="text-sm text-slate-300">{t("fallback")}</p>
          </div>
        )}
        {renderState === "error" ? <p className="absolute inset-x-5 bottom-5 rounded-xl bg-red-950/90 p-3 text-sm">{t("error")}</p> : null}
      </main>
    </div>
  );
}
