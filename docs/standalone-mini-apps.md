# Standalone Mini Apps

Standalone Apps are user-uploaded React UI, published through the existing audited source-package pipeline. They do not have CA, factory, Vault, mandatory network, token market phase or chain registry requirements. Legacy Mini Apps retain those behaviors.

```json
{
  "schemaVersion": 2,
  "mode": "mini-app",
  "appModel": "standalone",
  "slug": "flap-streets",
  "artifactId": "vaultui_flap-streets_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "name": "Flap Streets",
  "displayTitle": { "en": "Flap Streets", "zh": "Flap 街区" },
  "match": { "bindings": [] },
  "i18n": ["en", "zh", "ko"]
}
```

The folder/artifact ID convention is retained for source tooling compatibility. The slug is a separate immutable URL identifier; updates keep both identifiers. Slugs use 3–64 lowercase kebab-case characters and reject reserved routes.

Run `yarn app:scaffold flap-streets` in the template. Implement UI through `useMiniAppSdk()` from `@/src/sdk`: `context.appId/slug/manifest`, `session.address/isConnected/isAuthenticated/isLoading/connect()/signIn()`, `i18n`, and `notify`. A connected wallet is distinct from authenticated login. The host validates the existing Cookie-SIWE session against the connected wallet, and prompts for signing only after an explicit sign-in request when required. The SDK exposes no cookies or raw login credentials and does not provide token contract actions. Pure shared UI primitives remain available. Token-bound hooks and components require a legacy token-scoped app.

Run the usual `vault:check`, `vault:e2e`, `vault:package` and `vault:verify-package` commands. Source-package format 7 is exclusive to standalone manifests. E2E schema 3 proves guest and connected session rendering for PC/iPad/H5, source/manifest/schema hashes, preview-source identity and layout; it has no CA or wrong-network requirement. Preview sessions are fixtures, not real wallet authorization. Legacy formats and test-token proofs retain their existing validation. The existing Three/R3F profile can retain its controlled source/assets/runtime limits; App v2 changes identity and session proof only.

Workbench operators upload/build/review/publish as before. No on-chain registration is required. `/api/apps/{slug}` returns only published public assets and mandatory SHA-256 hashes; unpublished jobs and private metadata are excluded. A slug conflict fails closed. Consumers must configure the trusted Workbench HTTPS origin via server-only `FLAP_MINI_APP_REGISTRY_URL`. The main site's `/apps/{slug}` loads the matching manifest and verified assets inside the existing account providers. Optional `FLAP_MINI_APP_DISABLED_SLUGS` disables host loading in emergencies.

Shared-runtime releases must be coordinated before production deployment: release the new additive SDK from official main, then pin that version in Workbench and frontend. Development canary packages remain private and cannot be source-ZIP provenance. No freshness/provenance gate is bypassed by App v2.

## Mini App v2 developer preview channel

The official `feat/mini-app-v2` branch targets `@flapsdk/vault-runtime@0.1.33-next.1` on npm `next`. Read [the developer quickstart](./mini-app-v2-quickstart.md) before new App work. On this preview branch use `yarn app:check`, `yarn app:e2e`, `yarn app:package`, and `yarn app:verify-package`; these explicitly select the official source ref and npm next provenance. Only standalone manifest v2 Apps use this source-package channel. Legacy commands retain main/latest. A source ZIP requires the exact published next version and gitHead; private canaries and an older next release are rejected. Local guest/connected sessions remain fixtures. Release the same clean commit from official `next` using `runtime:package:next`, verify it, publish with the `next` tag, and verify `latest` is unchanged. See the quickstart for pending-publication behavior, updating developer changes, and the required test-host/Workbench alignment.
