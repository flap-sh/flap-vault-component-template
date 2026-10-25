"use client";

import * as React from "react";
import { Compass, Minus, Plus, X } from "lucide-react";
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as StreetMap, RequestParameters, ScaleControl } from "maplibre-gl";
import { MiniAppContext, RuntimeContext } from "../sdk/runtimeStore";
import {
  STREET_MAP_INACTIVE_COLOR, STREET_MAP_RARITY_COLORS, STREET_MAP_STYLE, STREET_MAP_WORKER_PATH,
  streetMapCityData, streetMapDistanceMeters, streetMapLocationData, streetMapPointData,
  streetMapPointState, streetMapRadiusData, streetMapRequest, streetMapZoom,
  validStreetMapCoordinate, validStreetMapPoints, validStreetMapRadius,
} from "./streetMapPolicy";
import type { FlapStreetMapCoordinate, FlapStreetMapPoint, FlapStreetMapPointState, FlapStreetMapRarity, FlapStreetMapState } from "./streetMapPolicy";

export type { FlapStreetMapCoordinate, FlapStreetMapPoint, FlapStreetMapPointKind, FlapStreetMapPointState, FlapStreetMapRarity, FlapStreetMapState } from "./streetMapPolicy";
/** Immutable required-export sentinel; future revisions use a new name. */
export const STREET_MAP_PRESENTATION_V1 = 1;

