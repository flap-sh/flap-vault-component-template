# Runtime device sensors

Location, motion and orientation are shared Runtime features for Vault UI and Mini Apps. Components use the SDK; hosts own browser access and permission handling. This additive feature requires `runtime-contract.json` to advertise `sdkFeatures.deviceSensors=1`; it is not included in the previously published stable `0.1.39` package.

The published `0.1.40-next.2` testing Runtime contains these APIs together with Mini App routing and the shared street map. The follow-up `0.1.40-next.3` is being prepared to align map source-package metadata and verification; do not describe it as published until its release is confirmed. Stable `latest` remains `0.1.39`. Testing consumers must use the same exact published version and matching schema/policy inputs. See the [next.2 publication evidence](releases/0.1.40-next.2.md) and the [developer integration guide](device-map-integration.zh-CN.md) for the coordinated follow-up and testing commands.

## Component integration

Declare only the capabilities used in `manifest.json`:

```json
{ "deviceCapabilities": ["location", "motion", "orientation"] }
```

The field is independent of the existing `capabilities` profiles. It does not permit additional files, dependencies or raw browser APIs. Missing declarations and empty arrays keep old Vault UI and existing Mini Apps compatible, with no permission prompt or sensor collection on mount.

```tsx
import { useDeviceMotion, useGeolocation } from "@/src/sdk";

const location = useGeolocation();
const motion = useDeviceMotion();
// Call directly in an explicit click handler, using labels from i18n.json:
const enableLocation = () => void location.request();
const enableMotion = () => void motion.request();
```

`useDeviceOrientation()` provides orientation. The same channels are available on `useFlapSdk().device` for bound Vault UI and `useMiniAppSdk().device` for independent Apps. Each channel exposes `getSnapshot()`, `subscribe(listener)`, `request(options?)` and `stop()`. Hooks own their subscription cleanup. Snapshots contain `status`, `permission`, `data` and `mode`; `mode` is `real` or explicitly simulated `mock`.

## Permissions and fallbacks

Permission is independent from availability. A granted permission does not establish a working sensor; wait for `status === "active"` and valid data. Handle `denied`, `unsupported`, `insecure`, `policy-blocked`, `timeout`, `unavailable` and `not-declared` explicitly, and keep `idle`, `requesting`, `paused` and `cancelled` distinct. A permission state may remain `unknown` when the browser cannot report it without a request.

Use HTTPS on phones; `http://computer-LAN-IP` is not a secure-context substitute. The system, browser, site and embedded wallet may impose separate restrictions. Motion permission must be requested within a user gesture where the browser exposes `requestPermission()`; do not await unrelated work or open an asynchronous confirmation modal before that call. Location invokes its own browser permission flow. There is no universal single prompt granting every sensor.

Location is a system estimate, not guaranteed raw GPS. Inspect accuracy and timestamp, allow for approximate positions, and handle timeout/unavailable results. Motion data may be partial; use only finite values supplied by the selected channel. Page hiding/locking can pause data; a component must not treat old data as a fresh reading after returning to the page.

The Runtime normalizes technical failure and lifecycle handling. Components supply business fallback: manual region selection for location where appropriate, and click/touch controls for shake/tilt. Keep fallback values visibly distinct from actual sensor readings. Never invent a successful location or motion reading on failure.

## Hosts and preview

Hosts may inject `deviceSensors` into `VaultRuntimeProvider` or `MiniAppRuntimeProvider`. `createBrowserDeviceSensors` and `createMockDeviceSensors` are host-only exports from `@flapsdk/vault-runtime/host`. Providers scope the service to the manifest declaration, so injected adapters cannot implicitly grant a missing capability. Components must not create providers or adapters.

Preview simulation must be explicit and labeled; it tests permission/failure/fallback behavior and is not hardware or wallet compatibility proof. Test iPhone Safari, Android Chrome and the actual supported wallets on devices, including refusal, system restriction, empty data, timeout, route change and background/foreground recovery.

Workbench checks declaration/schema, records device access for review and rejects use when its pinned Runtime lacks the feature. Native `navigator.geolocation`, browser permission APIs, `DeviceMotionEvent`/`DeviceOrientationEvent`, Generic Sensor constructors and direct sensor event listeners remain blocked. These source checks are not browser-origin isolation: artifacts still execute in the host page.

## Coordinated rollout

Deploy the same published supporting Runtime and matching policy inputs on the testing main site and Workbench before accepting new device-dependent packages. A private canary remains an optional pre-publication consumer test and cannot be source-ZIP provenance. Explicit next source-package testing is limited to standalone Mini App v2 and retains official-next freshness, exact published version/gitHead, E2E and archive verification; ordinary `app:*` commands and legacy packages retain main/latest. See the [integration guide](device-map-integration.zh-CN.md). Old artifacts continue to load unchanged. A host must check the feature before evaluating a new artifact that imports new device hooks; an old host cannot make an unknown hook work merely by showing a component-level fallback.
