"use client";

import { ComponentType, useEffect, useState } from "react";
import type { VaultComponentProps, VaultManifest } from "@/src/sdk";
import { useLang } from "@/src/i18n/useLang";
import { Alert } from "@/src/ui/Alert";
import { FlapPreviewShell } from "./FlapPreviewShell";
import { MiniAppPreviewShell } from "./MiniAppPreviewShell";
import { vaultModules } from "@/src/vaults";

interface LoadedVault {
  Component: ComponentType<VaultComponentProps>;
  manifest: VaultManifest;
  i18n: Record<string, Record<string, string>>;
}

export function VaultPreviewClient({ folderName }: { folderName: string }) {
  const { lang } = useLang();
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

  const { Component, manifest, i18n } = loaded;
  const Shell = manifest.mode === "mini-app" ? MiniAppPreviewShell : FlapPreviewShell;
  return (
    <Shell folderName={folderName} manifest={manifest} i18n={i18n}>
      <Component />
    </Shell>
  );
}
