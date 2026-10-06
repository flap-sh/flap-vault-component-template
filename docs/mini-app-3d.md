# 7777 Vault UI and 7777/8888 Mini App 3D capability

Flap supports standard 3D experiences through the versioned `three-r3f-v1` capability on three explicit surfaces: a mode-less 7777 Vault UI, a token-scoped 7777 Tax Token Mini App, or a token-scoped 8888 zero-tax Mini App. It is opt-in and does not widen any unrelated Vault UI permission.

`three-r3f-v1` is a stable capability and security boundary, not a dependency-major label. Current source authoring and new Workbench builds use the `react19-r3f9` dependency revision. Existing format-6 source packages and already-published artifacts that record the original `react18-r3f8` revision remain supported; they do not need to rename the capability or change product code solely for this migration.

A mode-less 7777 3D Vault UI may use factory, single-Vault, or token bindings, must keep every declared proof token on the 7777 suffix, remains in the default Vault shell, and keeps the host risk-status requirement. A 7777 or 8888 3D Mini App must set `mode: "mini-app"`, use token-only bindings, render a full-height root, provide bilingual `displayTitle`, and follow Mini App audio review. One Mini App artifact must use only 7777 or only 8888 bindings; mixed suffixes are blocked.

## Live examples

- [Flap Streets / Flap 街头 — test demo](https://utter.cash/bnb/0x9adc2f9dbc4578808f0cdb30d51b5199ff4b8888/mini-app?artifactPath=vaultui_flap-streets_01M48AXN0QXNAFVAFBFG6CJNVY%2Fv20261006175534959_flap-streets_ea7c7aedf0c6) — the link opens the published Flap Streets audio-optimization test version. The source provides city driving with keyboard/touch controls, boost/braking, sidewalk pedestrians, collision-triggered police pursuit, three selectable districts, a chase camera with rear view, a mini-map, and four timed checkpoints. Source: [`src/vaults/flap-streets`](../src/vaults/flap-streets); local preview: `http://localhost:3230/flap-streets`.
- `http://localhost:3230/flap-gamefi-arena` — playable GameFi-style energy arena with keyboard/touch movement, boost, collectible cores, score/progress, completion/restart states, Flap logo, and the `Play the curve. Shape the world.` slogan. It is an original code-built adaptation of the movement and spatial-interaction ideas demonstrated by the official Three.js `games_fps` example; it does not copy that example's assets.
- `http://localhost:3230/flap-skies-showcase` — polished Flap-branded showcase with the visible `Flap Showcase Only` mark.
- `http://localhost:3230/three-r3f-example` — compact technical fixture covering the complete build and validation path.
- The Template Mini App tab (`/?tab=mini-app`) includes these four 3D examples; the Flap Streets card provides both the published demo and the local source preview. The public template deployment is [flap-vault-component-template.vercel.app](https://flap-vault-component-template.vercel.app/?tab=mini-app); local changes appear there only after the template is deployed.
- Flap Farm remains on that page as the original non-3D Mini App shell and interaction guide.

Choose the example by purpose: use `flap-streets` for vehicle simulation and a playable 2D fallback, start with `flap-gamefi-arena` for movement/collection gameplay patterns, use `flap-skies-showcase` for visual polish, and use `three-r3f-example` for the smallest capability-integration fixture.

### Flap Streets implementation and reuse

- `Component.tsx` connects the Flap SDK/i18n, keyboard and touch controls, district selector, HUD, pause/restart states, quality setting, visible sound toggle, and 2D fallback. `sound.ts` connects React refs to the bundled HTML audio controller in `audioPlayback.ts`, with speed-dependent engine volume, tire squeal, distance-dependent police siren, collision/checkpoint cues, and a looping background track with automatic ducking. `City.tsx` renders the city and camera through React Three Fiber; `StreetLife.tsx` supplies original instanced pedestrians and district props. `world.ts` defines each district, sidewalk routes and bounded collision-safe police navigation. `driving.ts` contains vehicle, pedestrian/traffic collision, pursuit, checkpoint, timer, and score simulation. Driving feedback includes smooth steering, wheel motion, body lean, brake lights, tire marks/smoke, collision sparks/rebound, and brief camera shake (disabled with reduced motion).
- It declares `mode: "mini-app"` and `capabilities: ["three-r3f-v1"]`, with a token-only BNB Chain binding (`chainId: 56`). The linked demo uses Flap's standard deployed 8888 preview token; do not treat it as your project's production token.
- The city-driving idea was inspired by [GTA_Taipei](https://github.com/stun0019/GTA_Taipei). This example uses original procedural geometry and driving code, with no copied upstream game bundle or assets. It is a compact driving prototype, not a port of the full game.
- Scores exist only for the current run. There are no token rewards, contract writes, saved progress, or server-verified rankings. Labels are provided in English, Chinese, and Korean.
- The source folder, preview route and ZIP slug are now `flap-streets`. The manifest identity is `vaultui_flap-streets_01M48AXN0QXNAFVAFBFG6CJNVY`, matching the renamed source folder. Published Flap Streets versions use this Workbench artifact identity; existing published versions under the previous Taipei Drive identity are unchanged. The user-facing name remains **Flap Streets / Flap 街头**. The previous local route redirects to `/flap-streets` and preserves query parameters.
- The **test demo** pins artifact version `v20261006175534959_flap-streets_ea7c7aedf0c6`, built from source package SHA-256 `ea7c7aedf0c62b98efff8ea9f73d5527d42377eaf5e462803d5f1b3049113285`. It includes the Flap Streets branding, districts, pursuit, rendering optimizations and native-speed audio changes. Safari driving smoothness still needs device testing; publication alone does not confirm it. Preserve the complete `artifactPath` query when sharing it; the token URL alone does not identify this demo version.

For local development, run `yarn dev --port 3230` and open `/flap-streets`. After changing the source, use the normal `vault:check` → `vault:e2e` → `vault:package` → `vault:verify-package` flow, then submit the generated ZIP to Artifact Workbench. Updating a template example or documentation link does not publish a new artifact. Once a new artifact version is published, update its URL in this document, both READMEs, and the homepage's `streetsTestDemoUrl` together. See [Artifact Workbench](./artifact-intake.md) for the publication boundary.

### Flap Streets districts and pursuit

Choose **Dusk Downtown**, **Neon Market**, or **Palm Coast** before starting. Downtown has tall buildings and a tower landmark; the market has shorter buildings, open courtyards, lantern stalls and night lighting; the coast has an open waterfront, palms, benches and low-rise buildings. Each has its own checkpoint route. The pause panel also lets players switch districts, explicitly starting a fresh run with score, timer and pursuit reset.

There are 32 locally modeled walkers with individual clothing, walk cycles and avoidance on sidewalk segments. Contact is abstract and non-graphic. A significant collision with a building, traffic or a walker brings one patrol from behind, using another safe nearby position if the rear position is obstructed. The patrol navigates around buildings using a bounded 43 × 43 grid and shares the player's collision geometry. Hold **R** or the pursuit panel's rear-view button to look behind while driving. Keep more than 42 metres away for five seconds to escape; staying within four metres at low speed for 2.5 seconds after the initial grace period ends the run. Progress is visible in the pursuit HUD and the patrol is marked on both maps. Pausing freezes the simulation; reduced motion removes gait/impact shake and uses steady police lights. The playable 2D fallback retains pedestrians, police and the same game rules.

The models are original low-poly geometry, packaged with the source. No third-party GLB/GLTF downloads or external asset requests are needed. The GTA_Taipei mirror was inspected for behavioral inspiration (walkers, wanted state, police lights/siren), not copied into this package.

Run the focused simulation checks with `node --test scripts/flap-streets.test.mjs`; they include map routes, patrol navigation, capture/escape, pedestrian contact and audio state. This complements the official PC/iPad/H5 readiness, layout and fallback proof; it is not a physical-device or perceptual audio test.

### Flap Streets rendering performance

`streetGeometry.ts` preserves the original road/building dimensions and groups static pieces into 50-metre tiles; `Scenery.tsx` uploads their transforms and colors once using instanced meshes. Downtown's 1,381 static pieces use 70 batches, the market's 847 use 68, and the coast's 763 use 62, before camera culling. These counts exclude landmarks, district props and vehicles. `Traffic.tsx` draws the ten traffic cars in five batches while the player and patrol retain their individual animated models.

The scene is memoized independently of the 10 Hz HUD. Briefing, pause and terminal states use demand rendering and stop the simulation loop; the 2D map redraws on resize/map change and only animates during a run. Pedestrian poses update at up to 30 Hz, with clothing colors uploaded once. Continuous audio controls use discrete volume levels at up to 5 Hz, cache desired state without reading media properties in the frame loop, keep clips at native speed, and pause idle tire/siren tracks; collision/checkpoint sounds still respond to each event. Smooth mode uses DPR 1 without hardware multisample antialiasing. High quality raises DPR to at most 1.5 and enables shadows; switching quality does not reset the run.

For browser comparisons, use the same map, camera, quality, window size and audio state, keep the tab in the foreground, and close performance recording while measuring. The 3D canvas exposes `data-flap-render-fps`, `data-flap-median-fps` (up to eight recent one-second windows), `data-flap-draw-calls` and `data-flap-render-ms`. The last value measures CPU time inside Three's render callbacks, not GPU completion time. Measurements stop with the run and retain their last sample; background-tab gaps and first-time shader compilation are not representative steady-state frame rates. These optimizations do not constitute a Safari FPS guarantee; test actual Safari on the target hardware as well as the official Chromium readiness/fallback checks.

### Flap Streets audio and preview assets

The six top-level WAV files are original procedural sounds generated by `scripts/generate-flap-streets-audio.py` using Python's standard library, with no recordings, third-party samples, network services, or added dependencies. They ship under the template's MIT license. Total audio is approximately 1.15 MiB, mono, 22.05 kHz. The engine/tire loops use discrete, bounded volume levels at their native playback speed; impact/checkpoint clips play once per simulation event. There is no playback on page load. Clicking Start or Drive again enables sound inside that user gesture; the visible speaker button can mute both music and effects at any time. Resume preserves the current mute choice. The 20-second, 96 BPM background track is an original eight-bar Am7 / Fmaj7 / Cmaj7 / G6 arrangement with soft synthesized pads, bass, plucks and percussion. Note release tails wrap across the loop boundary. It plays at fixed pitch and speed, starts at a low mix level and lowers it during police pursuit or impacts. Restarting starts the track again; pause/resume and mute/unmute preserve its playback position. All six elements are unlocked in the Start/Resume gesture. Unused effects are immediately paused when their play promises settle; only music and engine remain playing. Tire/siren loops start or stop on activity transitions, and the siren becomes audible only during pursuit. Runtime `playbackRate` and `preservesPitch` writes are deliberately avoided because of Safari media-pipeline stalls observed with sound enabled; acceleration is represented by volume bands rather than real-time pitch shifts. HTML audio volume support varies by browser, so inactive tracks also use the explicit muted property. Pausing, ending a run, muting, or unmounting stops the driving loops. Moving focus to another element outside the game component pauses the run. A gap of more than 0.5 seconds between animation frames also pauses the run on the next frame; this does not guarantee an immediate audio stop when the tab moves to the background. A failed playback request leaves the game playable without audio. The last checkpoint chime may finish after completion. Mini App audio still carries the standard source/license, playback, fallback, and mobile review warning.

The Flap butterfly is reused from the template's existing GameFi example, with the user-requested `Flap GameFi Lab / Flap Showcase Only` badge. The homepage image shows the updated **English** preview, and its online button opens the published Flap Streets test version above. For future releases, replace the complete URL only after Workbench has produced the new version's real preview link.

To generate English validation screenshots, use `yarn vault:e2e flap-streets --lang en`; `--lang zh` selects Chinese and omitting the flag preserves the existing preview default. The same PC/iPad/H5 and fallback checks still run.

## Capability matrix

| Area | `three-r3f-v1` support |
| --- | --- |
| Eligibility | Either mode omitted with only real deployed `7777` proof tokens and factory/Vault/token bindings, or `manifest.mode: "mini-app"` with token-only bindings that are all `7777` or all `8888`; all surfaces declare `capabilities: ["three-r3f-v1"]` |
| Missing project test token | A 7777 Vault UI or 7777 Mini App must pass an explicit real deployed `--token 0x...7777`. An 8888 Mini App may omit `--token`; scaffold then uses Flap's deployed standard 8888 Mini App preview token for preview/E2E proof only. |
| Current pinned packages | `react@19.2.8`, `three@0.185.1`, `@react-three/fiber@9.7.0`, `@react-three/drei@10.7.8`, `@react-three/postprocessing@3.0.4` (`react19-r3f9`) |
| Accepted legacy revision | Existing packages/artifacts with `react@18.3.1`, `three@0.185.1`, `@react-three/fiber@8.18.0`, `@react-three/drei@9.122.0`, and `@react-three/postprocessing@2.19.1` (`react18-r3f8`) remain valid under the same `three-r3f-v1` capability. |
| Source | Recursive, statically reachable `.ts` and `.tsx` inside the current Vault folder |
| Shaders | `.glsl`, `.vert`, and `.frag`, bundled as text |
| Local assets | GLB/GLTF/BIN models; PNG/JPEG/WebP/AVIF/KTX2/Basis textures; HDR/EXR environments; TTF/OTF/WOFF/WOFF2 fonts; controlled decoder/transcoder WASM |
| Rendering APIs | WebGL2, explicit WebGL1/2D/static fallback, 2D canvas, request/cancelAnimationFrame, ResizeObserver, devicePixelRatio, controlled canvas creation, FontFace/document.fonts, matchMedia, and read-only display/hardware signals |
| Runtime helpers | Artifact-relative asset URLs and Draco/KTX2 decoder URLs; no Drei/CDN default fallback |
| Packaging | Source format 6, E2E report v2, recursive source/asset hashes, shaders and pinned dependencies in `component.mjs`, content-addressed binary assets under `assets/**` |
| Deterministic state | Root exposes `data-flap-3d-state="loading|ready|fallback|error"` and `data-flap-3d-renderer="webgl2|webgl1|2d"` |
| Review | Mode-less 7777 Vault UI emits `manual-review/vault-ui-3d`; both 7777 and 8888 Mini Apps emit `manual-review/mini-app-3d`; all surface font license/provenance and performance/fallback review signals |

## What remains blocked

The capability does not allow arbitrary npm packages, dynamic imports, path escape, symlinks, unreferenced files, remote URLs/assets, network calls, storage, navigation, permission APIs, direct wallet APIs, Worker creation, script injection, arbitrary DOM queries, or undeclared contract targets. Business contract calls remain limited to the existing SDK and manifest binding/external-contract rules.

Three r185 is WebGL2-first. `webgl1` is an explicit low-spec fallback state, not a promise that the WebGL2 scene renders unchanged. A controlled WebGL1 implementation, 2D canvas renderer, or clear static fallback is valid.

## Static asset imports

Every local source and asset must be reachable from `Component.tsx` through static imports. Passing a relative string directly to a Three/Drei loader does not add the file to the validated import graph and is blocked as `capability-assets/unreferenced-file`.

```tsx
import { useGLTF } from "@react-three/drei";
import modelUrl from "./assets/model.glb";

export function Model() {
  const model = useGLTF(modelUrl);
  return <primitive object={model.scene} />;
}
```

Do not use `useGLTF("./assets/model.glb")`. The same rule applies to textures, fonts, environments, shaders, and decoder resources.

Raster image imports have two host shapes: Next preview exposes `StaticImageData`, while the Workbench artifact emits a URL string. Normalize once before passing a raster asset to Three or a DOM image:

```tsx
import textureAsset from "./assets/texture.png";

const textureUrl = typeof textureAsset === "string" ? textureAsset : textureAsset.src;
```

## Profile limits

- Up to 200 source/package files.
- Zip no larger than 25 MiB and extracted package no larger than 64 MiB.
- Single asset no larger than 32 MiB and total assets no larger than 60 MiB.
- Single font no larger than 2 MiB and total fonts no larger than 4 MiB.
- Performance guidance may warn before the security limit blocks the package.

## Authoring and proof

For a 7777 Vault UI, keep `manifest.mode` omitted. Provide an explicit real deployed `7777` proof token; scaffold does not substitute the standard 8888 Mini App preview token for this surface.

```bash
yarn vault:scaffold my-3d-vault \
  --name "My 3D Vault UI" \
  --capability three-r3f-v1 \
  --chain 56 \
  --factory 0xRealFactory \
  --token 0xRealDeployedTokenEnding7777 \
  --locales en,zh
```

For a 7777 Tax Token or 8888 zero-tax Mini App, add `--mode mini-app`, use token-only bindings, and keep every token on the same suffix:

```bash
yarn vault:scaffold my-3d-app \
  --mode mini-app \
  --capability three-r3f-v1 \
  --chain 56 \
  --token 0xRealDeployedTokenEnding7777Or8888 \
  --display-title-zh "三维应用" \
  --display-title-en "3D App"

yarn vault:check my-3d-app
yarn vault:e2e my-3d-app
yarn vault:package my-3d-app
yarn vault:verify-package dist/my-3d-app.zip
```

The E2E proof must cover PC, iPad, and H5; ready canvas size and first frame; WebGL2; resize and DPR; reduced motion; WebGL2-unavailable fallback; context loss; and zero undeclared external requests.
