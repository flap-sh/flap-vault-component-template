# Runtime Module Contract

This document defines how a custom Vault UI source package connects to the shared runtime that powers local preview, Artifact Workbench preview/build, and the final `flap.sh` host.

The goal is one stable component contract across all surfaces. Developers should not need one import style for local preview, a second one for Workbench, and a third one for production.

## Why This Contract Exists

There are three different concerns:

1. Source package authoring
2. Runtime artifact build
3. Host runtime execution

The public template only creates the **source package**. The Flap Artifact Workbench builds the **runtime artifact** (`component.mjs`). `flap.sh` executes that runtime artifact inside the final **host runtime**.

If each surface bundles its own copy of SDK/provider/UI modules, several problems appear:

- React context instances can diverge
- `useFlapSdk()` and `useVaultContext()` may read from the wrong provider instance
- preview, Workbench, and production behavior can drift
- every built artifact carries duplicate runtime code

The contract below avoids that by defining one shared public runtime surface.

## Runtime Layers

There are two public-facing layers and one host-internal layer:

### 1. Host-internal runtime result

This is for preview, Workbench, and `flap.sh` adapters only.

Current examples in this template:

- `runHostRuntime(...)`
- `HostRuntimeResult`
- `createVaultRuntimeContext(...)`

These are host/runtime integration APIs. Custom Vault components should not depend on them directly.

### 2. Public component runtime contract

This is what `Component.tsx` is allowed to consume:

- `context: VaultRuntimeContext`
- `sdk: FlapVaultSdk`
- public helpers from `@/src/sdk`
- public UI primitives from `@/src/ui`

This layer must be stable across local preview, Workbench preview, and `flap.sh`.

### 3. Shared runtime module surface

This is the module identity that Workbench build and host runtime must agree on.

Conceptually, the component should see one shared runtime surface:

- shared SDK surface
- shared UI surface
- shared provider/context implementation

The exact internal package names can vary, but the module identity must remain shared across all host surfaces.

## Source Import Contract

Vault source may import:

- `@/src/sdk`
- `@/src/ui`
- `./VaultABI`
- approved third-party packages already allowed by `vault:check`

Within this repository, `@/src/sdk` is the component-safe default barrel and `@/src/ui` is the shared UI barrel. Vault source must import those modules exactly; deep imports such as `@/src/sdk/format` and `@/src/ui/Button` are not part of the source package contract and are blocked before Workbench build. Host/runtime integration code should use explicit host/server subpaths or direct internal modules instead of expanding the public component barrel again.

Vault source must not import any additional SDK package or SDK-like runtime wrapper beyond the shared `@/src/sdk` / `@/src/ui` surfaces.

Vault source must not import:

- private `flap.sh` app paths
- private Workbench files
- host shell internals
- `./helpers`
- `../VaultABI`
- local nested components
- local assets
- dynamic imports

`Component.tsx` is allowed to import public helpers and UI primitives. It is **not** required to receive every helper via props.

### Allowed import usage

Imports are appropriate for:

- public hooks such as `useFlapSdk()`
- public helpers such as `readTaxVaultHostContext(...)`
- formatting utilities
- shared UI primitives
- shared ABI exports like `erc20Abi`

### Runtime data must not be imported ad hoc

Business runtime state must come from `context` or `sdk`, not from component-owned preflight reads.

Examples:

- `tokenInfo`
- `taxInfo`
- `vaultInfo`
- `paymentToken`
- `marketPhase`
- `isListed`
- `riskLevel` from `vaultInfo` or `taxInfo.vaultInfo`
- `tokenName`
- `tokenImageUrl`

These must be host-prepared data, not per-component fetch logic.

## Component Contract

Custom Vault components should assume this flow:

```plain text
host runtime preflight
  -> HostRuntimeResult
  -> createVaultRuntimeContext(...)
  -> <Component context=... sdk=... />
```

The component should consume:

- `context.host`
- `context.paymentToken`
- `context.tokenName`
- `context.tokenImageUrl`
- `context.explorerBaseUrl` for explorer-only links
- `sdk.wallet.isWrongNetwork`
- `sdk.wallet.switchChain()`
- `sdk.readContract(...)`
- `sdk.writeContract(...)`
- `sdk.readOracle(...)` when approved/provisioned

