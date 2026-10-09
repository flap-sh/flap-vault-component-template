"use client";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { MiniAppRuntimeProvider, type VaultManifest } from "@/src/sdk";
export function StandaloneAppPreviewShell({ manifest, i18n, children }: {
  folderName?: string; slug?: string; manifest: VaultManifest; i18n: Record<string, Record<string, string>>; children: ReactNode;
}) {
  const params = useSearchParams();
  const locale = params.get("lang") === "zh" ? "zh" : "en";
  const connected = params.get("appSession") === "connected";
  const notify = (message: string) => { console.info(message); };
  return <MiniAppRuntimeProvider manifest={manifest}
    session={{ address: connected ? "0x1234567890123456789012345678901234567890" : undefined, isConnected: connected, isAuthenticated: connected, isLoading: false, connect() {}, async signIn() {} }}
    i18n={{ locale, t: (key, fallback, values) => {
      let text = i18n[locale]?.[key] ?? i18n.en?.[key] ?? fallback ?? key;
      for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value));
      return text;
    } }} notify={{ info: notify, success: notify, warning: notify, error: notify }}>
    <main className="min-h-screen w-full bg-[#070808] text-white" data-vault-e2e-scope="vault-preview" data-app-session={connected ? "connected" : "guest"}>
      {children}
    </main>
  </MiniAppRuntimeProvider>;
}
