export * from "./hostCore";

// Client boundary stays separate in the packaged host entrypoint.
export { VaultRuntimeProvider } from "./hostClient";
export type { RuntimeProviderProps } from "./hostClient";
