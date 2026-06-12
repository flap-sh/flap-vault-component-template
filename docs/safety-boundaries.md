# Safety Boundaries

Custom Vault UI is controlled business UI, not an arbitrary app surface.

## Blocking

- Direct wallet API access, injected wallet providers, provider discovery, wallet-client signing utilities, or raw provider `request` / `send` / signing / transaction RPC methods.
- Hidden transaction target.
- Hardcoded EVM addresses in Vault source unless the address is a binding-scoped factory/token/Vault reference or an explicitly declared `match.bindings[].externalContracts` target.
- SDK contract calls against fixed non-token/non-Vault/non-factory addresses that are not declared in `match.bindings[].externalContracts`.
- Undeclared endpoint, image URL, IPFS gateway, or other external resource.
- Host-relative endpoint calls such as `fetch("/api/...")`.
- Runtime remote import.
- Dynamic import expression.
- Direct browser network/media APIs such as `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, or `new Image()`, including aliasing, destructuring, string-indexed, or variable-indexed computed browser-global access to those APIs.
- Dynamic, relative, HTTP, credentialed, or undeclared `fetch(...)` target.
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
- Remote image inside Vault source.
- Arbitrary external navigation or hardcoded off-site jumps that are not the current chain explorer.
- Contract reads/writes, event watches, log/filter calls, or gas estimates to unrelated contracts such as routers, bridges, aggregators, or other app contracts outside the Vault/token/NFT/factory/declaration boundary.
- Binding by unreliable type fields.
- Reimplementing Flap host preflight for taxinfo/feeinfo type mapping, fee mode detection, or deployment binding inside a submitted Vault component.
- Extra files, folders, local utility modules, or local component modules inside the Vault package.
- Symlinks inside the Vault package.
- Local relative imports other than `./VaultABI`.
- CommonJS `require(...)`.
- Unsafe preview/runtime URLs such as `javascript:`, `data:`, protocol-relative URLs, HTTP production origins, WebSocket URLs, IPFS/Arweave links, or non-HTTPS oracle endpoints.

## Allowed

- Local React state.
- Small pure functions inside `Component.tsx`.
- Local small components inside `Component.tsx`.
- CSS/HTML card shapes and `lucide-react` icons before ad hoc SVG; search the official Lucide icon library first at `https://lucide.dev/icons/`. Handwritten inline SVG JSX is allowed only for static pure graphic nodes such as `svg`, `path`, `circle`, `rect`, and gradients with local fragment references.
- Flap SDK contract reads/writes.
- Reading Flap-provided `context.host` values for token info, parsed tax info, VaultPortal info, fee mode, render surface, and registry-selected Vault type.
- `sdk.readOracle(...)` only when the Flap Artifact Workbench/runtime can review and provision the oracle id.
- SDK contract writes using runtime context addresses such as `context.vaultAddress`, `context.tokenAddress`, and `context.factoryAddress`, plus token/NFT addresses derived from runtime context or Vault reads and fixed targets declared in `match.bindings[].externalContracts`.
- Explorer links through `context.explorerBaseUrl`, `AddressLink`, `sdk.openExplorerTx(...)`, or reviewed `window.open` calls that target `context.explorerBaseUrl` address/transaction URLs with `noopener` or `noreferrer`.
- Token logo and NFT media only through Flap-controlled host/runtime media policy.
- One display-only `ReviewedFrame` chart from `@/src/ui` only when the exact static provider URL is declared in `manifest.externalFrames` and approved by Flap review.

Declared non-oracle endpoints are review candidates, not automatic approvals. Avoid them by default. If a special non-oracle endpoint is unavoidable, it must be declared in the manifest and reviewed by Flap before publish. Endpoint URLs must not include username/password credentials. A declaration covers only the exact URL path or child paths on the same origin, never sibling paths or lookalike hosts. Direct `fetch(...)` calls must use static absolute HTTPS targets covered by that declaration. Oracle usage is detected by `vault:check` and provisioned outside the manifest. Anything not declared or provisioned is rejected.
External oracle provider adapters are also outside Vault source. If the oracle cannot be expressed as static reviewed endpoint forwarding with runtime-enforced params, add the adapter to the shared `@flapsdk/vault-runtime/server` package first. Do not add provider-specific path construction, response parsing, EVM byte wrapping, signing, or time-window validation to Workbench or `flap.sh` as a permanent host-local exception.
Endpoint declarations must be a single HTTPS URL string without credentials or an array of HTTPS URL strings without credentials.
If an NFT metadata base URL or another reviewed non-oracle host must be fetched directly, declare that base URL in `manifest.endpoints` and keep the use to data fetches only. Do not turn declared endpoints into user-facing off-site navigation. Internal Oracle endpoints should normally arrive through `sdk.readOracle(...)`; if review needs a raw URL exception, allowlist it out of band for checker/runtime review rather than hardcoding private host policy into the public template.

Declared external frames are review candidates, not automatic approvals. Avoid them by default. If a display-only market chart is unavoidable, declare at most one entry in `manifest.externalFrames` with `id`, `provider`, `src`, and `title`, then render it only through one `ReviewedFrame`. Providers are limited to TradingView, DexScreener, and CoinGecko Terminal/GeckoTerminal exact origins. Frame URLs must be complete static HTTPS URLs with fixed non-empty query strings; more than one `ReviewedFrame`, dynamic URL construction, credentials, hashes, `srcDoc`, postMessage integration, wallet connection, and frame-driven quotes/risk/settlement/transactions are rejected. Frame declarations do not allow `fetch(...)`, navigation, scripts, images, or other external resources.

Declared external contracts are also review candidates, not automatic approvals. Avoid them by default. If a special fixed contract target is unavoidable and is not the runtime token, Vault, factory, or binding-scoped token/Vault reference, declare it under the relevant `match.bindings[].externalContracts` entry with `address` and `label`. Undeclared fixed contract targets are rejected by `vault:check`.

## Media

Default: no custom third-party images or external media resources.

Allowed only through Flap-controlled runtime/media policy:

- token logo from Flap metadata
- NFT metadata image through approved media handling
- Flap official static asset
- reviewed IPFS/gateway resource
