"use client";

import * as React from "react";
import type { GeoJSONSource, Map as StreetMap, RequestParameters } from "maplibre-gl";
import { MiniAppContext, RuntimeContext } from "../sdk/runtimeStore";
import { STREET_MAP_STYLE, STREET_MAP_WORKER_PATH, streetMapLocationData, streetMapPointData, streetMapRequest, streetMapZoom, validStreetMapCoordinate, validStreetMapPoints } from "./streetMapPolicy";
import type { FlapStreetMapCoordinate, FlapStreetMapPoint, FlapStreetMapState } from "./streetMapPolicy";

export type { FlapStreetMapCoordinate, FlapStreetMapPoint, FlapStreetMapState } from "./streetMapPolicy";

export interface FlapStreetMapProps {
  points?: readonly FlapStreetMapPoint[];
  center?: FlapStreetMapCoordinate;
  userLocation?: FlapStreetMapCoordinate | null;
  zoom?: number;
  onSelectPoint?: (id: string) => void;
  onStateChange?: (state: FlapStreetMapState) => void;
  /** Supply a localized list/manual alternative. The default lists point titles. */
  fallback?: React.ReactNode;
  className?: string;
}

const EMPTY_POINTS: readonly FlapStreetMapPoint[] = [];
const DEFAULT_CENTER = { lat: 31.2304, lng: 121.4737 };
const MAP_CSS = `.flap-street-map{position:relative;width:100%;min-height:400px;background:var(--background,#070808);overflow:hidden}.flap-street-map__canvas{position:absolute;inset:0}.flap-street-map .maplibregl-canvas{position:absolute;left:0;top:0}.flap-street-map .maplibregl-canvas-container{position:absolute;inset:0}.flap-street-map .maplibregl-interactive{cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none}.flap-street-map .maplibregl-interactive:active{cursor:grabbing}.flap-street-map__fallback{position:relative;padding:16px}.flap-street-map__fallback button{display:block;text-align:left;color:inherit}.flap-street-map__attribution{position:absolute;bottom:0;right:0;z-index:1;padding:2px 5px;background:var(--background,#070808);color:var(--muted-foreground,#a3a3a3);font:10px/1.5 sans-serif}.flap-street-map__attribution a{color:inherit;text-decoration:underline}`;

