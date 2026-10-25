/** Internal, fixed street-map policy. This is not a general URL loader. */
export const STREET_MAP_VERSION = 1;
export const STREET_MAP_ENGINE_VERSION = "6.15.0";
export const STREET_MAP_WORKER_PATH = "/runtime-map/maplibre-6.15.0-worker.mjs";
export const STREET_MAP_WORKER_SHA256 = "1c69066368331aae63967ed24a9affcf962cf55fcc6d8f532a8b040f736dbcfa";
export const STREET_MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
export const STREET_MAP_MAX_POINTS = 2000;

export interface FlapStreetMapCoordinate { lat: number; lng: number }
export interface FlapStreetMapPoint extends FlapStreetMapCoordinate {
  id: string;
  title: string;
  rarity?: "common" | "rare" | "epic" | "legendary";
}
export interface FlapStreetMapState {
  status: "loading" | "ready" | "unavailable";
  reason?: "not-declared" | "invalid-input" | "unsupported" | "load-failed" | "timeout" | "context-lost";
}

export function validStreetMapCoordinate(value: unknown): value is FlapStreetMapCoordinate {
  if (!value || typeof value !== "object") return false;
  const coordinate = value as FlapStreetMapCoordinate;
  return Number.isFinite(coordinate.lat) && Math.abs(coordinate.lat) <= 85.051129 && Number.isFinite(coordinate.lng) && Math.abs(coordinate.lng) <= 180;
}

export function validStreetMapPoints(value: unknown): value is readonly FlapStreetMapPoint[] {
  if (!Array.isArray(value) || value.length > STREET_MAP_MAX_POINTS) return false;
  const ids = new Set<string>();
  for (const point of value) {
    if (!validStreetMapCoordinate(point)) return false;
    const item = point as FlapStreetMapPoint;
    if (typeof item.id !== "string" || !item.id.length || item.id.length > 128 || ids.has(item.id) || typeof item.title !== "string" || item.title.length > 256 || item.rarity !== undefined && !["common", "rare", "epic", "legendary"].includes(item.rarity)) return false;
    ids.add(item.id);
  }
  return true;
}

export function streetMapZoom(value: number | undefined): number {
  return value === undefined ? 12 : Math.min(18, Math.max(3, value));
}

/** Check every MapLibre resource, including references in style/TileJSON. */
export function streetMapRequest(url: string): { url: string; credentials: "omit"; referrerPolicy: "no-referrer" } {
  if (typeof url !== "string" || url.length > 1024) throw new Error("street-map/resource-blocked");
  const parsed = new URL(url);
  if (parsed.origin !== "https://tiles.openfreemap.org" || parsed.username || parsed.password || parsed.search || parsed.hash || /[\\\u0000-\u0020]/.test(url) || /%(?:2f|5c|2e|00)/i.test(parsed.pathname)) throw new Error("street-map/resource-blocked");
  const pathname = parsed.pathname;
  const allowed = pathname === "/styles/dark" || pathname === "/planet"
    || /^\/planet\/\d{8}_\d{6}_pt\/\d{1,2}\/\d{1,6}\/\d{1,6}\.pbf$/.test(pathname)
    || /^\/natural_earth\/ne2sr\/[0-6]\/\d{1,2}\/\d{1,2}\.png$/.test(pathname)
    || /^\/sprites\/ofm_[a-zA-Z0-9]{1,32}\/ofm(?:@2x)?\.(?:json|png)$/.test(pathname)
    || /^\/fonts\/[a-zA-Z0-9_,%+.-]{1,256}\/\d{1,7}-\d{1,7}\.pbf$/.test(pathname);
  if (!allowed) throw new Error("street-map/resource-blocked");
  return { url: parsed.href, credentials: "omit", referrerPolicy: "no-referrer" };
}

export function streetMapPointData(points: readonly FlapStreetMapPoint[]) {
  return { type: "FeatureCollection" as const, features: points.map((point) => ({
    type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [point.lng, point.lat] },
    // Titles stay React text in fallbacks. Never expose HTML or remote attribution.
    properties: { id: point.id, rarity: point.rarity ?? "common" },
  })) };
}

export function streetMapLocationData(location: FlapStreetMapCoordinate | null | undefined) {
  return { type: "FeatureCollection" as const, features: location ? [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [location.lng, location.lat] }, properties: {} }] : [] };
}
