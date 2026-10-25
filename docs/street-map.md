# Shared street map

`FlapStreetMap` from `@/src/ui` is a small, fixed street-map surface for existing Vault UI and Mini Apps. Use the published `0.1.40-next.3` testing Runtime and corrected source packager; the pinned stable Runtime `0.1.39` does not provide it. See [release status](releases/0.1.40-next.3.md) and the [developer integration guide](device-map-integration.zh-CN.md) before installing. Both receiving hosts must advertise `uiFeatures.streetMap=1` and the `FlapStreetMap` UI export before accepting map-dependent packages. Existing packages remain compatible.

Merge this optional declaration into the existing manifest:

```json
{ "mapCapabilities": ["street-map-v1"] }
```

This field is separate from 3D `capabilities` and sensor `deviceCapabilities`. It does not permit custom imports, raw MapLibre, network requests, browser workers, map URLs or permission APIs in authored components. Keep the ordinary checked `component.mjs` workflow. No sandbox, proxy, new service, deployment or storage capability is added.

Copy [the complete example](../examples/street-map/Component.tsx) into an existing checked component directory and merge [its translations](../examples/street-map/i18n.json) and [manifest fragment](../examples/street-map/manifest.fragment.json). The optional location button additionally needs `deviceCapabilities:["location"]`. Keep translations in that component's `i18n.json`; the example contains English and Chinese. The existing Runtime provider supplies the manifest and translations.

```tsx
import { FlapStreetMap, type FlapStreetMapPoint } from "@/src/ui";

const points: FlapStreetMapPoint[] = [
  { id: "shop-1", lat: 31.2304, lng: 121.4737, title: t("map.shop") },
];
<FlapStreetMap
  points={points}
  center={{ lat: 31.2304, lng: 121.4737 }}
  zoom={12}
  userLocation={userLocation}
  onSelectPoint={selectShop}
  onStateChange={setMapState}
  fallback={shopList}
/>;
```

`points` has a maximum of 2,000 entries, unique nonempty IDs up to 128 characters, titles up to 256 characters and optional rarity `common|rare|epic|legendary`. Longitude must be finite within ±180; latitude within ±85.051129. Invalid inputs produce `unavailable/invalid-input` without loading the engine. Zoom is clamped to 3–18. `center` controls the viewport when supplied; updating `userLocation` only updates the location dot. Titles are rendered as React text in the default fallback; there is no HTML popup API. The optional `className` styles the outer container. Do not hide or cover attribution.

State is `{status:"loading"|"ready"|"unavailable", reason?}`. Unavailability reasons are `not-declared`, `invalid-input`, `unsupported`, `load-failed`, `timeout`, `context-lost`. Supply a localized, usable list/manual alternative and keep business actions working without the map. By default the fallback lists the provided point titles as selection buttons. Engine/Worker/WebGL2 failure, resource errors, context loss or the 15-second startup deadline release the map and show fallback. Remount intentionally to retry. Maps clean up on unmount and React StrictMode replay; point/location/callback updates use current props. MapLibre 6.15 keeps a page-wide shared pool, capped here at two Workers, for later maps even after a map is removed, potentially until the page closes. Canvas, map subscriptions and ResizeObserver are released; this adapter does not dismantle MapLibre's cached global dispatcher or patch vendor internals. `map.remove()` cleans the map instance; there is no hard CPU/GPU isolation guarantee. No browser location permission or collection occurs on map mount.

To show location, use the existing `useGeolocation()` hook and call `request()` directly from a clearly labeled click. Pass coordinates only while `status === "active"` with actual data, inspect accuracy and age, and distinguish approximate or simulated readings. Permission refusal and location unavailability must leave the list usable. The map does not request or infer location itself.

## Host assets and package verification

The Runtime lazy-bundles exact `maplibre-gl@6.15.0`, not a CDN loader. Its package includes the official unmodified static Worker at `runtime-map/maplibre-6.15.0-worker.mjs` and `runtime-map/LICENSE.maplibre.txt`. Hosts copy these into `public/runtime-map/` so the Worker is served at the fixed same-origin URL `/runtime-map/maplibre-6.15.0-worker.mjs`. Do not redirect that path to HTML or a different engine version. Worker SHA256:

```
1c69066368331aae63967ed24a9affcf962cf55fcc6d8f532a8b040f736dbcfa
```

`runtime-contract.json` records the feature and Worker identity. Package build and verification check its bytes, UI export and tarball inclusion. The engine is not evaluated when importing the UI package in Node. Tiny scoped CSS supports the canvas; the engine's remote attribution HTML is disabled and replaced by fixed OpenFreeMap/OpenMapTiles/OpenStreetMap links.

Resources go directly to the fixed OpenFreeMap HTTPS host. The request transform checks style, TileJSON, vector/raster tiles, glyphs and sprites, and uses Fetch `credentials:"omit"` and `referrerPolicy:"no-referrer"` where MapLibre's loading path supports them. No App-provided URL is accepted. This is a restricted map adapter, not browser network isolation: redirects and third-party service changes remain browser/provider behavior. The provider can see the client's IP and requested map viewport. There is no uptime guarantee. A changed provider path fails closed into the list and may require a reviewed Runtime update. Test actual supported phones and wallet WebViews; desktop browser tests do not establish device compatibility.
