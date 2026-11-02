import type { MiniAppRouteSnapshot, MiniAppRouterAdapter } from "./miniAppRoutingTypes";

const CONTROL = /[\u0000-\u0020\u007f]/;
const ENCODED_SEPARATOR = /%(?:2f|5c)/i;
const ENCODED_CONTROL = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i;
const ENCODED_AGAIN = /%[0-9a-f]{2}/i;

/** Validate before URL normalization can erase traversal or encoded separators. */
export function parseMiniAppPath(path: string): MiniAppRouteSnapshot {
  if (typeof path !== "string" || path.length > 8192 || !path.startsWith("/") || path.startsWith("//") || path.includes("#") || path.includes("\\") || CONTROL.test(path)) throw new Error("mini-app-routing/invalid-path");
  const queryAt = path.indexOf("?");
  const rawPathname = queryAt < 0 ? path : path.slice(0, queryAt);
  const search = queryAt < 0 ? "" : path.slice(queryAt);
  if (rawPathname.includes("//") || ENCODED_SEPARATOR.test(rawPathname) || ENCODED_CONTROL.test(rawPathname)) throw new Error("mini-app-routing/invalid-path");
  const rawSegments = rawPathname === "/" ? [] : rawPathname.slice(1).replace(/\/$/, "").split("/");
  let segments: string[];
  try { segments = rawSegments.map((segment) => decodeURIComponent(segment)); }
  catch { throw new Error("mini-app-routing/invalid-path"); }
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[/\\\u0000-\u001f\u007f]/.test(segment) || ENCODED_AGAIN.test(segment))) throw new Error("mini-app-routing/invalid-path");
  return Object.freeze({ pathname: segments.length ? `/${segments.map(encodeURIComponent).join("/")}` : "/", segments: Object.freeze(segments), search: search === "?" ? "" : search });
}

function sameRoute(a: MiniAppRouteSnapshot, b: MiniAppRouteSnapshot) { return a.pathname === b.pathname && a.search === b.search; }

/** Isolated preview history; never changes the Workbench management URL. */
export function createMiniAppMemoryRouter(initialPath = "/"): MiniAppRouterAdapter {
  const entries = [parseMiniAppPath(initialPath)];
  let index = 0;
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => entries[index],
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    push(path) { const next = parseMiniAppPath(path); entries.splice(index + 1, entries.length, next); index++; emit(); },
    replace(path) { const next = parseMiniAppPath(path); if (!sameRoute(entries[index], next)) { entries[index] = next; emit(); } },
    back() { if (index > 0) { index--; emit(); } else if (entries[0].pathname !== "/") { entries[0] = parseMiniAppPath("/"); emit(); } },
  };
}

export interface MiniAppBrowserRouter extends MiniAppRouterAdapter {
  /** Call after host-driven navigation; adapter-owned navigation already emits. */
  sync(): void;
  dispose(): void;
}

const HISTORY_KEY = "__flapMiniAppRouting";
let browserRouterSequence = 0;

/** Uses the host Window so SDK consumers never receive raw browser access. */
export function createMiniAppBrowserRouter({ basePath, window: hostWindow, preserveSearchParams = [] }: { basePath: string; window: Window; preserveSearchParams?: readonly string[] }): MiniAppBrowserRouter {
  const base = parseMiniAppPath(basePath);
  if (base.pathname === "/" || base.search || base.pathname !== basePath) throw new Error("mini-app-routing/invalid-base-path");
  const scope = `${Date.now()}:${++browserRouterSequence}`;
  const listeners = new Set<() => void>();
  let disposed = false;
  const read = () => {
    const pathname = hostWindow.location.pathname;
    if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) throw new Error("mini-app-routing/outside-app");
    return parseMiniAppPath(`${pathname.slice(basePath.length) || "/"}${hostWindow.location.search}`);
  };
  let snapshot = read();
  const state = (index: number) => {
    const next = { ...(hostWindow.history.state ?? {}), [HISTORY_KEY]: { basePath, scope, index } };
    // Next's patched History methods use these write markers to bypass their
    // pathname sync. Let Next restore its markers while preserving all other keys.
    delete next.__NA; delete next._N;
    return next;
  };
  const currentIndex = () => {
    const entry = hostWindow.history.state?.[HISTORY_KEY];
    return entry?.basePath === basePath && entry.scope === scope && Number.isSafeInteger(entry.index) && entry.index >= 0 ? entry.index as number : 0;
  };
  const href = (next: MiniAppRouteSnapshot) => `${basePath}${next.pathname === "/" ? "" : next.pathname}${next.search}`;
  const sync = () => {
    if (disposed) return;
    if (hostWindow.location.pathname !== basePath && !hostWindow.location.pathname.startsWith(`${basePath}/`)) return;
    const next = read();
    if (!sameRoute(snapshot, next)) { snapshot = next; for (const listener of listeners) listener(); }
  };
  // Seeding the same URL must retain framework markers even when this runs
  // before Next installs its patched History methods.
  hostWindow.history.replaceState({ ...(hostWindow.history.state ?? {}), [HISTORY_KEY]: { basePath, scope, index: 0 } }, "", hostWindow.location.href);
  sync();
  hostWindow.addEventListener("popstate", sync);
  const navigate = (path: string, replace: boolean) => {
    if (disposed) throw new Error("mini-app-routing/disposed");
    if (hostWindow.location.pathname !== basePath && !hostWindow.location.pathname.startsWith(`${basePath}/`)) throw new Error("mini-app-routing/outside-app");
    let next = parseMiniAppPath(path);
    if (preserveSearchParams.length) {
      const currentQuery = new URLSearchParams(hostWindow.location.search);
      const query = new URLSearchParams(next.search);
      for (const key of preserveSearchParams) {
        query.delete(key);
        for (const value of currentQuery.getAll(key)) query.append(key, value);
      }
      next = parseMiniAppPath(`${next.pathname}${query.size ? `?${query}` : ""}`);
    }
    if (replace) hostWindow.history.replaceState(state(currentIndex()), "", href(next));
    else hostWindow.history.pushState(state(currentIndex() + 1), "", href(next));
    sync();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    push: (path) => navigate(path, false),
    replace: (path) => navigate(path, true),
    back() {
      if (disposed) throw new Error("mini-app-routing/disposed");
      if (hostWindow.location.pathname !== basePath && !hostWindow.location.pathname.startsWith(`${basePath}/`)) throw new Error("mini-app-routing/outside-app");
      if (currentIndex() > 0) hostWindow.history.back();
      else if (read().pathname !== "/") navigate("/", true);
    },
    sync,
    dispose() { disposed = true; hostWindow.removeEventListener("popstate", sync); listeners.clear(); },
  };
}
