"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { useVaultContext } from "@/src/sdk";
import { useLang } from "@/src/i18n/useLang";

function readExtraString(extraConfig: Record<string, unknown> | undefined, key: string) {
  const value = extraConfig?.[key];
  return typeof value === "string" ? value : undefined;
}

export function MiniAppPreviewFrame({ children }: { children: ReactNode }) {
  const { lang } = useLang();
  const context = useVaultContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const tokenDetailHref = readExtraString(context.extraConfig, "tokenDetailHref") ?? "/";
  const title = lang.preview.miniAppTitle;
  const tab = lang.preview.miniAppTab;
  const fullscreenLabel = isFullscreen ? lang.preview.exitFullscreen : lang.preview.fullscreen;

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    handleFullscreenChange();

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch {
      // Fullscreen can be blocked by browser or embed policy; keep the preview usable.
    }
  };

  return (
    <main
      data-vault-layout="mini-app"
      className="flex min-h-[calc(100vh-64px)] flex-col overflow-hidden bg-[#070808] font-mono text-white md:min-h-[calc(100vh-68px)]"
    >
      <section className="shrink-0 pt-6 md:pt-[79px]">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-[14px] px-3 md:px-6 xl:px-0">
          <Link
            href={tokenDetailHref}
            className="grid h-9 w-9 shrink-0 place-items-center border border-[#D0FF00] text-[#D0FF00] transition-colors hover:bg-[#D0FF00] hover:text-[#070808] focus-visible:bg-[#D0FF00] focus-visible:text-[#070808] focus-visible:outline-none"
            aria-label={lang.preview.back}
            title={lang.preview.back}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.8} />
          </Link>
          <h1 className="text-[28px] font-normal uppercase leading-none text-white md:text-[32px]">{title}</h1>
          <span aria-hidden="true" className="mt-5 h-0.5 w-[34px] bg-[#D0FF00]" />
        </div>

        <div className="mt-8 border-b border-[#484B51]">
          <div className="relative mx-auto h-[43px] w-full max-w-[1200px] px-3 md:px-6 xl:px-0">
            <span className="absolute bottom-[11px] left-3 text-[14px] font-semibold uppercase leading-[1.4] text-white md:left-6 xl:left-0">{tab}</span>
            <span aria-hidden="true" className="absolute bottom-0 left-3 h-[3px] w-[27px] bg-white md:left-6 xl:left-0" />
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 px-3 py-5 md:px-5">
        <div
          ref={containerRef}
          className="mini-app-artifact-shell relative flex min-h-[420px] w-full min-w-0 flex-1 overflow-hidden bg-[#1D1D1D]"
          data-vault-e2e-scope="vault-preview"
        >
          <button
            type="button"
            onClick={toggleFullscreen}
            className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center border border-[#484B51] bg-black/80 text-white transition-colors hover:border-[#D0FF00] hover:text-[#D0FF00] focus-visible:border-[#D0FF00] focus-visible:text-[#D0FF00] focus-visible:outline-none"
            aria-label={fullscreenLabel}
            title={fullscreenLabel}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" strokeWidth={1.8} /> : <Maximize2 className="h-4 w-4" strokeWidth={1.8} />}
          </button>

          <div className="mini-app-artifact-content min-h-0 w-full min-w-0 overflow-auto">
            <div className="h-full min-h-full w-full min-w-0">{children}</div>
          </div>
        </div>
      </section>
    </main>
  );
}
