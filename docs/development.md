# Flap development: Vault UI and Mini App v2

[简体中文](development.zh-CN.md) · [Repository home](../README.md)

Flap provides one template repository, one `@flapsdk/vault-runtime` package, shared React UI primitives, and the host's connected wallet. **New development supports only Vault UI and Mini App v2.** You can reuse presentation code, ABI definitions, formatting, translations and business logic across them; adapt the host context and contract permissions for each model.

## Choose the integration model first

| | Vault UI | Mini App v2 |
| --- | --- | --- |
| Purpose | A token's Vault business panel | An independent Flap App, possibly covering many tokens |
| Product entry | Vault panel; the Vault template may be listed under Token Templates | Flap Apps catalog |
| Production URL | Token's Vault/tax-info page | `/apps/{slug}` |
| Manifest discriminator | Omit `mode` | `schemaVersion: 2`, `mode: "mini-app"`, `appModel: "standalone"`, valid `slug` |
| Identity/binding | Reviewed factory, Vault or token bindings | Stable artifact ID and immutable slug; `match.bindings: []` |
| Main SDK call | `useFlapSdk()` | `useFlapSdk({ chainId: 56 })` in published `0.1.36-next.0` |
| Token/Vault context | Supplied by host | App selects tokens; no implicit `context.tokenAddress` / `vaultAddress` / `marketPhase` |
| Local preview | `/{folder-name}` | `/{slug}` in the independent App shell |
| Authoring commands | `vault:scaffold`, `vault:check`, `vault:e2e`, `vault:package` | `app:scaffold`, then `app:*` |
| Source/E2E proof | Format 6 / report v2; manifest test token | Format 7 / report v3; guest/connected × PC/iPad/H5 |
| Branch/channel | `main` / npm `latest` | `feat/mini-app-v2` / npm `next` during preview |

Start with [Vault UI from zero](from-zero-vault-ui.md) or [Mini App v2 from zero](from-zero-mini-app.md). A project can deliver both a Vault UI and an App. They are reviewed/submitted separately and can reuse the same contracts and business code. Launching the Vault UI does not automatically publish either Mini App.

## Mini App v1: deprecated for new development, existing Apps remain compatible

Mini App v1 is no longer supported for new development or offered as a new-project integration choice. Existing v1 Apps remain compatible: their routes, host context, SDK and maintenance validation workflow are retained. They are not automatically unpublished or converted to v2. Legacy commands are for existing-App maintenance only; the scaffold emits a deprecation warning.

v1 uses `/{chain}/{tokenCA}/mini-app`, `mode: "mini-app"` and token-only bindings, while omitting `schemaVersion`, `appModel` and `slug`. New Apps use the complete v2 discriminator, empty bindings and `/apps/{slug}`. See [v1 compatibility and migration](mini-app-v1.md).

## Versions mean different things

Release snapshot checked on 2026-10-11:

| Item | Status |
| --- | --- |
| Official `main` / npm `latest` | `0.1.35`, npm `gitHead` `30784d445009f337516537ac17aaf836f1cdfba0` |
| Published npm `next` | **`0.1.36-next.0`**, npm `gitHead` `ff5d612d80e0fe387e612b60dca5275c2fd91a24`; includes main 0.1.35 plus shared App wallet operations |

Do not install `0.1.35` and assume it includes standalone v2 wallet APIs. The explicit-chain hook and `walletContracts` described here are available in published `0.1.36-next.0`. Use its matching official template commit and the same exact runtime in the main host and testing Workbench. Source ZIP packaging is available after checks and E2E pass; SDK publication does not by itself approve an App for production. See [preview release quickstart](mini-app-v2-quickstart.md).

“Mini App v1/v2” describes the product/binding model. It is unrelated to npm semver (`0.1.35`), `runtimeContractVersion: 1`, or E2E report versions. A v2 App may still use runtime contract version 1. Identify the model from its manifest, not its name, SDK version, or token address alone. A partially specified or invalid v2 manifest must be rejected, never silently treated as v1.

`latest` and `next` are release channels for the same SDK. Their freshness checks are independent. Updating stable `latest` alone does not require publishing another `next` version.

## What code can be reused?

