# Safety Boundaries

Custom Vault UI is controlled business UI, not an arbitrary app surface.

## Blocking

- Direct wallet API access, injected wallet providers, provider discovery, wallet-client signing utilities, or raw provider `request` / `send` / signing / transaction RPC methods.
- Hidden transaction target.
- Hardcoded EVM addresses in Vault source unless the address is a binding-scoped factory/token/Vault reference or an explicitly declared `match.bindings[].externalContracts` target.
- SDK contract calls against fixed non-token/non-Vault/non-factory addresses that are not declared in `match.bindings[].externalContracts`.
- Undeclared endpoint, image URL, IPFS gateway, or other external resource. Immutable Vault-specific images must use `IpfsImage` or `IpfsBackground` from `@/src/ui` with a static image CID that resolves to `image/*` through an allowed Flap IPFS gateway.
- Host-relative endpoint calls such as `fetch("/api/...")`.
- Runtime remote import.
- Dynamic import expression.
- Direct browser network/media APIs such as `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, or `new Image()`, including aliasing, destructuring, string-indexed, or variable-indexed computed browser-global access to those APIs.
- Dynamic, relative, HTTP, credentialed, or undeclared `fetch(...)` target.
- Canvas implementations that depend on browser-global DOM queries, workerized rendering, direct browser network/media APIs, or external assets not already allowed by the template.
- Browser storage or host-state escape APIs such as `localStorage`, `sessionStorage`, `indexedDB`, Cache Storage, or `document.cookie`.
- Browser-global member access except safe timer APIs and reviewed explorer-only `window.open`.
- Browser navigation APIs such as arbitrary `window.open`, bare `open(...)`, `location`, or `history` mutation. `window.open` is allowed only for current-chain explorer address/transaction URLs with `noopener` or `noreferrer`.
- Worker and cross-context APIs such as `Worker`, `SharedWorker`, `navigator.serviceWorker`, `BroadcastChannel`, `postMessage`, or message event listeners.
- Browser permission APIs such as `navigator.clipboard`, `navigator.geolocation`, `navigator.permissions`, or `Notification`.
- Raw iframe, iframe `srcDoc`, direct HTML replacement, or script injection, including `document.write`, `document.writeln`, `document.open`, `document.close`, `innerHTML`, `outerHTML`, and `insertAdjacentHTML`.
- Unsafe inline SVG JSX, including script-capable or mixed-content nodes, event attributes, `foreignObject`, `image`, `use`, external URLs, non-local `url(...)`, `style` `url(...)` / `@import`, `href` / `src` except static local fragments, and spread attributes.
- `eval`, string-based timer callbacks, the `Function` constructor, or constructor-based scope escapes.
- Unapproved dependencies.
- Additional SDK packages or SDK-like wrappers beyond the shared `@/src/sdk` and `@/src/ui` surfaces.
- Missing i18n.
- Remote image URLs inside Vault source. Immutable Vault-specific images must use `IpfsImage cid` or `IpfsBackground cid` and pass `vault:check`.
- Arbitrary external navigation or hardcoded off-site jumps that are not the current chain explorer or an approved external-link host (currently `x.com` and its subdomains, HTTPS only). Approved external-link hosts are allowed for user-facing links only, not as `fetch`/data endpoints.
- Contract reads/writes, event watches, log/filter calls, or gas estimates to unrelated contracts such as routers, bridges, aggregators, or other app contracts outside the Vault/token/NFT/factory/declaration boundary.
- Direct calls to dynamic module contracts such as wrap factories, routers, dividend distributors, staking wrappers, or trigger helpers when the same workflow can be exposed as Vault UI-facing views or public proxy actions on `context.vaultAddress`.
- Operator/admin configuration methods such as `setConfig`, `setSwapPath`, and `setSplit` exposed from `Component.tsx`.
- Binding by unreliable type fields.
- Reimplementing Flap host preflight for taxinfo/feeinfo type mapping, fee mode detection, or deployment binding inside a submitted Vault component.
- Extra files, folders, local utility modules, or local component modules inside the Vault package.
- Symlinks inside the Vault package.
- Local relative imports other than `./VaultABI`.
- CommonJS `require(...)`.
- Unsafe preview/runtime URLs such as `javascript:`, `data:`, protocol-relative URLs, HTTP production origins, WebSocket URLs, `ipfs://` / Arweave links, or non-HTTPS oracle endpoints.

## Allowed

