# Mini App v1: compatibility and migration (deprecated)

**Mini App v1 is deprecated for new development. Existing v1 Apps remain compatible.** New projects must use [Mini App v2](from-zero-mini-app.md) or [Vault UI](from-zero-vault-ui.md). This page documents existing-App maintenance and migration only.

[简体中文](mini-app-v1.zh-CN.md) · [Choose Vault UI / Mini App v2](development.md)

Mini App v1 is the existing token-specific full-page experience. Its production entry is `/{chain}/{tokenCA}/mini-app`. It shares Vault UI's SDK, token host context and source-package workflow, while using the Mini App shell/layout. It is separate from independent Mini App v2 at `/apps/{slug}`.

## Recognize v1

- Manifest sets `mode: "mini-app"`, with bilingual `displayTitle`.
- Omit the v2 fields `schemaVersion`, `appModel` and `slug`. A partially specified or invalid v2 manifest is an error, not v1.
- `match.bindings` contains token-only entries with `chainId` and real deployed ERC20 `tokenAddresses`. Factory/Vault binding targets are not allowed for this mode.
- Within one artifact, token addresses must all end in `7777` (tax token) or all end in `8888` (zero-tax token). Do not mix suffixes.
- Source package format 6 and E2E report v2 prove the bound token/chain. Older accepted packages retain their documented compatibility policy.

A v1 App can call its token's Vault through the SDK/host context; the token-only manifest rule does not prohibit approved Vault actions. A factory-bound Vault UI is a different deliverable, not a v1 Mini App.

## Maintain an existing v1 App

Keep the existing source folder, artifact identity, token bindings and bilingual display titles. Use the compatible official `main` / npm `latest` workflow and the legacy Mini App sections in [manifest rules](manifest.md). Do not scaffold a new v1 project. Legacy scaffold support is retained for maintenance tooling and emits a deprecation warning; it is not a new-development recommendation.

Existing 7777 Apps still require their real deployed proof token. Existing 8888 Apps retain their documented same-chain proof-token compatibility. Deprecated status does not bypass token validation, permissions, review or package provenance.

Write business UI in `Component.tsx`, ABI in `VaultABI.ts`, and copy in every declared `i18n.json` locale. Use `useFlapSdk()` from `@/src/sdk`, `sdk.context` for host-prepared token/Vault state, and `@/src/ui` for shared primitives. Local preview is `/{folder-name}` with the real chain/token parameters; keep the root full-height.

```bash
yarn vault:check my-token-app
yarn vault:e2e my-token-app
yarn vault:package my-token-app
yarn vault:verify-package dist/my-token-app.zip
```

These commands apply to an existing `my-token-app` folder with its required real token/binding inputs. Submit the generated ZIP to the matching Vault/v1 Workbench for review. Never switch to `app:*` just to bypass a failed token check.

## Reuse or move to v2

Reuse views, translations, ABIs and business functions as described in the [shared development guide](development.md#what-code-can-be-reused). To create a separate v2 App, scaffold a new App on `feat/mini-app-v2`, port reusable code, adapt target selection and wallet permissions, and regenerate its own format-7 guest/connected proof. Preserve the existing v1 artifact and binding unless a migration is explicitly planned.

Deleting token bindings alone does not convert a v1 App into v2. Do not change a v1 artifact's identity into an unrelated v2 App or invent an empty/zero Token/Vault context. The [v2 walkthrough](from-zero-mini-app.md) explains the independent workflow and pending shared-wallet release.
