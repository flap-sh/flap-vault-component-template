"use client";
import { useContext, useSyncExternalStore } from "react";
import { MiniAppRoutingContext } from "./runtimeStore";
import type { MiniAppRouter } from "./miniAppRoutingTypes";

/** Routing is enabled by the host, independently from wallet permissions. */
export function useMiniAppRouter(): MiniAppRouter {
  const adapter = useContext(MiniAppRoutingContext);
  if (!adapter) throw new Error("runtime/mini-app-routing-unsupported: this host must enable Mini App routing.");
  const snapshot = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  return { ...snapshot, push: adapter.push, replace: adapter.replace, back: adapter.back };
}
