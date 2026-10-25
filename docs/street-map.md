# Shared street map

`FlapStreetMap` from `@/src/ui` keeps map rendering inside the shared Runtime. The published `0.1.40-next.3` testing release provides the basic street map and sensors; **the presentation enhancements below are awaiting a later next testing release**. Stable `0.1.39` provides neither map version. Do not install next.3 expecting the new presentation API. See [the next.3 release record](releases/0.1.40-next.3.md) and [integration guide](device-map-integration.zh-CN.md).

Merge `"mapCapabilities": ["street-map-v1"]` into the existing manifest. Its name and the existing source-package formats remain unchanged. This is separate from `deviceCapabilities` and 3D `capabilities`; it grants no raw MapLibre, URL/style/Worker, network, HTML popup, storage or permission APIs. Existing Vault UI, old Mini Apps and basic map artifacts remain compatible. Keep existing Vault bindings, risk status and business operations.

The [complete CATCH-style example](../examples/street-map/Component.tsx), [English/Chinese/Korean translations](../examples/street-map/i18n.json) and [manifest fragment](../examples/street-map/manifest.fragment.json) demonstrate the enhancements. Merge them into an existing checked source folder; the GPS button also needs `deviceCapabilities:["location"]`. The example uses demonstration data and performs no claim write.

## Point data and migration

The legacy `{id, lat, lng, title}` shape and `onSelectPoint(id)` remain valid. New fields are optional:

```ts
interface FlapStreetMapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  symbol?: string;
  rarity?: "common" | "rare" | "epic" | "legendary";
  place?: string;
  city?: string;
  amount?: string | number;
  expiresAt?: number;
  respawnAt?: number;
  kind?: "store" | "event";
}
```

If CATCH data has no `title`, supply one from `place` or a localized fallback. Normalize nullable deadlines to `undefined`; they cannot be `null`. Both deadlines are **Unix epoch milliseconds**, not seconds or remaining durations. Explicitly multiply backend seconds by `1000` when that is the backend's documented unit. Missing `expiresAt` means no expiry; `0` means already expired. `respawnAt > now` means cooling down. An expired point stays inactive even after its cooldown ends. These values and the client clock control presentation only. `amount` is text for display, never a calculation or authorization input; prefer a string for large or precise token amounts.

There are at most 2,000 points. IDs must be unique, nonempty and at most 128 characters; title is required and at most 256. Coordinates must be finite, longitude within ±180 and latitude within ±85.051129. Optional symbol/place/city limits are 32/160/80 characters. Optional text rejects ASCII control characters. Amount strings are at most 128 characters; numeric amounts must be finite, nonnegative and at most `Number.MAX_SAFE_INTEGER`. Deadlines must be safe nonnegative integers at most `8640000000000000`. Invalid input gives `unavailable/invalid-input` before loading the engine.

## Presentation props

| Prop | Behavior |
| --- | --- |
| `points`, `center`, `zoom`, `userLocation` | Point data and viewport; zoom is clamped to 3–18. `userLocation` updates only the location marker/radius, not the viewport. |
| `rarityColors` | Optional partial palette for the four rarity keys. Values must be exactly six-digit hex, e.g. `#22c55e`; no short hex, CSS names, expressions or URLs. |
| `cityClusters` | Defaults to `true`. Through zoom **7.2 inclusive**, named store points group by trimmed `city`, showing city name and total point count. Click flies to that center at zoom 12. Above 7.2, individual stores replace bubbles. Stores without a city stay visible; events are excluded from city counts. |
| `showPointLabels` | Defaults to `true`. Store labels appear strictly above zoom **10.5** as `symbol · place`, falling back to place, symbol, then title. |
| `showEventCountdowns` | Defaults to `true`. `kind:"event"` uses a separate layer and event label; an `expiresAt` deadline adds a countdown. `rarity:"legendary"` alone does not make an event. |
| `claimRadiusMeters` | Finite **meters**, 0–100,000, around `userLocation`. Missing/zero draws no circle. This is a display radius, not proof of claim range. |
| `selectedPointId`, `onSelectionChange` | Controlled selection and full original point callback, or `null` on clearing. Omit `selectedPointId` for internal selection; pass `null` to clear a controlled selection. |
| `renderPointDetails(point, context)` | Project-owned localized React content inside the map's details slot. There is no HTML-string popup API. |
| `showNavigation`, `showScale` | Both default to `false`. Explicitly enable zoom/north buttons and metric scale. |
| `controlLabels` | Localize `zoomIn`, `zoomOut`, `resetBearing`, `closeDetails`; each nonempty string is at most 128 characters. Defaults are English. |
| `onSelectPoint`, `onStateChange`, `fallback`, `className` | Legacy callbacks and fallback remain supported; outer container has minimum height 400px. Keep attribution visible. |

