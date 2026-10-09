"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { Address, FlapI18n, FlapNotify, VaultManifest } from "./types";
import { isStandaloneMiniApp } from "./miniApp";

export interface MiniAppSession {
  address?: Address;
  isConnected: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  connect(): void;
  /** Uses the host's existing session; only prompts for a signature when needed. */
  signIn(): Promise<void>;
}
export interface MiniAppSdk {
  context: { appId: string; slug: string; manifest: VaultManifest };
  session: MiniAppSession;
  i18n: FlapI18n;
  notify: FlapNotify;
}
const MiniAppContext = createContext<MiniAppSdk | null>(null);
export function MiniAppRuntimeProvider({ manifest, session, i18n, notify, children }: {
  manifest: VaultManifest; session: MiniAppSession; i18n: FlapI18n; notify: FlapNotify; children: ReactNode;
}) {
  if (!isStandaloneMiniApp(manifest)) throw new Error("A standalone Mini App v2 manifest is required.");
  return <MiniAppContext.Provider value={{ context: { appId: manifest.artifactId, slug: manifest.slug, manifest }, session, i18n, notify }}>{children}</MiniAppContext.Provider>;
}
export function useMiniAppSdk(): MiniAppSdk {
  const sdk = useContext(MiniAppContext);
  if (!sdk) throw new Error("useMiniAppSdk requires MiniAppRuntimeProvider.");
  return sdk;
}