/** Fixed OpenFreeMap dark map. No permission request, URL, HTML or map-instance API. */
export function FlapStreetMap({ points = EMPTY_POINTS, center, userLocation, zoom, onSelectPoint, onStateChange, fallback, className }: FlapStreetMapProps) {
  const vault = React.useContext(RuntimeContext), app = React.useContext(MiniAppContext);
  const declared = (app ?? vault)?.context.manifest.mapCapabilities?.includes("street-map-v1") === true;
  const valid = validStreetMapPoints(points) && (center === undefined || validStreetMapCoordinate(center)) && (userLocation == null || validStreetMapCoordinate(userLocation)) && (zoom === undefined || Number.isFinite(zoom));
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<StreetMap | null>(null);
  const failRef = React.useRef<((reason: NonNullable<FlapStreetMapState["reason"]>) => void) | null>(null);
  const latest = React.useRef({ points, center, userLocation, zoom, onSelectPoint, onStateChange });
  latest.current = { points, center, userLocation, zoom, onSelectPoint, onStateChange };
  const [state, setState] = React.useState<FlapStreetMapState>({ status: "loading" });

  React.useEffect(() => {
    let disposed = false;
    let failed = false;
    let map: StreetMap | null = null;
    let resize: ResizeObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let canvas: HTMLCanvasElement | undefined;
    const emit = (next: FlapStreetMapState) => {
      if (disposed) return;
      setState(next);
      try { latest.current.onStateChange?.(next); } catch { console.error("FlapStreetMap onStateChange failed."); }
    };
    const cleanMap = () => {
      if (timeout) clearTimeout(timeout);
      resize?.disconnect();
      canvas?.removeEventListener("webglcontextlost", contextLost);
      if (map) {
        const previous = map;
        map = null;
        if (mapRef.current === previous) mapRef.current = null;
        previous.remove();
      }
    };
    const fail = (reason: NonNullable<FlapStreetMapState["reason"]>) => {
      if (disposed || failed) return;
      failed = true;
      cleanMap();
      emit({ status: "unavailable", reason });
    };
    const contextLost = () => fail("context-lost");
    failRef.current = fail;
    if (!declared || !valid) {
      emit({ status: "unavailable", reason: declared ? "invalid-input" : "not-declared" });
      return () => { disposed = true; if (failRef.current === fail) failRef.current = null; };
    }
    emit({ status: "loading" });
    const mount = containerRef.current;
    let supported = typeof Worker === "function";
    try {
      const probe = document.createElement("canvas");
      const context = supported ? probe.getContext("webgl2") : null;
      supported = !!context;
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch { supported = false; }
    if (!supported || !mount) fail("unsupported");
    else {
      timeout = setTimeout(() => fail("timeout"), 15_000);
      void import("maplibre-gl").then((engine) => {
        if (disposed || failed || !containerRef.current || containerRef.current !== mount) return;
        engine.setWorkerUrl(STREET_MAP_WORKER_PATH);
        engine.setWorkerCount(2);
        const current = latest.current;
        const initial = current.center ?? current.userLocation ?? DEFAULT_CENTER;
        map = new engine.Map({
          container: mount, style: STREET_MAP_STYLE, center: [initial.lng, initial.lat], zoom: streetMapZoom(current.zoom),
          minZoom: 3, maxZoom: 18, attributionControl: false, maxTileCacheSize: 128,
          // MapLibre forwards this to fetch. Its public type currently omits the
          // valid Fetch credentials="omit" value; no cookie/header is provided.
          transformRequest: (url) => streetMapRequest(url) as unknown as RequestParameters,
        });
        mapRef.current = map;
        canvas = map.getCanvas();
        canvas.addEventListener("webglcontextlost", contextLost);
        map.on("error", () => fail("load-failed"));
        map.on("load", () => {
          if (disposed || failed || !map) return;
          try {
          map.addSource("flap-points", { type: "geojson", data: streetMapPointData(latest.current.points) });
          map.addLayer({ id: "flap-points-glow", type: "circle", source: "flap-points", paint: { "circle-radius": 14, "circle-color": "#f59e0b", "circle-opacity": 0.25, "circle-blur": 0.6 } });
          map.addLayer({ id: "flap-points-core", type: "circle", source: "flap-points", paint: { "circle-radius": 6, "circle-color": "#fbbf24", "circle-stroke-width": 1.5, "circle-stroke-color": "#000000" } });
          map.addSource("flap-location", { type: "geojson", data: streetMapLocationData(latest.current.userLocation) });
          map.addLayer({ id: "flap-location-dot", type: "circle", source: "flap-location", paint: { "circle-radius": 7, "circle-color": "#38bdf8", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" } });
          map.on("click", "flap-points-core", (event) => {
            const id = event.features?.[0]?.properties?.id;
            if (typeof id === "string" && latest.current.points.some((point) => point.id === id)) {
              try { latest.current.onSelectPoint?.(id); } catch { console.error("FlapStreetMap onSelectPoint failed."); }
            }
          });
          if (timeout) clearTimeout(timeout);
          if (latest.current.center) map.jumpTo({ center: [latest.current.center.lng, latest.current.center.lat], zoom: streetMapZoom(latest.current.zoom) });
          else if (latest.current.zoom !== undefined) map.setZoom(streetMapZoom(latest.current.zoom));
          emit({ status: "ready" });
          } catch { fail("load-failed"); }
        });
        if (typeof ResizeObserver === "function") {
          resize = new ResizeObserver(() => map?.resize());
          resize.observe(mount);
        }
      }).catch(() => fail("load-failed"));
    }
    return () => {
      disposed = true;
      if (failRef.current === fail) failRef.current = null;
      cleanMap();
    };
  }, [declared, valid]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!valid || !map || !map.getSource("flap-points")) return;
    try {
      (map.getSource("flap-points") as GeoJSONSource | undefined)?.setData(streetMapPointData(points));
      (map.getSource("flap-location") as GeoJSONSource | undefined)?.setData(streetMapLocationData(userLocation));
      if (center) map.jumpTo({ center: [center.lng, center.lat], ...(zoom === undefined ? {} : { zoom: streetMapZoom(zoom) }) });
      else if (zoom !== undefined) map.setZoom(streetMapZoom(zoom));
    } catch { failRef.current?.("load-failed"); }
  }, [points, center, userLocation, zoom, valid]);

  const visibleState = !declared ? { status: "unavailable", reason: "not-declared" } : !valid ? { status: "unavailable", reason: "invalid-input" } : state;
  return <div className={["flap-street-map", className].filter(Boolean).join(" ")} data-flap-ui="street-map" data-map-state={visibleState.status} data-map-reason={visibleState.reason}>
    <style>{MAP_CSS}</style>
    <div ref={containerRef} className="flap-street-map__canvas" aria-hidden={visibleState.status !== "ready"} style={{ visibility: visibleState.status === "ready" ? "visible" : "hidden" }} />
    {visibleState.status !== "ready" && <div className="flap-street-map__fallback">{fallback ?? (validStreetMapPoints(points) ? points.map((point) => <button key={point.id} type="button" onClick={() => onSelectPoint?.(point.id)}>{point.title}</button>) : null)}</div>}
    <div className="flap-street-map__attribution"><a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>{" · "}<a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a>{" · "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></div>
  </div>;
}
