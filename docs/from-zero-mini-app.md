# Build a Mini App v2 from zero

[简体中文](from-zero-mini-app.zh-CN.md) · [Vault UI / Mini App v2 and reuse](development.md)

This walkthrough is for an independent App at `/apps/{slug}`. Mini App v1 is deprecated for new development; its token-specific `/{chain}/{tokenCA}/mini-app` route remains compatible for [existing-App maintenance](mini-app-v1.md). New Apps use v2. For a token's Vault panel, use the [Vault UI walkthrough](from-zero-vault-ui.md).

## 1. Get the matching template

Use Node.js 24 and Yarn 1.22. Clone the official preview branch:

```bash
git clone --branch feat/mini-app-v2 https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
```

The template contains SDK source; do not run `npm install @flapsdk/vault-runtime` in an App folder. Workbench and the main host install that npm runtime. Before submission, the template release and both hosts must support the same published version.

`@flapsdk/vault-runtime@0.1.36-next.0` is **published** on npm `next` (checked 2026-10-11), based on main 0.1.35. The shared wallet API below is included in this release. Use official `feat/mini-app-v2` at its published commit, `ff5d612d80e0fe387e612b60dca5275c2fd91a24`, then follow the check/E2E/package workflow below. Stable `latest` remains `0.1.35`. See [release status and updating](mini-app-v2-quickstart.md).

## 2. Scaffold an App

```bash
yarn app:scaffold my-app
yarn dev
```

Open `http://localhost:3000/my-app`. The scaffold registers local preview automatically and generates:

```text
src/vaults/my-app/
  Component.tsx   # React business UI
  VaultABI.ts     # ABI fragments; retained filename for shared tooling
  manifest.json  # independent identity, reviewed capabilities
  i18n.json      # en / zh / ko copy
```

`src/vaults` and `VaultABI.ts` are shared tooling names. They do not bind your App to a Vault. The local path is `/my-app`; the published main-host path is `/apps/my-app`. The local template is not the main host.

Keep the generated artifact ID stable. Set `name`, bilingual `displayTitle`, and matching locale keys. Keep the generated discriminator and empty bindings:

```json
{
  "schemaVersion": 2,
  "mode": "mini-app",
  "appModel": "standalone",
  "slug": "my-app",
  "match": { "bindings": [] }
}
```

This is a partial manifest excerpt; preserve the generated `artifactId`, name/title and `i18n` fields. The slug is the public immutable identity after first publication. Do not use an existing project's artifact ID or rename the slug on an update.

## 3. Write business UI using the shared SDK

The generated example uses `useFlapSdk({ chainId: 56 })`. Change the chain when your blockchain workflow needs another supported host network. Selecting an SDK network is not a Token/factory binding.

```tsx
"use client";
import { useFlapSdk } from "@/src/sdk";

export default function Component() {
  const { wallet, i18n } = useFlapSdk({ chainId: 56 });
  return <div className="min-h-screen w-full p-6">
    <h1>{i18n.t("title")}</h1>
    <p>{i18n.t("description")}</p>
    <p>{wallet.isConnected ? wallet.address : i18n.t("guest")}</p>
  </div>;
}
```

Offer `wallet.connect()` only when disconnected. If a transaction needs another network, offer explicit `wallet.switchChain()` and disable the action until the required chain is active. A connected host wallet is already available to the App; do not implement another wallet login, access `window.ethereum`, or create your own Wagmi/RainbowKit provider.

For an App that only needs localization/notifications, shared `useFlapI18n()` / `useFlapNotify()` do not require a selected blockchain. The compatibility `useMiniAppSdk()` provides App identity and authenticated session when needed. `session.isAuthenticated` concerns verified login, not permission to sign a wallet transaction. Providers belong to the host.