`sdk.readContract(...)` may include `account` for read-only contract functions whose return value depends on `msg.sender`. Hosts must forward that field to their public client instead of forcing components to use simulation for read-only user-state queries.

Wrong-network handling belongs in this public component contract as well. A write-capable component should keep its action area visible, render a switch-network state when the connected wallet is on the wrong chain, and only proceed with writes after the wallet matches `context.chainId`.

The component should not directly call:

- `runHostRuntime(...)`
- `loadTokenRuntimeSnapshot(...)`
- `Portal.getTokenV7(...)`
- `VaultPortal.tryGetVault(...)`
- private backend metadata APIs

Contract interaction should stay on:

- `context.vaultAddress`
- `context.tokenAddress`
- `context.factoryAddress`
- runtime-provided payment/quote/dividend token addresses
- token/NFT addresses derived from Vault state
- fixed addresses declared in `match.bindings[].externalContracts`

Do not use the shared runtime surface to reach unrelated routers, bridges, aggregators, or arbitrary app contracts.
Do not use it to create arbitrary embeds either. The only reviewed iframe primitive is `ReviewedFrame` from `@/src/ui`, and a Vault UI may render it at most once with the single display-only `manifest.externalFrames` chart URL approved by the host/Workbench review path.

Those belong to the host/runtime layer.

## Build Contract

The source zip is not the browser runtime artifact.

The Workbench build must transform the source package into a browser-executable `component.mjs`.

### Runtime module export

The generated `component.mjs` must export the built Vault component as the module default:

```ts
import type { VaultComponentProps } from "@flapsdk/vault-runtime/sdk";

declare const Component: React.ComponentType<VaultComponentProps>;
export default Component;
```

The host renders that default export inside the shared runtime provider. The host may also pass `{ sdk, context }` props for compatibility, but authored Vault source should continue to use `useFlapSdk()` / `useVaultContext()` from the shared public runtime surface. The module must not auto-mount itself, create an independent wallet/provider tree, mutate globals, or import private Workbench / `flap.sh` host files.

### Required build behavior

The Workbench build must:

1. Bundle the Vault component business code
2. Bundle `./VaultABI`
3. Preserve the public import contract semantics for `@/src/sdk` and `@/src/ui`
4. Ensure the component reads from the same runtime provider/context instance as the host

### Recommended strategy

Do **not** independently bundle a fresh SDK/UI/provider copy into every built Vault artifact.

Instead:

- treat the public SDK/UI/runtime provider surface as a shared runtime module
- rewrite or externalize `@/src/sdk` and `@/src/ui` to that shared module surface during build
- keep the Vault-specific business logic as the per-artifact payload

In other words:

```plain text
Component.tsx business logic      -> bundle into component.mjs
./VaultABI                        -> bundle into component.mjs
shared SDK/UI/provider runtime    -> shared external runtime surface
```

This avoids duplicated provider implementations and keeps context identity stable.

## Host Runtime Contract

Local preview, Workbench preview, and `flap.sh` must all provide the same public runtime surface.

That shared surface must include:

- `VaultRuntimeProvider`
- `useFlapSdk()`
- `useVaultContext()`
- public SDK helpers from `@/src/sdk`
- public UI primitives from `@/src/ui`

The host may implement different adapters behind the scenes:

- template preview adapter
- Workbench preview adapter
- `flap.sh` production adapter

That shared surface should also own oracle provisioning. Components still call `sdk.readOracle(...)`, but the host/runtime should inject the actual reader through `VaultRuntimeProvider` rather than pushing raw oracle URLs into Vault source. In this template, local preview wires `oracleReader={createLocalOracleReader()}` and serves the request through `/api/runtime/oracle/{oracleId}` backed by server-side runtime defaults.

That shared surface also owns the reviewed frame primitive. Components may render at most one `ReviewedFrame`, and only with a static URL declared in the single `manifest.externalFrames` entry; Workbench and production hosts can rely on source-package review plus the `ReviewedFrame` primitive first. CSP `frame-src` allowlisting is optional follow-up hardening, not a required host change for this template contract.

But the component-facing module contract must remain the same.

## Host Preflight Contract

Host/runtime surfaces may use host-internal APIs such as:

- `runHostRuntime(...)`
- `loadTokenRuntimeSnapshot(...)`
- `createVaultRuntimeContext(...)`

These APIs are for host integration code only.

