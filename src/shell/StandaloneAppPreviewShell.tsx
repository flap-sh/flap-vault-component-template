"use client";
import { useMemo, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useFlapWalletRuntime } from "@/src/sdk/useFlapWalletRuntime";
import { useSearchParams } from "next/navigation";
import { MiniAppRuntimeProvider, type VaultManifest } from "@/src/sdk";
export function StandaloneAppPreviewShell({ manifest, i18n, children }: {
  folderName?: string; slug?: string; manifest: VaultManifest; i18n: Record<string, Record<string, string>>; children: ReactNode;
}) {
  const params = useSearchParams();
  const locale = params.get("lang") === "zh" ? "zh" : "en";
  const fixture = ["guest", "connected"].includes(params.get("appSession") ?? "");
  const account = useAccount();
  const { openConnectModal } = useConnectModal();
  const connected = fixture ? params.get("appSession") === "connected" : account.isConnected;
  const address = fixture ? connected ? "0x1234567890123456789012345678901234567890" as const : undefined : account.address;
  const hostRuntime = useFlapWalletRuntime({ connect: () => openConnectModal?.(), readOnly: fixture });
  const runtime = useMemo(() => fixture ? { ...hostRuntime, getAccount: () => ({ address, isConnected: connected, chainId: manifest.walletChains?.[0] ?? 56 }), connect() {}, disconnect() {} } : hostRuntime, [fixture, hostRuntime, address, connected, manifest]);
  const notify = (message: string) => { console.info(message); };
  return <MiniAppRuntimeProvider manifest={manifest} runtime={runtime}
    session={{ address, isConnected: connected, isAuthenticated: fixture && connected, isLoading: !fixture && (account.status === "connecting" || account.status === "reconnecting"), connect: () => { if (!fixture) openConnectModal?.(); }, async signIn() { if (!fixture) throw new Error("Authenticated sessions are available inside the Flap host."); } }}
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