Reuse existing Vault UI/v1 views, ABI and calculations; adapt target selection as shown in the [reuse guide](development.md#what-code-can-be-reused). Default package boundaries still apply: keep shared local functions in `Component.tsx` and ABIs in `VaultABI.ts`, rather than importing a sibling package or arbitrary helpers.

## 4. Add chain actions when needed

A read-only App can omit `walletChains` and `walletContracts`. For contract calls in the explicit-chain API, declare the reviewed contract/read signatures; writes additionally require permitted networks/methods and bounded native/approval amounts. Full examples are in [shared wallet SDK](mini-app-wallet.md).

For launch, claim and trade:

1. Use the real deployed Portal/factory/Vault ABI and business rules. Do not copy the illustrative ABI in the wallet guide as the real Portal ABI.
2. Declare fixed targets and exact signatures in `walletContracts`, with `walletChains`. These are wallet permissions, not `match.bindings` or App identity.
3. For per-token dynamic Vaults/tokens, use a declared on-chain resolver and genuine `sdk.resolveContract(...)` handles. An address returned by a public API does not authorize a transaction.
4. Simulate, send through `sdk.writeContract`, wait for a receipt and check `status === "success"` before refreshing. `waitForTx` exposes logs for event decoding in the new chain API.
5. Show token, chain, amounts, recipient, minimum output/slippage and allowance; handle disconnected/wrong-network, pending, rejection, failure and empty data states.

The SDK supplies the controlled wallet transport. You still implement the project's launch form, reward calculations and trading UI. Vault-specific helpers that depend on a bound NFT/Vault context are not automatically available to an independent App.

Public HTTPS fetch endpoints must be static and declared in `manifest.endpoints`. They need review and valid cross-origin responses from the service. Declarations do not bypass endpoint authentication/CORS or approve arbitrary image/asset URLs. Keep graceful fallback UI.

## 5. Preview guest and connected states

Use the default local preview for your real connected test wallet. For deterministic rendering checks, open:

```text
http://localhost:3000/my-app?appSession=guest&lang=en
http://localhost:3000/my-app?appSession=connected&lang=zh
```

Explicit session fixtures cannot authorize transactions. They exercise rendering and do not prove real login or on-chain business behavior. Test actual contract actions separately on a suitable test environment and validate real shared login on the matching Flap test host.

## 6. Validate, package and hand off

Stop a manually started preview when it is no longer needed. Install the E2E browser once if necessary:

```bash
yarn playwright install chromium
yarn app:check my-app
yarn app:e2e my-app
yarn app:package my-app
yarn app:verify-package dist/my-app.zip
```

The runner checks PC/iPad/H5 in guest and connected states (six checks), current source/asset hashes and preview-source identity. Optional `yarn app:build` checks the template build. Packaging requires the exact official preview commit and matching published npm `next`; `0.1.36-next.0` is published and can be used for this workflow. A different version or source commit still fails provenance checks. Never edit proof metadata to bypass this.

Submit the generated ZIP to the designated App v2 testing Workbench. Provide slug, display titles, feature summary, endpoint declarations and any wallet contract policy/upgrade-authority notes. Keep secrets and private keys out of the package. Workbench builds the runtime artifact; human review and main-host rollout determine release. Upload/build success alone is not approval to go live.

## 7. Update an existing App

Save or commit your work before updating. Do not discard local changes. Reapply the App folder and its preview registration onto the updated official template as described in the [quickstart](mini-app-v2-quickstart.md); preserve artifact ID and slug, regenerate E2E and ZIP proof, and confirm the receiving Workbench version. Local code commits/forks cannot replace official template provenance.

| Symptom | What to check |
| --- | --- |
| `useFlapSdk` requires an explicit chain | v2 uses `useFlapSdk({ chainId })`; no-argument usage belongs to bound Vault/v1 |
| `context.tokenAddress` / `vaultAddress` is absent | v2 selects tokens/targets; do not invent a fake host context |
| `app:*` rejects the manifest | Check all v2 discriminators and `match.bindings: []`; v1 uses `vault:*` |
| `package/preview-runtime-unpublished` | Compare the local version/HEAD with the published `next` identity in the quickstart; use the matching official checkout. If a future release is still pending, wait; do not substitute latest/private canary |
| App works locally but Workbench rejects it | Check published runtime/gitHead, current E2E hashes, package format and review declarations |
| A public endpoint fails only inside Flap | Verify that service's actual response CORS/cross-site policy for the host origin |