They are allowed to evolve more quickly than the public component contract, as long as they continue to feed the same stable `VaultRuntimeContext` and `FlapVaultSdk` shape into the component.

## Versioning Rules

Preferred compatibility rules:

- add new `context.host` fields additively
- add new SDK helpers additively
- avoid renaming or removing exported public helpers without a contract/version change
- avoid changing `VaultRuntimeContext` meaning silently

If Workbench or `flap.sh` need a breaking runtime-surface change, document it explicitly and version the contract rather than letting local preview and production drift apart.

## Practical Rule of Thumb

For custom Vault source:

- import public helpers and UI freely from `@/src/sdk` and `@/src/ui`
- read runtime business data from `context` and `sdk`
- never import host-private preflight/runtime internals into `Component.tsx`

For Workbench and `flap.sh`:

- share one runtime module surface
- do not let each artifact carry an unrelated SDK/provider copy
- build `component.mjs` so it plugs into the host's shared runtime rather than replacing it

## Current Template Direction

This template already reflects the intended split:

- host/internal preflight result: `HostRuntimeResult`
- context adapter: `createVaultRuntimeContext(...)`
- component/public contract: `VaultRuntimeContext`

Future Workbench and `flap.sh` integration should reuse that same layering instead of inventing a separate contract per surface.

The template now makes that package direction concrete with two local scripts:

```bash
yarn runtime:package
yarn runtime:verify-package
```

They build a packable runtime package under `dist/vault-runtime`, emit a `package.json` with subpath exports, and write a machine-readable `runtime-contract.json`. Before building, the script checks npm latest `@flapsdk/vault-runtime` against the local root version and published `gitHead` so a stale checkout cannot produce an outdated runtime package. This does not change Vault source authoring; it proves that the shared runtime surface can be extracted and npm-packed without forcing `Component.tsx` authors to abandon `@/src/sdk` / `@/src/ui`.

The current runtime package also carries the public oracle provisioning surface:

- `VaultRuntimeProvider` accepts `oracleReader`
- `createLocalOracleReader()` targets `/api/runtime/oracle/{oracleId}`
- `./server` exports the runtime-oracle registry helpers used by that proxy route

Current status: `dist/vault-runtime` is a local extraction artifact and acceptance proof for this public template, while the published `@flapsdk/vault-runtime` version is used as the freshness anchor for local checks. The generated runtime package is not included in `yarn vault:package <folder-name>` source zips and is not automatically consumed by Workbench / `flap.sh` just because `yarn runtime:package` passed. Workbench and `flap.sh` should adopt this package only through an explicit integration decision, version pin, and rollout plan.

## Package Extraction Direction

This shared runtime surface should keep moving toward a versioned package underneath the stable authoring aliases rather than remaining a repo-local implementation detail.

The shared runtime package name is now fixed for this template flow:

- `@flapsdk/vault-runtime/sdk`
- `@flapsdk/vault-runtime/ui`
- `@flapsdk/vault-runtime/host`

Vault source should still not author against those raw package names directly; keep authoring on `@/src/sdk` and `@/src/ui` until Workbench and `flap.sh` consume the same shared runtime package underneath those aliases.

Preferred migration order:

1. keep Vault source authoring on `@/src/sdk` and `@/src/ui`
2. extract the shared runtime implementation into a versioned package
3. make template preview resolve `@/src/sdk` and `@/src/ui` through that package
4. make Workbench build rewrite/externalize those imports to the same package surface
5. make `flap.sh` runtime provide that same package surface

This keeps authored Vault source stable while the shared runtime moves underneath it.

In other words, the long-term direction is "shared package underneath, stable authoring alias on top" rather than forcing every Vault source package to hardcode a host-internal npm name immediately.

For the current template preview, the same-origin host-proxy route is part of that host layer. It forwards to `FLAP_RUNTIME_HOST_ORIGIN` when configured and otherwise defaults to `https://flap.sh`, keeping protected backend access server-side while the component-facing contract stays unchanged.

For oracle traffic, the current template preview uses a sibling same-origin route at `/api/runtime/oracle/{oracleId}`. That route now includes built-in defaults for the example oracle flow and the display-only `bnb-usd-price` BNB/USD conversion oracle, so the public template works without user env setup for common preview paths. If a host/runtime later needs reviewed upstream URLs, allowlisted params, or auth headers for additional oracle ids, keep those in the host integration layer rather than inside the public Vault source package.
