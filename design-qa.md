# Design QA — Flap Skies Showcase

## Scope

- New Mini App demo: `flap-skies-showcase`
- Existing `three-r3f-example` remains registered and unchanged in purpose.
- Visual reference: `https://tinyskies.vercel.app/`
- Reference capture: desktop 1280 × 720 and mobile 390 × 844, including the entry screen and the post-launch flight state.

## Design decision

The implementation preserves the reference experience hierarchy — full-screen miniature planet, strong centered title, one clear launch action, orbiting vehicle, and post-launch HUD — while replacing the source identity and assets with an original Flap-owned world.

- Uses the official Flap logo and the label `Flap Showcase Only` / `仅供 Flap 展示`.
- Uses original code-built low-poly geometry, a runtime 2D Canvas water texture, local shaders, star fields, particle effects, orbit controls, and postprocessing.
- Uses no Tiny Skies brand assets, models, textures, audio, remote resources, or network calls.
- Public technical references are limited to the MIT-licensed Three.js / React Three Fiber / Drei primitives already declared by `three-r3f-v1`; no third-party demo source was copied wholesale.

## Visual comparison

Desktop and mobile reference/prototype screenshots were reviewed together at matching viewport sizes.

- Composition: passed — the planet is the dominant focal point and the primary action remains centered.
- Brand hierarchy: passed — Flap ownership is visible before interaction without competing with the scene.
- Typography and contrast: passed — title, supporting copy, and controls remain readable over animated backgrounds.
- Responsive behavior: passed — no horizontal overflow, clipped controls, or text overflow at PC, iPad, or H5 sizes.
- Interaction states: passed — Launch, Home, Cruise/Boost, region selection, drag-to-orbit, reduced motion, 2D fallback, and context-loss error states are explicit.
- Originality boundary: passed — the result is recognizably inspired by the reference experience but not a copy of its branding or binary assets.

## Automated evidence

- `yarn vault:check flap-skies-showcase`: passed with only the expected `manual-review/mini-app-3d` warning.
- `yarn vault:e2e flap-skies-showcase`: passed 17 scenarios with 0 blocking issues and 0 warnings.
- E2E coverage includes PC, iPad, H5, default/internal/listed/wrong-network states, WebGL2 fallback, reduced motion, context loss, layout overlap, and overflow checks.

## Open issues

- P0: none
- P1: none
- P2: none

final result: passed