| Code | Reuse | Adaptation |
| --- | --- | --- |
| React views, state helpers, formatting, calculations | Yes | Receive selected token/wallet/data through props or a small adapter |
| ABI fragments and contract business rules | Yes, when the deployed method is the same | Use the actual deployment ABI, account, chain, quote token and slippage rules |
| Locale keys and Flap UI primitives | Yes | Keep every declared locale aligned; import from `@/src/ui` |
| Read → simulate → write → wait-for-receipt flow | Yes | Bind the request target/permissions and refresh only on a successful receipt |
| Vault/Token host context | Requires an adapter | v2 has no implicit current token or Vault; select and resolve targets explicitly |
| Manifest, artifact identity, routing and E2E evidence | Separate per deliverable | Scaffold separately; preserve each artifact ID/slug across updates |

For example, this view can be shared by Vault UI and v2, including code reused from an existing v1 App:

```tsx
type RewardSummaryProps = { title: string; formattedAmount: string };

function RewardSummary({ title, formattedAmount }: RewardSummaryProps) {
  return <section><h2>{title}</h2><output>{formattedAmount}</output></section>;
}
```

Supply localized `title` and the calculated amount from the model's adapter. A Vault UI/v1 adapter gets the active token/Vault from `useFlapSdk().context`. A v2 adapter selects a token, gets the host wallet from `useFlapSdk({ chainId: 56 }).wallet`, and reads the selected reviewed contract. Keep the view, ABI and reward calculations; change how the target is supplied.

Both adapters can use the same transaction sequence:

```ts
const prepared = await sdk.simulateContract(request);
const hash = await sdk.writeContract(prepared.request);
const receipt = await sdk.waitForTx(hash);
if (receipt.status === "success") await reloadData();
```

Handle pending state, wallet rejection and reverted receipts. This is a shared sequence, not a ready-made launch/claim/trade implementation. Vault UI/v1 requests remain bound to the host context and existing Vault policies. v2 requests require reviewed `walletChains` and `walletContracts`; dynamic targets require genuine `resolveContract` handles. Read the [wallet API and manifest examples](mini-app-wallet.md).

“Shared code” does not permit cross-package imports. The default submitted folder still contains `Component.tsx`, `VaultABI.ts`, `manifest.json` and `i18n.json`, plus only the documented optional files/assets. Keep reusable views/functions in `Component.tsx` and ABI fragments in `VaultABI.ts`, or materialize your development project's shared code into those files. Do not submit imports from a sibling Vault/App folder, a new helper directory, another SDK package, or private host source. Extra nested files require an explicitly supported capability profile.

## One SDK, two host contexts

```tsx
import { useFlapSdk } from "@/src/sdk";

// Inside a Vault UI or token-bound Mini App v1 component:
const boundSdk = useFlapSdk();
// boundSdk.context.tokenAddress / vaultAddress are prepared by the host.

// Inside an independent Mini App v2 component (shared-wallet revision):
const appSdk = useFlapSdk({ chainId: 56 });
// appSdk.wallet.address is the connected host wallet; the App selects targets.
```

These lines illustrate different components; do not call both hooks in one v2 component. `useMiniAppSdk()` remains an optional identity/authenticated-session compatibility API in the same SDK. It is not a second SDK or a separate wallet. Wallet transaction signing does not require a second Flap sign-in. A verified login session and a connected wallet are distinct states.

The template already includes SDK source. App authors import `@/src/sdk` / `@/src/ui`; do not install another runtime in `src/vaults/{slug}` or add a Wagmi/RainbowKit provider. Flap's preview shell, Workbench and main host own providers and wallet connection. The hosts consume the published npm runtime and must agree on the supported release.

## Documentation map

- [Vault UI walkthrough](from-zero-vault-ui.md) and [test CA setup](vault-ui-test-ca.md).
- [Mini App v1 compatibility](mini-app-v1.md): existing-App maintenance and migration only; deprecated for new development.
- [Mini App v2 walkthrough](from-zero-mini-app.md): scaffold, files, preview and submission.
- [Preview quickstart](mini-app-v2-quickstart.md): branch/channel, releases and updating.
- [Shared wallet SDK](mini-app-wallet.md): exact contract/method declarations, resolvers and bounded writes.
- [SDK reference](sdk.md), [manifest reference](manifest.md), [UI patterns](ui-pattern-snippets.md) and [3D capability](mini-app-3d.md).
- [AI agent guide](ai-agent.md): choose Vault UI/v2 for new development; maintain v1 only for existing Apps.
