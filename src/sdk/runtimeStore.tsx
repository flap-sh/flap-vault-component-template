"use client";
import { createContext, useContext } from "react";
import type { FlapVaultSdk } from "./types";
import type { MiniAppSdk } from "./miniAppRuntime";
import type { FlapChainSdk } from "./flapChainRuntime";
import type { MiniAppRouterAdapter } from "./miniAppRoutingTypes";
export const RuntimeContext = createContext<FlapVaultSdk | null>(null);
export const MiniAppContext = createContext<MiniAppSdk | null>(null);
export const MiniAppRoutingContext = createContext<MiniAppRouterAdapter | null>(null);
/** Existing Vault calls keep their token context. Independent Apps select a chain. */
export function useFlapSdk(): FlapVaultSdk;
export function useFlapSdk(options: { chainId: number }): FlapChainSdk;
export function useFlapSdk(options?: { chainId: number }): FlapVaultSdk | FlapChainSdk {
  const vault = useContext(RuntimeContext);
  const app = useContext(MiniAppContext);
  if (options) {
    const runtime = app ?? vault;
    if (!runtime) throw new Error("useFlapSdk requires a Flap runtime provider.");
    return runtime.forChain(options.chainId);
  }
  if (vault && !app) return vault;
  if (app) throw new Error("Independent Apps must select a network: useFlapSdk({ chainId }).");
  throw new Error("useFlapSdk requires a Flap runtime provider.");
}
export function useVaultContext() { return useFlapSdk().context; }
export function useFlapI18n() {
  const vault = useContext(RuntimeContext); const app = useContext(MiniAppContext);
  const runtime = app ?? vault; if (!runtime) throw new Error("A Flap runtime provider is required."); return runtime.i18n;
}
export function useFlapNotify() {
  const vault = useContext(RuntimeContext); const app = useContext(MiniAppContext);
  const runtime = app ?? vault; if (!runtime) throw new Error("A Flap runtime provider is required."); return runtime.notify;
}

/** Internal UI adapter: IPFS text is chain-independent on both host surfaces. */
export function useFlapIpfsTextReader() {
  const vault = useContext(RuntimeContext); const app = useContext(MiniAppContext);
  const runtime = app ?? vault;
  if (!runtime) throw new Error("IPFS content requires a Flap runtime provider.");
  return runtime.readIpfsText;
}
