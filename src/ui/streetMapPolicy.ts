/** Internal, fixed street-map policy. This is not a general URL loader. */
export const STREET_MAP_VERSION = 1;
export const STREET_MAP_ENGINE_VERSION = "6.15.0";
export const STREET_MAP_WORKER_PATH = "/runtime-map/maplibre-6.15.0-worker.mjs";
export const STREET_MAP_WORKER_SHA256 = "1c69066368331aae63967ed24a9affcf962cf55fcc6d8f532a8b040f736dbcfa";
export const STREET_MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
export const STREET_MAP_MAX_POINTS = 2000;
export const STREET_MAP_MAX_RADIUS_METERS = 100_000;
export const STREET_MAP_RARITY_COLORS = Object.freeze({
  common: "#22c55e", rare: "#3b82f6", epic: "#a855f7", legendary: "#fbbf24",
});
export const STREET_MAP_INACTIVE_COLOR = "#6b7280";

export type FlapStreetMapRarity = keyof typeof STREET_MAP_RARITY_COLORS;
export type FlapStreetMapPointKind = "store" | "event";

export interface FlapStreetMapCoordinate { lat: number; lng: number }
export interface FlapStreetMapPoint extends FlapStreetMapCoordinate {
  id: string;
  title: string;
  rarity?: FlapStreetMapRarity;
  symbol?: string;
  place?: string;
  city?: string;
  /** Plain display data; monetary units and eligibility remain application-owned. */
  amount?: string | number;
  /** Optional expiry and cooldown deadlines, both in Unix epoch milliseconds. */
  expiresAt?: number;
  respawnAt?: number;
  kind?: FlapStreetMapPointKind;
}
export interface FlapStreetMapPointState {
  coolingDown: boolean;
  expired: boolean;
  cooldownRemainingMs: number;
  eventRemainingMs: number | null;
}
export interface FlapStreetMapPointDataOptions {
  nowMs?: number;
  selectedPointId?: string | null;
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
    if (!optionalText(item.symbol, 32) || !optionalText(item.place, 160) || !optionalText(item.city, 80)) return false;
    if (item.amount !== undefined && !(typeof item.amount === "string" ? item.amount.length <= 128 && !/[\u0000-\u001f\u007f]/.test(item.amount) : typeof item.amount === "number" && Number.isFinite(item.amount) && item.amount >= 0 && item.amount <= Number.MAX_SAFE_INTEGER)) return false;
    if (!optionalTimestamp(item.expiresAt) || !optionalTimestamp(item.respawnAt)) return false;
    if (item.kind !== undefined && item.kind !== "store" && item.kind !== "event") return false;
    ids.add(item.id);
  }
  return true;
}

function optionalText(value: unknown, length: number): boolean {
  return value === undefined || typeof value === "string" && value.length <= length && !/[\u0000-\u001f\u007f]/.test(value);
}

function optionalTimestamp(value: unknown): boolean {
  return value === undefined || typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
}

export function validStreetMapRadius(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= STREET_MAP_MAX_RADIUS_METERS;
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

export function streetMapPointState(point: FlapStreetMapPoint, nowMs = Date.now()): FlapStreetMapPointState {
  const cooldownRemainingMs = Math.max(0, (point.respawnAt ?? nowMs) - nowMs);
  const eventRemainingMs = point.expiresAt === undefined ? null : Math.max(0, point.expiresAt - nowMs);
  return { coolingDown: cooldownRemainingMs > 0, expired: eventRemainingMs === 0, cooldownRemainingMs, eventRemainingMs };
}

export function streetMapPointLabel(point: FlapStreetMapPoint): string {
  const symbol = point.symbol?.trim(), place = point.place?.trim();
  return symbol && place ? `${symbol} · ${place}` : place || symbol || point.title;
}

export function streetMapPointData(points: readonly FlapStreetMapPoint[], { nowMs = Date.now(), selectedPointId }: FlapStreetMapPointDataOptions = {}) {
  return { type: "FeatureCollection" as const, features: points.map((point) => {
    const rarity = point.rarity ?? "common";
    const state = streetMapPointState(point, nowMs);
    const city = point.city?.trim() ?? "";
    return {
      type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [point.lng, point.lat] },
      // Fixed text-field/paint properties only. Labels are literal text, never
      // HTML. Business payloads, style expressions and resources stay outside.
      properties: { id: point.id, rarity, color: state.coolingDown || state.expired ? STREET_MAP_INACTIVE_COLOR : STREET_MAP_RARITY_COLORS[rarity], kind: point.kind ?? "store", city, hasCity: city.length > 0, label: streetMapPointLabel(point), coolingDown: state.coolingDown, expired: state.expired, selected: selectedPointId === point.id },
    };
  }) };
}