export interface FlapStreetMapDetailsContext extends FlapStreetMapPointState {
  nowMs: number;
  distanceMeters: number | null;
  claimRadiusMeters: number | null;
  /** Geometric estimate for display, never a claim authorization. */
  withinDisplayRadius: boolean | null;
  close(): void;
}
export interface FlapStreetMapProps {
  points?: readonly FlapStreetMapPoint[];
  center?: FlapStreetMapCoordinate;
  userLocation?: FlapStreetMapCoordinate | null;
  zoom?: number;
  selectedPointId?: string | null;
  onSelectPoint?: (id: string) => void;
  onSelectionChange?: (point: FlapStreetMapPoint | null) => void;
  /** Project-owned, localized React content; never HTML strings or map popups. */
  renderPointDetails?: (point: FlapStreetMapPoint, context: FlapStreetMapDetailsContext) => React.ReactNode;
  claimRadiusMeters?: number;
  cityClusters?: boolean;
  showPointLabels?: boolean;
  showEventCountdowns?: boolean;
  showNavigation?: boolean;
  showScale?: boolean;
  rarityColors?: Partial<Record<FlapStreetMapRarity, string>>;
  controlLabels?: Partial<Record<"zoomIn" | "zoomOut" | "resetBearing" | "closeDetails", string>>;
  onStateChange?: (state: FlapStreetMapState) => void;
  fallback?: React.ReactNode;
  className?: string;
}
const EMPTY_POINTS: readonly FlapStreetMapPoint[] = [];
const DEFAULT_CENTER = { lat: 31.2304, lng: 121.4737 };
const FONT = ["Noto Sans Regular", "Noto Sans CJK SC Regular"];
const RARITIES = ["common", "rare", "epic", "legendary"] as const;
const LABEL_KEYS = ["zoomIn", "zoomOut", "resetBearing", "closeDetails"];
const MAP_CSS = `
.flap-street-map{position:relative;width:100%;min-height:400px;background:#070808;color:#f9fafb;overflow:hidden}
.flap-street-map__canvas{position:absolute;inset:0}.flap-street-map .maplibregl-canvas{position:absolute;left:0;top:0}.flap-street-map .maplibregl-canvas-container{position:absolute;inset:0}
.flap-street-map .maplibregl-interactive{cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none}.flap-street-map .maplibregl-interactive:active{cursor:grabbing}
.flap-street-map__fallback{position:relative;padding:16px}.flap-street-map__fallback button{display:block;text-align:left;color:inherit}
.flap-street-map__attribution{position:absolute;bottom:0;right:0;z-index:2;padding:2px 5px;background:#070808;color:#9ca3af;font:10px/1.5 sans-serif}.flap-street-map__attribution a{color:inherit;text-decoration:underline}
.flap-street-map__navigation{position:absolute;right:8px;top:8px;z-index:2;display:flex;flex-direction:column;border:1px solid #374151;border-radius:8px;background:#070808;overflow:hidden}
.flap-street-map__navigation button,.flap-street-map__close{display:flex;align-items:center;justify-content:center;min-width:40px;min-height:40px;color:inherit;background:transparent;border:0;cursor:pointer}.flap-street-map__navigation button+button{border-top:1px solid #374151}
.flap-street-map__navigation button:focus-visible,.flap-street-map__close:focus-visible{outline:2px solid #f9fafb;outline-offset:-3px}
.flap-street-map__details{position:absolute;z-index:3;bottom:48px;left:8px;right:8px;max-height:55%;overflow:auto;border:1px solid #374151;border-radius:8px;background:#070808;padding:16px 48px 16px 16px;box-shadow:0 4px 12px #0003}
.flap-street-map__close{position:absolute;right:0;top:0}.flap-street-map[data-map-state=unavailable] .flap-street-map__details{position:relative;inset:auto;margin:8px;max-height:none}
.flap-street-map .maplibregl-ctrl-bottom-left{position:absolute;left:8px;bottom:18px;pointer-events:none}.flap-street-map .maplibregl-ctrl-scale{box-sizing:border-box;padding:0 4px;border:2px solid #f9fafb;border-top:0;background:#070808;color:inherit;text-align:center;font:11px/16px sans-serif}
.flap-street-map .maplibregl-marker{position:absolute;top:0;left:0;will-change:transform}.flap-street-map__user-location{width:14px;height:14px;border:2px solid #fff;border-radius:50%;background:#38bdf8;pointer-events:none}
.flap-street-map__user-location:after{content:"";position:absolute;inset:-6px;border:2px solid #38bdf8;border-radius:50%;animation:flap-location-pulse 2s ease-out infinite}
@keyframes flap-location-pulse{from{transform:scale(.7);opacity:.8}to{transform:scale(1.8);opacity:0}}@media(prefers-reduced-motion:reduce){.flap-street-map__user-location:after{animation:none;opacity:.3}}
`;
function validOptions(colors: FlapStreetMapProps["rarityColors"], labels: FlapStreetMapProps["controlLabels"]) {
  return (colors === undefined || !!colors && typeof colors === "object" && !Array.isArray(colors) && Object.entries(colors).every(([key, value]) => RARITIES.includes(key as FlapStreetMapRarity) && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)))
    && (labels === undefined || !!labels && typeof labels === "object" && !Array.isArray(labels) && Object.entries(labels).every(([key, value]) => LABEL_KEYS.includes(key) && typeof value === "string" && value.length > 0 && value.length <= 128));
}
function countdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds / 60 % 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
function eventData(points: readonly FlapStreetMapPoint[], nowMs: number, selectedPointId: string | null | undefined, showCountdowns: boolean) {
  const events = points.filter((point) => point.kind === "event");
  const data = streetMapPointData(events, { nowMs, selectedPointId });
  return { ...data, features: data.features.map((feature, index) => {
    const remaining = streetMapPointState(events[index], nowMs).eventRemainingMs;
    return { ...feature, properties: { ...feature.properties, eventLabel: `${feature.properties.label}${showCountdowns && remaining !== null ? `\n${countdown(remaining)}` : ""}` } };
  }) };
}

