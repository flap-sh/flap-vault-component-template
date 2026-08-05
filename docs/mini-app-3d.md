# 7777 Vault UI and 8888 Mini App 3D capability

Flap supports standard 3D experiences through the versioned `three-r3f-v1` capability on two explicit surfaces: a mode-less 7777 Vault UI, or a token-scoped 8888 Mini App. It is opt-in and does not widen any unrelated Vault UI permission.

A 7777 3D Vault UI may use factory, single-Vault, or token bindings, must declare at least one real deployed 7777 proof token, and must keep every declared proof token on the 7777 suffix. It remains in the default Vault shell, must show host-derived contract risk status before the 3D visual, cannot add Mini App audio, and must omit `displayTitle` and `mode`. An 8888 3D Mini App keeps the existing token-only binding, bilingual `displayTitle`, full-height root, audio review, and risk-status exemption. Mixed 7777/8888 3D artifacts are blocked.

## Live examples

- `http://localhost:3230/flap-gamefi-arena` — playable GameFi-style energy arena with keyboard/touch movement, boost, collectible cores, score/progress, completion/restart states, Flap logo, and the `Play the curve. Shape the world.` slogan. It is an original code-built adaptation of the movement and spatial-interaction ideas demonstrated by the official Three.js `games_fps` example; it does not copy that example's assets.
- `http://localhost:3230/flap-skies-showcase` — polished Flap-branded showcase with the visible `Flap Showcase Only` mark.
- `http://localhost:3230/three-r3f-example` — compact technical fixture covering the complete build and validation path.
- The public Template Mini App tab links all three 3D previews prominently: `https://flap-vault-component-template.vercel.app/?tab=mini-app`.
- Flap Farm remains on that page as the original non-3D Mini App shell and interaction guide.

Choose the example by purpose: start with `flap-gamefi-arena` for interactive gameplay patterns, use `flap-skies-showcase` for visual polish, and use `three-r3f-example` for the smallest capability-integration fixture.

## Capability matrix

| Area | `three-r3f-v1` support |
| --- | --- |
| Eligibility | Either mode omitted with only real deployed `7777` proof tokens and factory/Vault/token bindings, or `manifest.mode: "mini-app"` with token-only real deployed `8888` bindings; both declare `capabilities: ["three-r3f-v1"]` |
| Missing project test token | Omit `--token` during scaffold to use Flap's deployed standard Mini App preview token for the selected supported chain. It is preview/E2E proof only, not the project's production CA restriction. |
| Pinned packages | `three@0.185.1`, `@react-three/fiber@8.18.0`, `@react-three/drei@9.122.0`, `@react-three/postprocessing@2.19.1` |
| Source | Recursive, statically reachable `.ts` and `.tsx` inside the current Vault folder |
| Shaders | `.glsl`, `.vert`, and `.frag`, bundled as text |
| Local assets | GLB/GLTF/BIN models; PNG/JPEG/WebP/AVIF/KTX2/Basis textures; HDR/EXR environments; TTF/OTF/WOFF/WOFF2 fonts; controlled decoder/transcoder WASM |
| Rendering APIs | WebGL2, explicit WebGL1/2D/static fallback, 2D canvas, request/cancelAnimationFrame, ResizeObserver, devicePixelRatio, controlled canvas creation, FontFace/document.fonts, matchMedia, and read-only display/hardware signals |
| Runtime helpers | Artifact-relative asset URLs and Draco/KTX2 decoder URLs; no Drei/CDN default fallback |
| Packaging | Source format 6, E2E report v2, recursive source/asset hashes, shaders and pinned dependencies in `component.mjs`, content-addressed binary assets under `assets/**` |
| Deterministic state | Root exposes `data-flap-3d-state="loading|ready|fallback|error"` and `data-flap-3d-renderer="webgl2|webgl1|2d"` |
| Review | `manual-review/mini-app-3d`, plus font license/provenance and performance/fallback review signals |

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

```bash
yarn vault:scaffold my-3d-app \
  --capability three-r3f-v1 \
  --chain 56 \
  --token 0xRealDeployedTokenEnding8888 \
  --display-title-zh "三维应用" \
  --display-title-en "3D App"

yarn vault:check my-3d-app
yarn vault:e2e my-3d-app
yarn vault:package my-3d-app
yarn vault:verify-package dist/my-3d-app.zip
```

The E2E proof must cover PC, iPad, and H5; ready canvas size and first frame; WebGL2; resize and DPR; reduced motion; WebGL2-unavailable fallback; context loss; and zero undeclared external requests.