/** Named-city grouping is deterministic and does not merge independent events. */
export function streetMapCityData(points: readonly FlapStreetMapPoint[]) {
  const cities = new Map<string, { lat: number; sin: number; cos: number; count: number }>();
  for (const point of points) {
    const city = point.city?.trim();
    if (!city || point.kind === "event") continue;
    const group = cities.get(city) ?? { lat: 0, sin: 0, cos: 0, count: 0 };
    group.lat += point.lat;
    group.sin += Math.sin(point.lng * Math.PI / 180);
    group.cos += Math.cos(point.lng * Math.PI / 180);
    group.count += 1;
    cities.set(city, group);
  }
  return { type: "FeatureCollection" as const, features: Array.from(cities, ([city, group]) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [Math.atan2(group.sin, group.cos) * 180 / Math.PI, group.lat / group.count] },
    properties: { city, count: group.count },
  })) };
}

export function streetMapLocationData(location: FlapStreetMapCoordinate | null | undefined) {
  return { type: "FeatureCollection" as const, features: location ? [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [location.lng, location.lat] }, properties: {} }] : [] };
}

const EARTH_RADIUS_METERS = 6_371_008.8;
const MERCATOR_LATITUDE_LIMIT = 85.051129;
type Ring = number[][];
type RadiusGeometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };

function clipRing(input: Ring, axis: 0 | 1, limit: number, keepGreater: boolean): Ring {
  const result: Ring = [];
  let previous = input[input.length - 1];
  if (!previous) return result;
  let previousInside = keepGreater ? previous[axis] >= limit : previous[axis] <= limit;
  for (const current of input) {
    const inside = keepGreater ? current[axis] >= limit : current[axis] <= limit;
    if (inside !== previousInside) {
      const ratio = (limit - previous[axis]) / (current[axis] - previous[axis]);
      const intersection = [previous[0] + ratio * (current[0] - previous[0]), previous[1] + ratio * (current[1] - previous[1])];
      intersection[axis] = limit;
      result.push(intersection);
    }
    if (inside) result.push(current);
    previous = current;
    previousInside = inside;
  }
  return result;
}

/** Meter-based display circle, clipped at the Mercator and antimeridian edges. */
export function streetMapRadiusData(location: FlapStreetMapCoordinate | null | undefined, radiusMeters: number | undefined) {
  const features: { type: "Feature"; geometry: RadiusGeometry; properties: { radiusMeters: number } }[] = [];
  if (!validStreetMapCoordinate(location) || !validStreetMapRadius(radiusMeters) || radiusMeters === 0) return { type: "FeatureCollection" as const, features };
  const latitude = location.lat * Math.PI / 180, longitude = location.lng * Math.PI / 180;
  const angularRadius = radiusMeters / EARTH_RADIUS_METERS;
  const ring: Ring = [];
  for (let index = 0; index < 64; index += 1) {
    const bearing = -index * 2 * Math.PI / 64;
    const lat = Math.asin(Math.sin(latitude) * Math.cos(angularRadius) + Math.cos(latitude) * Math.sin(angularRadius) * Math.cos(bearing));
    const lng = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(latitude), Math.cos(angularRadius) - Math.sin(latitude) * Math.sin(lat));
    ring.push([lng * 180 / Math.PI, lat * 180 / Math.PI]);
  }
  const polygons: Ring[][] = [];
  for (const shift of [-360, 0, 360]) {
    let clipped = ring.map(([lng, lat]) => [lng + shift, lat]);
    clipped = clipRing(clipRing(clipped, 0, -180, true), 0, 180, false);
    clipped = clipRing(clipRing(clipped, 1, -MERCATOR_LATITUDE_LIMIT, true), 1, MERCATOR_LATITUDE_LIMIT, false);
    if (clipped.length >= 3) polygons.push([[...clipped, [...clipped[0]]]]);
  }
  if (polygons.length) features.push({ type: "Feature", geometry: polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons }, properties: { radiusMeters } });
  return { type: "FeatureCollection" as const, features };
}

/** Approximate display distance; it does not prove presence or claim eligibility. */
export function streetMapDistanceMeters(a: FlapStreetMapCoordinate, b: FlapStreetMapCoordinate): number | null {
  if (!validStreetMapCoordinate(a) || !validStreetMapCoordinate(b)) return null;
  const latA = a.lat * Math.PI / 180, latB = b.lat * Math.PI / 180;
  const deltaLat = latB - latA, deltaLng = (b.lng - a.lng) * Math.PI / 180;
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.max(0, Math.min(1, haversine))));
}
