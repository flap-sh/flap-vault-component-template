export const MINI_APP_ROUTING_VERSION = 1;

/** Paths are relative to the current App root, never to flap.sh. */
export interface MiniAppRouteSnapshot {
  readonly pathname: string;
  /** Decoded exactly once. Applications own matching and parameter validation. */
  readonly segments: readonly string[];
  readonly search: string;
}

/** Host-owned adapter. Uploaded components use useMiniAppRouter(). */
export interface MiniAppRouterAdapter {
  getSnapshot(): MiniAppRouteSnapshot;
  subscribe(listener: () => void): () => void;
  push(path: string): void;
  replace(path: string): void;
  back(): void;
}

export interface MiniAppRouter extends MiniAppRouteSnapshot {
  push(path: string): void;
  replace(path: string): void;
  back(): void;
}