Default rarity colors are common green `#22c55e`, rare blue `#3b82f6`, epic purple `#a855f7`, legendary gold `#fbbf24`. Cooling or expired points become gray and lose the halo; selection adds an outline. Named-city counts include cooling/expired stores; filter the supplied data if the business view should exclude them. The user marker pulses and respects reduced-motion preferences. The map never requests GPS itself.

## Selection and project details

```tsx
import { FlapStreetMap, STREET_MAP_PRESENTATION_V1 } from "@/src/ui";

// selected is string | null; points and renderDetails come from the project.
<FlapStreetMap
  points={points}
  selectedPointId={selected}
  onSelectionChange={point => setSelected(point?.id ?? null)}
  renderPointDetails={renderDetails}
  claimRadiusMeters={200}
  showNavigation
  showScale
/>;
```

Use `STREET_MAP_PRESENTATION_V1` as the immutable required-export sentinel for enhanced artifacts, as in the complete example. With controlled selection, update parent state for both point and `null` callbacks. The map requests clearing when the selected point disappears; clear selection when replacing or leaving the project view as well. The slot receives the original point, including `amount`, plus:

| Context field | Meaning |
| --- | --- |
| `nowMs` | Current display clock in epoch milliseconds. |
| `coolingDown`, `expired` | Derived cooldown/expiry states; both may be true. |
| `cooldownRemainingMs` | Nonnegative time until `respawnAt`; zero if absent or elapsed. |
| `eventRemainingMs` | Nonnegative time until `expiresAt`, or `null` if absent; available for stores too. |
| `distanceMeters` | Approximate geodesic distance from user location, or `null` when unavailable. |
| `claimRadiusMeters` | Supplied display radius, or `null` when absent. |
| `withinDisplayRadius` | Geometric distance comparison, or `null` without location/radius. |
| `close()` | Clears internal selection or calls the controlled `onSelectionChange(null)`. |

The complete example renders token, rarity, amount, place, city, coordinates, distance, range estimate, cooldown, expiry, event timer and clock. Read CATCH's existing eligibility/inventory state from the `renderPointDetails` closure for additional business UI. **Client location, distance, radius and timers cannot grant claim permission or enforce claim limits.** Keep authoritative eligibility, quantity and claim writes in the existing contract/trusted-service flow. The map provides no persistent claim records or device identity.

## Permissions and fallback

Use `useGeolocation()` and call `request()` directly from a clearly labeled user click. Pass coordinates only when status is `active` with data; inspect accuracy/time and label `mode:"mock"`. Permission refusal leaves the list usable. Explicitly update `center` if the user asks to move the view to their location. Continuous tracking requires an explicit watch request and stop control; see [device sensors](device-sensors.md).

Map state is `{status:"loading"|"ready"|"unavailable", reason?}`. Reasons are `not-declared`, `invalid-input`, `unsupported`, `load-failed`, `timeout`, `context-lost`. Supply a localized usable list/manual alternative. The default fallback is point-title selection buttons; a custom list can control selection and keep the same details slot usable after map failure. WebGL2/Worker failure, resource errors, context loss or a 15-second startup deadline release the map and enter fallback. Intentionally remount to retry. Point/location/callback updates use current props. Timers pause in the background and clean up on unmount.

## Host assets and verification

Both receiving hosts must provide `uiFeatures.streetMap=1` and the `FlapStreetMap` UI export for basic maps. Enhanced artifacts additionally require **`uiFeatures.streetMapPresentation=1` and `STREET_MAP_PRESENTATION_V1=1`**. Workbench records the required UI export so an older receiving host rejects the enhanced artifact before import. Do not hand-edit markers or metadata. Deploy the matching Runtime and checker before accepting new artifacts; publishing npm alone does not upgrade hosts. The `street-map-v1` declaration and source-package formats stay unchanged.

The Runtime lazy-bundles exact `maplibre-gl@6.15.0`; it never loads a CDN engine. Copy the packaged official unmodified Worker and license into the host's `public/runtime-map/`. The Worker must be served as JavaScript at the exact same-origin path `/runtime-map/maplibre-6.15.0-worker.mjs`, without redirects to HTML or another version. SHA256:

```text
1c69066368331aae63967ed24a9affcf962cf55fcc6d8f532a8b040f736dbcfa
```

Build and verification check the contract, bytes, UI exports and tarball inclusion. The engine is not evaluated when importing UI in Node. Map-owned canvas, listeners, ResizeObserver and clock are released; MapLibre retains a page-wide pool capped at two Workers for later maps. This is not CPU/GPU hard isolation.

Only fixed OpenFreeMap dark style, TileJSON, tiles, glyphs and sprites are accepted. Requests use `credentials:"omit"`/`referrerPolicy:"no-referrer"` where the engine's loading path supports them. Fixed attribution links remain visible. The provider sees client IP and viewport; redirects/provider changes remain browser/provider behavior, with no availability guarantee. Unexpected resource paths fail closed into fallback. No resource-policy expansion is part of this enhancement. Test actual supported phones and wallet WebViews; desktop checks do not establish hardware compatibility.
