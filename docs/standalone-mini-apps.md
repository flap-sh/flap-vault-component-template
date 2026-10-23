# Standalone Mini Apps (v2)

For the supported Vault UI/v2 models and shared-code examples, read [the developer guide](development.md) ([中文](development.zh-CN.md)). Token-bound [Mini App v1](mini-app-v1.md) is deprecated for new development; existing Apps retain compatible bindings and maintenance workflows. New developers should start with [v2 from zero](from-zero-mini-app.md).

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

Run `yarn app:scaffold flap-streets` in the template. Implement UI through `useMiniAppSdk()` from `@/src/sdk`: `context.appId/slug/manifest`, `session.address/isConnected/isAuthenticated/isLoading/connect()/signIn()`, `i18n`, and `notify`. A connected wallet is distinct from authenticated login. The host validates the existing Cookie-SIWE session against the connected wallet, and prompts for signing only after an explicit sign-in request when required. The SDK exposes no cookies or raw login credentials. Wallet operations use the shared `useFlapSdk({ chainId })` API with reviewed `walletChains` and `walletContracts`; see [shared wallet SDK](mini-app-wallet.md). Pure shared UI primitives remain available. Token-bound hooks and components require a legacy token-scoped app.

The v2 workflow uses `app:check`, `app:e2e`, `app:package` and `app:verify-package`. Source maintenance moves to main after the merge; follow [integration status](main-migration.md) for the current release-reference policy and submission readiness. The `vault:*` main/latest workflow belongs to Vault UI and maintenance of existing Mini App v1 Apps. Source-package format 7 is exclusive to standalone manifests. E2E schema 3 proves guest and connected session rendering for PC/iPad/H5, source/manifest/schema hashes, preview-source identity and layout; it has no CA or wrong-network requirement. Preview sessions are fixtures, not real wallet authorization. Legacy formats and test-token proofs retain their existing validation. The existing Three/R3F profile can retain its controlled source/assets/runtime limits; App v2 separates identity from token bindings; wallet declarations add reviewed actions without changing session-proof requirements.

Workbench operators upload/build/review/publish as before. No on-chain registration is required. `/api/apps/{slug}` returns only published public assets and mandatory SHA-256 hashes; unpublished jobs and private metadata are excluded. A slug conflict fails closed. Consumers must configure the trusted Workbench HTTPS origin via server-only `FLAP_MINI_APP_REGISTRY_URL`. The main site's `/apps/{slug}` loads the matching manifest and verified assets inside the existing account providers. Optional `FLAP_MINI_APP_DISABLED_SLUGS` disables host loading in emergencies.

Shared-runtime releases must be coordinated before production deployment: release the new additive SDK from the official release source for its channel, then pin that version in Workbench and frontend. Development canary packages remain private and cannot be source-ZIP provenance. No freshness/provenance gate is bypassed by App v2.

## Main integration and Mini App v2 releases

Vault UI and Mini App v2 share one SDK and will be maintained on `main` after the v2 merge. `feat/mini-app-v2` is the transition branch. Read [the current migration and release status](main-migration.md) before selecting a source checkout or generating a ZIP. The planned shared stable release is **`0.1.38` on latest, not yet published**; historical next versions will be deprecated after that release, with downloads retained. Current App commands still use next-channel preview references and must migrate to main/latest before release; this documentation does not change those guards or publish a runtime. The integration source has changed dependency/build inputs and also updates E2E tooling since the last npm publication and needs a matching release before packaging. Use `vault:*` for Vault UI and `app:*` for v2, preserve separate manifests/identities/proofs, and retain existing v1 compatibility. Local E2E and private canaries do not replace exact published-source provenance.
