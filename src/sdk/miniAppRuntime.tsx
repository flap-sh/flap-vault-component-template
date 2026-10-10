"use client";
import { useContext, useMemo, useRef, type ReactNode } from "react";
import type { Address, FlapI18n, FlapNotify, VaultManifest } from "./types";
import { MiniAppContext } from "./runtimeStore";
import { createFlapChainSdk, type FlapChainSdk, type FlapWalletRuntime } from "./flapChainRuntime";
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
  forChain(chainId: number): FlapChainSdk;
}
export function MiniAppRuntimeProvider({ manifest, session, i18n, notify, runtime, children }: {
  manifest: VaultManifest; session: MiniAppSession; i18n: FlapI18n; notify: FlapNotify; children: ReactNode; runtime?: FlapWalletRuntime;
}) {
  const current = useRef({ manifest, runtime }); current.current = { manifest, runtime };
  const sdk = useMemo<MiniAppSdk>(() => {
    const writableChains = [...(manifest.walletChains ?? [])];
    const chainSdks = new Map<number, FlapChainSdk>();
    return { context: { appId: manifest.artifactId, slug: manifest.slug!, manifest: structuredClone(manifest) }, session, i18n, notify, forChain: (chainId) => {
      if (!runtime) throw new Error("This host has not enabled wallet operations for Apps.");
      let chainSdk = chainSdks.get(chainId);
      if (!chainSdk) { chainSdk = createFlapChainSdk({ ...runtime, assertActive: () => { if (current.current.manifest !== manifest || current.current.runtime !== runtime) throw new Error("The host wallet or App context changed. Review the transaction again."); runtime.assertActive?.(); } }, { chainId, manifest, writableChains, i18n, notify }); chainSdks.set(chainId, chainSdk); }
      return chainSdk;
    } };
  }, [manifest, runtime, session, i18n, notify]);
  if (!isStandaloneMiniApp(manifest)) throw new Error("A standalone Mini App v2 manifest is required.");
  return <MiniAppContext.Provider value={sdk}>{children}</MiniAppContext.Provider>;
}
export function useMiniAppSdk(): MiniAppSdk {
  const sdk = useContext(MiniAppContext);
  if (!sdk) throw new Error("useMiniAppSdk requires MiniAppRuntimeProvider.");
  return sdk;
}
