# Checked street-map authoring example

This is the canonical CATCH-style example for the published `0.1.40-next.4` testing Runtime. Use [Component.tsx](Component.tsx), merge [i18n.json](i18n.json) and [manifest.fragment.json](manifest.fragment.json) into an existing valid source folder, and follow the [developer integration guide](../../device-map-integration.zh-CN.md). It includes all optional point fields, controlled selection, localized React details, events, range display and a usable list fallback.

Rarity translations use explicit literal keys `map.rarity.common`, `map.rarity.rare`, `map.rarity.epic` and `map.rarity.legendary` in separate `t(...)` calls so the normal source checker can verify every key in all declared locales. The historical root `examples/street-map` files remain unchanged; this checked authoring copy is the current documentation entry point. It does not change the published Runtime, package identity, validation policy or source-package requirements.

The component and translations match the checked `store-map-probe` source byte for byte. On 2026-10-26 this copy passed:

- Ordinary source check: zero blocking findings and the two expected sensor/map review warnings.
- All six PC/iPad/H5 × guest/connected E2E cases, with preview-source attestation verified and no blocking E2E findings.
- Ordinary next-channel format-7 source packaging and verification, with `selfContained=false` and matching published next.4 source provenance.
- The receiving Workbench's original local intake/compiler using the public next.4 Runtime: status `built`, no blocking findings and the two expected review warnings. Metadata requires `Button`, `FlapStreetMap` and `STREET_MAP_PRESENTATION_V1`.

Component SHA-256: `6bbc3da0677806d819289dc9a1123a9f0cae78f88e613a10996d19ef67212898`. Translation SHA-256: `f512f83e205b859ae85744a860024c739dd81b73acad8b904d0e687356c4344d`. The checked local probe ZIP was 15,826 bytes, SHA-256 `55977d6a91c12e6f87b628a27662d64203010c822987eaa30e5257341d18cce7`. These identify the test fixture; adapt the App identity/manifest for the project and regenerate its own source/E2E/ZIP proof. Local acceptance used no remote storage or App publication and does not establish device hardware or deployed-host compatibility.

The ordinary six-case E2E gate checks the session/layout/source-binding workflow; it does not wait for `MapReady`. A separate browser smoke using the published next.4 Runtime passed actual map readiness, point selection and details checks. Those results are not inferred from the ZIP's E2E pass flag.

The same source also passed an unchanged Next.js template preview at a Chinese H5 viewport: map-ready, real Worker/tiles and readable Chinese details after list selection, without requesting GPS or uncaught page errors. Glyph/local-font and sprite fallback warnings remained; this is separate from physical-phone and wallet-WebView testing.

Use only with the matching published Runtime and receiving hosts. Exact release identity is recorded in the [next.4 release notes](../../releases/0.1.40-next.4.md). Timestamp units are epoch milliseconds; location, distance, radius and timers are display estimates, and claim authorization stays in the project business flow. Public package availability does not establish host deployment or physical-phone compatibility.
