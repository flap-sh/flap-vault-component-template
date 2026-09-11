"use client";

import { createContext, useContext } from "react";
import type { FlapVaultSdk } from "./types";

export const RuntimeContext = createContext<FlapVaultSdk | null>(null);

export function useFlapSdk() {
  const sdk = useContext(RuntimeContext);
  if (!sdk) throw new Error("useFlapSdk must be used within VaultRuntimeProvider.");
  return sdk;
}

export function useVaultContext() {
  return useFlapSdk().context;
}

export function useFlapI18n() {
  return useFlapSdk().i18n;
}

export function useFlapNotify() {
  return useFlapSdk().notify;
}
