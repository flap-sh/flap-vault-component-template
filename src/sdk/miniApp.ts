export const MINI_APP_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(["api", "apps", "admin", "www", "app", "launch", "preview", "login", "settings"]);
export function isMiniAppSlug(value: unknown): value is string {
  return typeof value === "string" && value.length >= 3 && value.length <= 64 && MINI_APP_SLUG_PATTERN.test(value) && !RESERVED_SLUGS.has(value);
}
export function isStandaloneMiniApp(manifest: unknown): manifest is { schemaVersion: 2; mode: "mini-app"; appModel: "standalone"; slug: string; artifactId: string; match: { bindings: [] } } {
  if (!manifest || typeof manifest !== "object") return false;
  const value = manifest as Record<string, unknown>;
  const match = value.match as { bindings?: unknown } | undefined;
  return value.schemaVersion === 2 && value.mode === "mini-app" && value.appModel === "standalone" && isMiniAppSlug(value.slug) && typeof value.artifactId === "string" && Array.isArray(match?.bindings) && match.bindings.length === 0;
}