- Local React state.
- Small pure functions inside `Component.tsx`.
- Local small components inside `Component.tsx`.
- Component-scoped `<canvas>` surfaces that draw from local React state and Flap SDK/host data through a React ref. Keep required risk status ahead of large canvas visuals and keep canvas inside the Vault business panel rather than turning the package into a whiteboard/editor.
- CSS/HTML card shapes and `lucide-react` icons before ad hoc SVG; search the official Lucide icon library first at `https://lucide.dev/icons/`. Handwritten inline SVG JSX is allowed only for static pure graphic nodes such as `svg`, `path`, `circle`, `rect`, and gradients with local fragment references.
- Flap SDK contract reads/writes.
- Reading Flap-provided `context.host` values for token info, parsed tax info, VaultPortal info, fee mode, render surface, and registry-selected Vault type.
- `sdk.readOracle(...)` only when the Flap Artifact Workbench/runtime can review and provision the oracle id.
- SDK contract writes using runtime context addresses such as `context.vaultAddress`, `context.tokenAddress`, and `context.factoryAddress`, plus token/NFT addresses derived from runtime context or Vault reads and fixed targets declared in `match.bindings[].externalContracts`.
- UI-facing Vault views and public proxy actions called through `context.vaultAddress`, including read-only state helpers and gated resolve/claim/deposit flows. Keep router/wrap/dividend/staking internals behind the Vault contract.
- Explorer links through `context.explorerBaseUrl`, `AddressLink`, `sdk.openExplorerTx(...)`, or reviewed `window.open` calls that target `context.explorerBaseUrl` address/transaction URLs with `noopener` or `noreferrer`.
- Token logo and NFT media through Flap-controlled host/runtime media policy; immutable Vault-specific images may use only `IpfsImage` or `IpfsBackground` with a static image CID verified through the allowed Flap IPFS gateways.
- One display-only `ReviewedFrame` chart from `@/src/ui` only when the exact static provider URL is declared in `manifest.externalFrames` and approved by Flap review.

Declared non-oracle endpoints are review candidates, not automatic approvals. Avoid them by default. If a special non-oracle endpoint is unavoidable, it must be declared in the manifest and reviewed by Flap before publish. Endpoint URLs must not include username/password credentials. A declaration covers only the exact URL path or child paths on the same origin, never sibling paths or lookalike hosts. Direct `fetch(...)` calls must use static absolute HTTPS targets covered by that declaration. Oracle usage is detected by `vault:check` and provisioned outside the manifest. Anything not declared or provisioned is rejected.
External oracle provider adapters are also outside Vault source. If the oracle cannot be expressed as static reviewed endpoint forwarding with runtime-enforced params, add the adapter to the shared `@flapsdk/vault-runtime/server` package first. Do not add provider-specific path construction, response parsing, EVM byte wrapping, signing, or time-window validation to Workbench or `flap.sh` as a permanent host-local exception.
Endpoint declarations must be a single HTTPS URL string without credentials or an array of HTTPS URL strings without credentials.
If an NFT metadata base URL or another reviewed non-oracle host must be fetched directly, declare that base URL in `manifest.endpoints` and keep the use to data fetches only. Do not turn declared endpoints into user-facing off-site navigation. Internal Oracle endpoints should normally arrive through `sdk.readOracle(...)`; if review needs a raw URL exception, allowlist it out of band for checker/runtime review rather than hardcoding private host policy into the public template.

Declared external frames are review candidates, not automatic approvals. Avoid them by default. If a display-only market chart is unavoidable, declare at most one entry in `manifest.externalFrames` with `id`, `provider`, `src`, and `title`, then render it only through one `ReviewedFrame`. Providers are limited to TradingView, DexScreener, and CoinGecko Terminal/GeckoTerminal exact origins. Frame URLs must be complete static HTTPS URLs with fixed non-empty query strings; more than one `ReviewedFrame`, dynamic URL construction, credentials, hashes, `srcDoc`, postMessage integration, wallet connection, and frame-driven quotes/risk/settlement/transactions are rejected. Frame declarations do not allow `fetch(...)`, navigation, scripts, images, or other external resources.

Declared external contracts are also review candidates, not automatic approvals. Avoid them by default. If a special fixed contract target is unavoidable and is not the runtime token, Vault, factory, or binding-scoped token/Vault reference, declare it under the relevant `match.bindings[].externalContracts` entry with `address` and `label`. Undeclared fixed contract targets are rejected by `vault:check`.
Do not use `externalContracts` for dynamic addresses learned from Vault state, such as module factories, routers, dividend contracts, or wrappers. If the UI needs those values, add a Vault view or user-facing Vault proxy method instead.

## Media

Default: no custom third-party images or external media resources.

Allowed only through Flap-controlled runtime/media policy:

- token logo from Flap metadata
- NFT metadata image through approved media handling
- Flap official static asset
- `IpfsImage` or `IpfsBackground` from `@/src/ui` with a static image CID verified by `vault:check`

## Obfuscation Resistance

The blocking checks are AST-based with constant folding, not only line-level regexes. These do not bypass the checks:

- Splitting a value across `+`, template `${}`, `Array.join`, or `String.fromCharCode` to assemble a hardcoded address or external URL.
- Aliasing a global (`const e = eval`, `const g: any = window`) or using the comma operator (`(0, eval)`, `(0, fetch)`).
- Computed member access such as `x["innerHTML"]`, `["constructor"]`, `Reflect.construct`, or a dynamically built wallet RPC method.
- `React.createElement("iframe" | "script")`, including concatenated tag strings.
- Bare injected-provider identifiers (`ethereum`, `BinanceChain`, `tronWeb`, …).

Hardcoded addresses, unsafe schemes, and undeclared URLs are also detected inside `i18n.json` string values, because component code can consume those strings as `href`, `src`, or a transaction target.

## Verification Boundary

`yarn vault:verify-package` checks source-package format and integrity only — the marker, kind/version, exact file list, metadata, and SHA-256 hashes. It is not the security decision and does not re-run `vault:check`. The Flap Artifact Workbench is the authoritative gate: on upload it re-runs the full `vault:check` on the actual submitted source before publish, so it never trusts the packaged marker's recorded check result. Passing `verify-package` locally does not imply the source is publishable; zero blocking `vault:check` issues on the real source is still required.
