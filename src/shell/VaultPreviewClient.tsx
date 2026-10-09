"use client";

import { ComponentType, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { VaultComponentProps, VaultLaunchConfigComponentProps, VaultManifest } from "@/src/sdk";
import { useLang } from "@/src/i18n/useLang";
import { Alert } from "@/src/ui/Alert";
import { FlapPreviewShell } from "./FlapPreviewShell";
import { StandaloneAppPreviewShell } from "./StandaloneAppPreviewShell";
import { isStandaloneMiniApp } from "@/src/sdk";
import { MiniAppPreviewShell } from "./MiniAppPreviewShell";
import { vaultModules } from "@/src/vaults";
import { LaunchConfigPreviewShell } from "./LaunchConfigPreviewShell";
import { PreviewSurfaceNav } from "./PreviewSurfaceNav";
import { readPreviewSurface } from "./previewSurface";

interface LoadedVault {
  Component: ComponentType<VaultComponentProps>;
  LaunchConfig?: ComponentType<VaultLaunchConfigComponentProps>;
  manifest: VaultManifest;
  i18n: Record<string, Record<string, string>>;
}

export function VaultPreviewClient({ folderName }: { folderName: string }) {
  const { lang } = useLang();
  const searchParams = useSearchParams();
  const [loaded, setLoaded] = useState<LoadedVault | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const vaultModule = vaultModules[folderName];
    if (!vaultModule) {
      setError(`${lang.preview.unknownVault}: ${folderName}`);
      return;
    }
    Promise.all([vaultModule.loadComponent(), vaultModule.loadManifest(), vaultModule.loadI18n()])
      .then(([component, manifest, i18n]) => {
        if (cancelled) return;
        setLoaded({
          Component: component.default,
          LaunchConfig: component.LaunchConfig,
          manifest: manifest.default,
          i18n: i18n.default,
        });
      })
      .catch((nextError) => {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : String(nextError));
      });
    return () => {
      cancelled = true;
    };
  }, [folderName, lang.preview.unknownVault]);

  if (error) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-3xl">
          <Alert tone="danger">{error}</Alert>
        </div>
      </main>
    );
  }

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">{lang.preview.loading}</div>
      </main>
    );
  }

  const { Component, LaunchConfig, manifest, i18n } = loaded;
  const requestedSurface = readPreviewSurface(searchParams);
  const hasLaunchConfig = Boolean(LaunchConfig && manifest.surfaces?.includes("launch-config"));
  if (requestedSurface === "launch-config") {
    return <>
      <PreviewSurfaceNav active={requestedSurface} />
      {hasLaunchConfig && LaunchConfig ? <LaunchConfigPreviewShell folderName={folderName} manifest={manifest} i18n={i18n} Component={LaunchConfig} /> : <main className="min-h-screen bg-[#070808] p-6"><Alert tone="warning">{lang.home.surfaces.unavailable}</Alert></main>}
    </>;
  }
  const Shell = isStandaloneMiniApp(manifest) ? StandaloneAppPreviewShell : manifest.mode === "mini-app" ? MiniAppPreviewShell : FlapPreviewShell;
  return (
    <>
    {hasLaunchConfig ? <PreviewSurfaceNav active={requestedSurface} /> : null}
    <Shell folderName={folderName} manifest={manifest} i18n={i18n}>
      <Component />
    </Shell>
    </>
  );
}
