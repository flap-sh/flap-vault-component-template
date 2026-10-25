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

Standalone Apps can use host-owned generic subroutes such as
`/apps/{slug}/bnb/{ca}`, `/apps/{slug}/orders/{id}` or `/apps/{slug}/settings`.
This is the unpublished routing-only stable `0.1.40` candidate: use private
canaries for consumer testing until the coordinated Runtime release and host
deployment. The separate sensor `next` release is unchanged.
See [Mini App routing](mini-app-routing.md) ([中文](mini-app-routing.zh-CN.md))
for the SDK, persistent preview and compatibility requirements. Routes remain
separate from manifest bindings and grant no new contract permissions.

Run `yarn app:scaffold flap-streets` in the template. Implement UI through `useMiniAppSdk()` from `@/src/sdk`: `context.appId/slug/manifest`, `session.address/isConnected/isAuthenticated/isLoading/connect()/signIn()`, `i18n`, and `notify`. A connected wallet is distinct from authenticated login. The host validates the existing Cookie-SIWE session against the connected wallet, and prompts for signing only after an explicit sign-in request when required. The SDK exposes no cookies or raw login credentials. Wallet operations use the shared `useFlapSdk({ chainId })` API with reviewed `walletChains` and `walletContracts`; see [shared wallet SDK](mini-app-wallet.md). Pure shared UI primitives remain available. Token-bound hooks and components require a legacy token-scoped app.

The v2 workflow uses `app:check`, `app:e2e`, `app:package` and `app:verify-package`. Source maintenance moves to main after the merge; follow [integration status](main-migration.md) for the current release-reference policy and submission readiness. The `vault:*` main/latest workflow belongs to Vault UI and maintenance of existing Mini App v1 Apps. Source-package format 7 is exclusive to standalone manifests. E2E schema 3 proves guest and connected session rendering for PC/iPad/H5, source/manifest/schema hashes, preview-source identity and layout; it has no CA or wrong-network requirement. Preview sessions are fixtures, not real wallet authorization. Legacy formats and test-token proofs retain their existing validation. The existing Three/R3F profile can retain its controlled source/assets/runtime limits; App v2 separates identity from token bindings; wallet declarations add reviewed actions without changing session-proof requirements.

Workbench operators upload/build/review/publish as before. No on-chain registration is required. `/api/apps/{slug}` returns only published public assets and mandatory SHA-256 hashes; unpublished jobs and private metadata are excluded. A slug conflict fails closed. Consumers must configure the trusted Workbench HTTPS origin via server-only `FLAP_MINI_APP_REGISTRY_URL`. The main site's `/apps/{slug}` loads the matching manifest and verified assets inside the existing account providers. Optional `FLAP_MINI_APP_DISABLED_SLUGS` disables host loading in emergencies.

Shared-runtime releases must be coordinated before production deployment: release the new additive SDK from the official release source for its channel, then pin that version in Workbench and frontend. Development canary packages remain private and cannot be source-ZIP provenance. No freshness/provenance gate is bypassed by App v2.

## Main integration and Mini App v2 releases

Vault UI and Mini App v2 now share official `main` and npm `latest`, with published stable runtime version **`0.1.39`**. `app:*` accepts stable versions and uses the official main reference; `vault:*` retains Vault UI and existing v1 maintenance. App ZIPs require the exact published latest version/gitHead and unchanged runtime/build/protocol inputs; docs/authoring-only descendants are allowed, local SDK/tool edits and private canaries are not. **npm `0.1.39` is published on latest**, with source `78c355f080a60770cfd64d71d94c525204d61583`; it adds the second reviewed FSI endpoint. All eight historical next versions are deprecated, with downloads retained. Hosts and Workbench still need the exact stable runtime and matching validation inputs before accepting new submissions. Explicit `runtime:package:next` remains isolated on the next channel. See [release status](main-migration.md).