/** Fixed resource/rendering surface. Amounts, claim rules and details remain project-owned. */
export function FlapStreetMap({
  points = EMPTY_POINTS, center, userLocation, zoom, selectedPointId, onSelectPoint, onSelectionChange,
  renderPointDetails, claimRadiusMeters, cityClusters = true, showPointLabels = true, showEventCountdowns = true,
  showNavigation = false, showScale = false, rarityColors, controlLabels, onStateChange, fallback, className,
}: FlapStreetMapProps) {
  const vault = React.useContext(RuntimeContext), app = React.useContext(MiniAppContext);
  const declared = (app ?? vault)?.context.manifest.mapCapabilities?.includes("street-map-v1") === true;
  const valid = validStreetMapPoints(points) && (center === undefined || validStreetMapCoordinate(center)) && (userLocation == null || validStreetMapCoordinate(userLocation))
    && (zoom === undefined || Number.isFinite(zoom)) && (claimRadiusMeters === undefined || validStreetMapRadius(claimRadiusMeters))
    && (selectedPointId == null || typeof selectedPointId === "string" && selectedPointId.length <= 128)
    && [cityClusters, showPointLabels, showEventCountdowns, showNavigation, showScale].every((value) => typeof value === "boolean") && validOptions(rarityColors, controlLabels);
  const [internalSelection, setInternalSelection] = React.useState<string | null>(null);
  const selectedId = selectedPointId === undefined ? internalSelection : selectedPointId;
  const selectedPoint = valid ? points.find((point) => point.id === selectedId) ?? null : null;
  const previousSelection = React.useRef<string | null>(null);
  const [nowMs, setNowMs] = React.useState(Date.now);
  const [state, setState] = React.useState<FlapStreetMapState>({ status: "loading" });
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<StreetMap | null>(null);
  const markerRef = React.useRef<import("maplibre-gl").Marker | null>(null);
  const scaleRef = React.useRef<ScaleControl | null>(null);
  const failRef = React.useRef<((reason: NonNullable<FlapStreetMapState["reason"]>) => void) | null>(null);
  const refreshRef = React.useRef<(() => void) | null>(null);
  const latest = React.useRef({ points, center, userLocation, zoom, selectedId, selectedPointId, onSelectPoint, onSelectionChange, onStateChange, nowMs, claimRadiusMeters, cityClusters, showPointLabels, showEventCountdowns, showScale, rarityColors });
  latest.current = { points, center, userLocation, zoom, selectedId, selectedPointId, onSelectPoint, onSelectionChange, onStateChange, nowMs, claimRadiusMeters, cityClusters, showPointLabels, showEventCountdowns, showScale, rarityColors };
  const select = React.useCallback((id: string | null) => {
    const current = latest.current;
    const point = id === null ? null : current.points.find((item) => item.id === id) ?? null;
    if (id !== null && !point) return;
    if (current.selectedPointId === undefined) setInternalSelection(point?.id ?? null);
    setNowMs(Date.now());
    try { if (point) current.onSelectPoint?.(point.id); current.onSelectionChange?.(point); }
    catch { console.error("FlapStreetMap selection callback failed."); }
  }, []);
  React.useEffect(() => {
    if (!valid) return;
    if (selectedId && previousSelection.current === selectedId && !points.some((point) => point.id === selectedId)) {
      if (latest.current.selectedPointId === undefined) setInternalSelection(null);
      try { latest.current.onSelectionChange?.(null); } catch { console.error("FlapStreetMap selection callback failed."); }
    }
    previousSelection.current = points.some((point) => point.id === selectedId) ? selectedId ?? null : null;
  }, [points, selectedId, valid]);
  // One bounded clock, suspended in the background and stopped after all deadlines.
  React.useEffect(() => {
    if (!declared || !valid) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const tick = () => {
      if (timer) clearTimeout(timer);
      if (disposed || document.visibilityState === "hidden") return;
      const now = Date.now(); setNowMs(now);
      const deadlines = points.flatMap((point) => [point.respawnAt, point.expiresAt]).filter((time): time is number => typeof time === "number" && time > now);
      if (deadlines.length) timer = setTimeout(tick, Math.max(16, Math.min(1000, Math.min(...deadlines) - now + 1)));
    };
    const visibility = () => { if (timer) clearTimeout(timer); if (document.visibilityState !== "hidden") tick(); };
    tick(); document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [declared, valid, points]);
  const temporalStateKey = valid ? points.map((point) => `${point.respawnAt !== undefined && point.respawnAt > nowMs ? 1 : 0}${point.expiresAt !== undefined && point.expiresAt <= nowMs ? 1 : 0}`).join("") : "";

  React.useEffect(() => {
    let disposed = false, failed = false;
    let map: StreetMap | null = null;
    let resize: ResizeObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let layerKey = "", paletteKey = "", locationKey = "";
    const emit = (next: FlapStreetMapState) => { if (!disposed) { setState(next); try { latest.current.onStateChange?.(next); } catch { console.error("FlapStreetMap onStateChange failed."); } } };
    const cleanMap = () => {
      if (timeout) clearTimeout(timeout);
      resize?.disconnect(); canvas?.removeEventListener("webglcontextlost", contextLost);
      markerRef.current?.remove(); markerRef.current = null; scaleRef.current = null;
      if (map) { const previous = map; map = null; if (mapRef.current === previous) mapRef.current = null; previous.remove(); }
      refreshRef.current = null;
    };
    const fail = (reason: NonNullable<FlapStreetMapState["reason"]>) => { if (!disposed && !failed) { failed = true; cleanMap(); emit({ status: "unavailable", reason }); } };
    const contextLost = () => fail("context-lost");
    failRef.current = fail;
    if (!declared || !valid) { emit({ status: "unavailable", reason: declared ? "invalid-input" : "not-declared" }); return () => { disposed = true; if (failRef.current === fail) failRef.current = null; }; }
    emit({ status: "loading" });
    const mount = containerRef.current;
    let supported = typeof Worker === "function";
    try { const probe = document.createElement("canvas"); const context = supported ? probe.getContext("webgl2") : null; supported = !!context; context?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { supported = false; }
    if (!supported || !mount) fail("unsupported");
    else {
      timeout = setTimeout(() => fail("timeout"), 15_000);
      void import("maplibre-gl").then((engine) => {
        if (disposed || failed || containerRef.current !== mount) return;
        engine.setWorkerUrl(STREET_MAP_WORKER_PATH); engine.setWorkerCount(2);
        const initial = latest.current.center ?? latest.current.userLocation ?? DEFAULT_CENTER;
        map = new engine.Map({ container: mount, style: STREET_MAP_STYLE, center: [initial.lng, initial.lat], zoom: streetMapZoom(latest.current.zoom), minZoom: 3, maxZoom: 18, attributionControl: false, maxTileCacheSize: 128,
          transformRequest: (url) => streetMapRequest(url) as unknown as RequestParameters });
        mapRef.current = map; canvas = map.getCanvas(); canvas.addEventListener("webglcontextlost", contextLost);
        map.on("error", () => fail("load-failed"));
        const refresh = () => {
          if (!map || !map.getLayer("flap-cities-label")) return;
          const current = latest.current;
          const grouped = current.cityClusters && map.getZoom() <= 7.2;
          const labels = current.showPointLabels && map.getZoom() > 10.5;
          const nextLayers = `${grouped}:${labels}`;
          if (nextLayers !== layerKey) {
            layerKey = nextLayers;
            const individual: FilterSpecification = grouped ? ["!=", ["get", "hasCity"], true] : ["literal", true];
            const active: FilterSpecification = ["all", ["!", ["get", "coolingDown"]], ["!", ["get", "expired"]]];
            map.setFilter("flap-points-core", individual);
            map.setFilter("flap-points-glow", ["all", individual, active] as FilterSpecification);
            map.setFilter("flap-points-selected", ["all", individual, ["==", ["get", "selected"], true]] as FilterSpecification);
            map.setFilter("flap-points-label", individual);
            for (const id of ["flap-cities-bubble", "flap-cities-label"]) map.setLayoutProperty(id, "visibility", grouped ? "visible" : "none");
            map.setLayoutProperty("flap-points-label", "visibility", labels ? "visible" : "none");
          }
          if (current.showScale && !scaleRef.current) { scaleRef.current = new engine.ScaleControl({ maxWidth: 100, unit: "metric" }); map.addControl(scaleRef.current, "bottom-left"); }
          else if (!current.showScale && scaleRef.current) { map.removeControl(scaleRef.current); scaleRef.current = null; }
          const colors = { ...STREET_MAP_RARITY_COLORS, ...current.rarityColors };
          const nextPalette = RARITIES.map((rarity) => colors[rarity]).join(":");
          if (nextPalette !== paletteKey) {
            paletteKey = nextPalette;
            const color: ExpressionSpecification = ["case", ["any", ["get", "coolingDown"], ["get", "expired"]], STREET_MAP_INACTIVE_COLOR, ["match", ["get", "rarity"], "rare", colors.rare, "epic", colors.epic, "legendary", colors.legendary, colors.common]];
            for (const id of ["flap-points-core", "flap-points-glow", "flap-events-core", "flap-events-glow"]) map.setPaintProperty(id, "circle-color", color);
          }
          const nextLocation = current.userLocation ? `${current.userLocation.lat}:${current.userLocation.lng}` : "none";
          if (nextLocation !== locationKey) {
            locationKey = nextLocation;
            if (current.userLocation) {
              if (!markerRef.current) { const element = document.createElement("span"); element.className = "flap-street-map__user-location"; element.setAttribute("aria-hidden", "true"); markerRef.current = new engine.Marker({ element }).setLngLat([current.userLocation.lng, current.userLocation.lat]).addTo(map); }
              else markerRef.current.setLngLat([current.userLocation.lng, current.userLocation.lat]);
            } else { markerRef.current?.remove(); markerRef.current = null; }
          }
        };
        refreshRef.current = refresh;
        map.on("zoom", () => { try { refresh(); } catch { fail("load-failed"); } });
        map.on("load", () => {
          if (disposed || failed || !map) return;
          try {
            const current = latest.current;
            const data = streetMapPointData(current.points, { nowMs: current.nowMs, selectedPointId: current.selectedId });
            map.addSource("flap-points", { type: "geojson", data: { ...data, features: data.features.filter((point) => point.properties.kind === "store") } });
            map.addSource("flap-events", { type: "geojson", data: eventData(current.points, current.nowMs, current.selectedId, current.showEventCountdowns) });
            map.addSource("flap-cities", { type: "geojson", data: streetMapCityData(current.points) });
            map.addSource("flap-location", { type: "geojson", data: streetMapLocationData(current.userLocation) });
            map.addSource("flap-location-range", { type: "geojson", data: streetMapRadiusData(current.userLocation, current.claimRadiusMeters) });
            map.addLayer({ id: "flap-location-range-fill", type: "fill", source: "flap-location-range", paint: { "fill-color": "#38bdf8", "fill-opacity": 0.1 } });
            map.addLayer({ id: "flap-location-range-outline", type: "line", source: "flap-location-range", paint: { "line-color": "#38bdf8", "line-width": 1.5, "line-opacity": 0.7 } });
            map.addLayer({ id: "flap-cities-bubble", type: "circle", source: "flap-cities", paint: { "circle-radius": ["step", ["get", "count"], 18, 10, 22, 50, 26], "circle-color": "#fbbf24", "circle-opacity": 0.9, "circle-stroke-color": "#070808", "circle-stroke-width": 2 } });
            map.addLayer({ id: "flap-cities-label", type: "symbol", source: "flap-cities", layout: { "text-field": ["concat", ["get", "city"], "\n", ["to-string", ["get", "count"]]], "text-font": FONT, "text-size": 11, "text-allow-overlap": true }, paint: { "text-color": "#070808" } });
            const active = ["all", ["!", ["get", "coolingDown"]], ["!", ["get", "expired"]]] as FilterSpecification;
            for (const [source, radius] of [["flap-points", 6], ["flap-events", 9]] as const) {
              map.addLayer({ id: `${source}-glow`, type: "circle", source, filter: active, paint: { "circle-radius": radius + 8, "circle-color": ["get", "color"], "circle-opacity": 0.25, "circle-blur": 0.6 } });
              map.addLayer({ id: `${source}-core`, type: "circle", source, paint: { "circle-radius": radius, "circle-color": ["get", "color"], "circle-stroke-width": source === "flap-events" ? 2 : 1.5, "circle-stroke-color": source === "flap-events" ? "#ffffff" : "#000000" } });
              map.addLayer({ id: `${source}-selected`, type: "circle", source, filter: ["==", ["get", "selected"], true], paint: { "circle-radius": radius + 5, "circle-opacity": 0, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" } });
              map.addLayer({ id: `${source}-label`, type: "symbol", source, layout: { "text-field": ["get", source === "flap-events" ? "eventLabel" : "label"], "text-font": FONT, "text-size": 11, "text-offset": [0, 1.4], "text-anchor": "top", "text-max-width": 18 }, paint: { "text-color": "#f9fafb", "text-halo-color": "#070808", "text-halo-width": 2 } });
            }
            map.addLayer({ id: "flap-events-symbol", type: "symbol", source: "flap-events", layout: { "text-field": "★", "text-font": FONT, "text-size": 12, "text-allow-overlap": true, "text-ignore-placement": true }, paint: { "text-color": "#ffffff" } });
            // One hit test selects only the visually topmost target, including overlaps.
            const interactiveLayers = ["flap-cities-bubble", "flap-points-core", "flap-events-core"];
            map.on("click", interactiveLayers, (event) => {
              const feature = event.features?.[0]; if (!map || !feature) return;
              if (feature.layer.id === "flap-cities-bubble" && feature.geometry.type === "Point") {
                const [lng, lat] = feature.geometry.coordinates;
                if (validStreetMapCoordinate({ lat, lng })) map.flyTo({ center: [lng, lat], zoom: 12, duration: 600, essential: false });
              } else if (typeof feature.properties?.id === "string") select(feature.properties.id);
            });
            map.on("mouseenter", interactiveLayers, () => { if (map) map.getCanvas().style.cursor = "pointer"; });
            map.on("mouseleave", interactiveLayers, () => { if (map) map.getCanvas().style.cursor = ""; });
            // Retain the legacy data source/layer; the DOM marker supplies the pulse.
            map.addLayer({ id: "flap-location-dot", type: "circle", source: "flap-location", paint: { "circle-radius": 0, "circle-opacity": 0 } });
            if (current.center) map.jumpTo({ center: [current.center.lng, current.center.lat], zoom: streetMapZoom(current.zoom) });
            else if (current.zoom !== undefined) map.setZoom(streetMapZoom(current.zoom));
            refresh(); if (timeout) clearTimeout(timeout); emit({ status: "ready" });
          } catch { fail("load-failed"); }
        });
        if (typeof ResizeObserver === "function") { resize = new ResizeObserver(() => map?.resize()); resize.observe(mount); }
      }).catch(() => fail("load-failed"));
    }
    return () => { disposed = true; if (failRef.current === fail) failRef.current = null; cleanMap(); };
  }, [declared, valid, select]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!valid || !map?.getSource("flap-points")) return;
    try {
      const data = streetMapPointData(points, { nowMs: latest.current.nowMs, selectedPointId: selectedId });
      (map.getSource("flap-points") as GeoJSONSource).setData({ ...data, features: data.features.filter((point) => point.properties.kind === "store") });
      (map.getSource("flap-cities") as GeoJSONSource).setData(streetMapCityData(points)); refreshRef.current?.();
    } catch { failRef.current?.("load-failed"); }
  }, [points, selectedId, temporalStateKey, valid]);
  React.useEffect(() => {
    const map = mapRef.current;
    if (!valid || !map?.getSource("flap-events")) return;
    try { (map.getSource("flap-events") as GeoJSONSource).setData(eventData(points, nowMs, selectedId, showEventCountdowns)); }
    catch { failRef.current?.("load-failed"); }
  }, [points, selectedId, nowMs, showEventCountdowns, valid]);
  React.useEffect(() => {
    const map = mapRef.current;
    if (!valid || !map?.getSource("flap-location")) return;
    try {
      (map.getSource("flap-location") as GeoJSONSource).setData(streetMapLocationData(userLocation));
      (map.getSource("flap-location-range") as GeoJSONSource).setData(streetMapRadiusData(userLocation, claimRadiusMeters)); refreshRef.current?.();
    } catch { failRef.current?.("load-failed"); }
  }, [userLocation, claimRadiusMeters, valid]);
  const centerLat = center?.lat, centerLng = center?.lng;
  React.useEffect(() => {
    const map = mapRef.current;
    if (!valid || !map?.getSource("flap-points")) return;
    try { if (centerLat !== undefined && centerLng !== undefined) map.jumpTo({ center: [centerLng, centerLat], ...(zoom === undefined ? {} : { zoom: streetMapZoom(zoom) }) }); else if (zoom !== undefined) map.setZoom(streetMapZoom(zoom)); }
    catch { failRef.current?.("load-failed"); }
  }, [centerLat, centerLng, zoom, valid]);
  React.useEffect(() => { try { refreshRef.current?.(); } catch { failRef.current?.("load-failed"); } }, [cityClusters, showPointLabels, showScale, rarityColors]);

  const visibleState = !declared ? { status: "unavailable", reason: "not-declared" } : !valid ? { status: "unavailable", reason: "invalid-input" } : state;
  const distance = selectedPoint && userLocation ? streetMapDistanceMeters(userLocation, selectedPoint) : null;
  const details = selectedPoint && renderPointDetails && visibleState.status !== "loading" ? renderPointDetails(selectedPoint, {
    ...streetMapPointState(selectedPoint, nowMs), nowMs, distanceMeters: distance, claimRadiusMeters: claimRadiusMeters ?? null,
    withinDisplayRadius: distance !== null && claimRadiusMeters !== undefined ? distance <= claimRadiusMeters : null, close: () => select(null),
  }) : null;
  const navigate = (action: "in" | "out" | "north") => { const map = mapRef.current; if (!map) return; if (action === "in") map.zoomIn(); else if (action === "out") map.zoomOut(); else map.resetNorth(); };
  return <div className={["flap-street-map", className].filter(Boolean).join(" ")} data-flap-ui="street-map" data-map-state={visibleState.status} data-map-reason={visibleState.reason}>
    <style>{MAP_CSS}</style>
    <div ref={containerRef} className="flap-street-map__canvas" aria-hidden={visibleState.status !== "ready"} style={{ visibility: visibleState.status === "ready" ? "visible" : "hidden" }} />
    {visibleState.status !== "ready" && <div className="flap-street-map__fallback">{fallback ?? (validStreetMapPoints(points) ? points.map((point) => <button key={point.id} type="button" onClick={() => select(point.id)}>{point.title}</button>) : null)}</div>}
    {showNavigation && visibleState.status === "ready" && <div className="flap-street-map__navigation">
      <button type="button" aria-label={controlLabels?.zoomIn ?? "Zoom in"} onClick={() => navigate("in")}><Plus size={18} aria-hidden="true" /></button>
      <button type="button" aria-label={controlLabels?.zoomOut ?? "Zoom out"} onClick={() => navigate("out")}><Minus size={18} aria-hidden="true" /></button>
      <button type="button" aria-label={controlLabels?.resetBearing ?? "Reset bearing"} onClick={() => navigate("north")}><Compass size={18} aria-hidden="true" /></button>
    </div>}
    {details != null && <div className="flap-street-map__details" data-map-selected={selectedPoint?.id}>
      <button type="button" className="flap-street-map__close" aria-label={controlLabels?.closeDetails ?? "Close details"} onClick={() => select(null)}><X size={18} aria-hidden="true" /></button>
      {details}
    </div>}
    <div className="flap-street-map__attribution"><a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>{" · "}<a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a>{" · "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></div>
  </div>;
}
