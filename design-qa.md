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

---

# Flap Energy Arena design QA

- Source visual truth: `dist/design-qa/threejs-games-fps-reference.jpg`
- Implementation screenshot: `dist/design-qa/flap-energy-arena-intro.jpg`
- Combined comparison: `dist/design-qa/comparison-stack.jpg`
- Viewport: desktop in-app browser, 2056 CSS px wide
- Source pixels: 2056 x 1088
- Implementation pixels: 2056 x 1032
- Density normalization: both captures use the same browser surface and pixel width; the comparison keeps native pixels and stacks the complete visible viewport captures vertically.
- State: official Three.js `games_fps` initial arena view compared with Flap Energy Arena briefing state.

## Full-view comparison evidence

The source establishes the intended mechanic: a navigable three-dimensional arena, clear movement instructions, architectural obstacles, and a strong sense of spatial depth. The implementation preserves those product-level traits while intentionally replacing the source's blue collision-debug environment with an original Flap GameFi arena, code-built hover runner, collectible energy cores, score/progress HUD, completion loop, real Flap logo, and bilingual brand copy. It does not reuse the source scene, textures, models, or layout chrome.

## Required fidelity surfaces

- Fonts and typography: the implementation uses the existing Flap preview shell typography, a high-impact condensed-feeling uppercase hero, readable monospace control hints, and compact HUD labels. Weight, line height, tracking, wrapping, and contrast remain readable at desktop and H5 sizes.
- Spacing and layout rhythm: the full-height artifact keeps the playable arena dominant, anchors brand and score at opposite corners, centers the briefing CTA, and reserves the lower corners for controls during play. PC and H5 E2E captures show no clipped primary controls.
- Colors and visual tokens: the Flap black surface, violet energy accents, cyan collectible signals, white primary action, and lime host shell remain distinct and accessible. Bloom is limited to game objects rather than flattening the HUD.
- Image quality and asset fidelity: the implementation uses the real local Flap logo and a real browser capture for the homepage cover. All scene geometry and effects are rendered natively; no source screenshots, placeholder art, emoji, or remote assets are embedded in the game.
- Copy and content: English and Chinese both name the objective, controls, collectible count, boost, completion, fallback, and context-loss states. The slogan is `Play the curve. Shape the world.` / `玩转曲线，塑造世界。`

## Focused-region evidence

No separate focused crop was required: the 2056 px implementation capture keeps the logo lockup, HUD, title, objective, CTA, and control hint readable in one view. H5 behavior was checked separately through `dist/e2e/flap-gamefi-arena/screenshots/h5-default.png`.

## Interaction and runtime evidence

- `Enter Arena` moves the deterministic root from `briefing` to `playing`.
- Repeated touch-control activation moved the runner from Z 0.00 to Z -5.25.
- Moving left to X -1.84 collected a core and changed the deterministic score from 0 to 1.
- The full E2E matrix passed 17 scenarios across PC, iPad, and H5, including WebGL2 ready state, 2D fallback, resize/DPR, reduced motion, context loss, wrong network, and undeclared-request checks.
- Browser inspection found no page error or console error during the tested run.

## Comparison history

Initial comparison found no actionable P0/P1/P2 visual issue. The different palette, camera, logo, HUD, and collectible objective are intentional because this is an original Flap GameFi adaptation of the public movement mechanic, not a visual clone.

## Findings

No actionable P0/P1/P2 differences remain. The reference's pointer-lock mouse look, ball throwing, and physics collision are intentionally replaced with capability-compliant top-down steering, touch controls, boost, proximity collection, and deterministic completion.

## Final result

final result: passed
