# AI Agent Implementation Guide

This repository is designed for AI agents that generate controlled Flap Vault UI source packages.

Use this guide as the stable entry point before editing files.

## Agent Contract

### Startup Sequence

Read in order before editing:

1. `agent-contract.json` — machine-readable contract, error codes, required inputs schema, done report format.
2. Tool-specific entry point if one exists — `CLAUDE.md`, `GEMINI.md`, `.windsurfrules`, `.github/copilot-instructions.md`, `.cursor/rules/flap-vault-ui.mdc`, or `.cursorrules`. These are routing wrappers only; the canonical rules are in the files above and below.
3. `docs/ai-agent.md` — this file; comprehensive implementation guide.
4. `docs/agent-entrypoints.md` — supported agent entry points and startup sequence.
5. `docs/ui-pattern-snippets.md` — read before implementing `Component.tsx`.
6. `skills/flap-vault-ui-generator/SKILL.md` — generator skill with implementation checklist and references.

If the AI assistant does not have direct repository access, use `docs/ai-copy-pack.md` or `yarn --silent vault:ai-context > vault-ai-context.md` to prepare a pasteable context pack first. Pass a specific example folder only when you need that behavior reference.

### Reference Docs

Consult these for detail when the startup sequence doesn't answer a specific question:

- `docs/manifest.md` — manifest field rules, ABI policy, and locale validation
- `docs/sdk.md` — full SDK hook surface, context fields, and taxinfo host context
- `docs/safety-boundaries.md` — blocking and allowed behavior reference
- `docs/prd.md` — product scope, implemented acceptance criteria, and explicit non-goals
- `docs/agent-entrypoints.md` — supported agents, entry points, and startup steps
- `docs/ai-copy-pack.md` — copy/paste context pack guide for web-based AI tools without repo access
- `docs/from-zero-vault-ui.md` — beginner-friendly walkthrough from inputs to verified source zip
- `docs/versioning.md` — when to increment agent-contract.json, manifest schema, package format version, and runtime contract version
- `docs/artifact-intake.md` — Flap Artifact Workbench flow, source package vs runtime artifact
- `docs/runtime-module-contract.md` — shared runtime import/build/host contract for `@/src/sdk`, `@/src/ui`, `context`, and `sdk`

The contract is intentionally small:

- Generate or edit one Vault UI package at a time.
- Implement only the Vault-specific business UI for that package. Do not expand a Vault task into preview shell/header work unless the user explicitly asks for shell work.
- Keep the Vault folder limited to exactly four files.
- Register the Vault folder name in `src/vaults/index.ts` so local preview works.
- Use `yarn vault:register {folder-name}` when the four files already exist and scaffold did not create the package.
- Run checks before packaging.
- Treat every Vault CLI failure as machine-readable JSON. Read `code`, `fixHint`, and `agent.nextActions`; fix those items before retrying.
- Treat any blocking check issue as unfinished work.
- Treat `CLAUDE.md`, `.cursor/rules/flap-vault-ui.mdc`, and `.cursorrules` as tool-specific entry wrappers, not separate rule sources.
- Use `docs/ui-pattern-snippets.md` as the public-safe style reference. Do not copy private Flap source code, names, addresses, endpoints, or constants into the template.

## Required Inputs

Collect all required inputs before creating a new Vault UI. Use `docs/agent-intake-template.md` as the structured Q&A conversation guide. The full machine-readable input schema is in `agent-contract.json` under `requiredInputs`.

| Input | Required | Notes |
| --- | --- | --- |
| `folder name` | Yes | Use 3-64 characters of lowercase kebab-case. Used in `src/vaults/{folder-name}` and preview route `/{folder-name}`. |
| `name` | Yes | Human-readable manifest name shown in the Artifact Workbench. |
| `mode` | Optional | Omit for the default Vault UI. Use `mini-app` only for token-scoped 8888-token Mini App artifacts; Mini App mode is strongly bound to the token address and skips the Vault risk-status tag checks. |
| `bindings` | Yes | Core generation uses `chainId` plus non-zero `factoryAddress` for factory-scoped UI, or exactly one non-zero `vaultAddresses` entry for no-factory UI. Include a real deployed ERC20 test token ending in `7777` or `8888` plus the final real mainnet factory binding when mainnet launch is planned. |
| `vaultAddresses` | Required for core no-factory binding | In no-factory mode, provide exactly one Vault address as `match.bindings[].vaultAddresses: ["0x..."]` for the normal scaffold path. |
| `caRestrictionMode` | Yes | One of `none`, `reserved`, or `verified`. This is a Workbench/registry production decision, not a public manifest field. |
| `testTokenAddresses` | Yes | Use real deployed ERC20 token(s) whose address ends in `7777` or `8888`. Store them only inside `match.bindings[].tokenAddresses` so `vault:check`, Workbench, and `vault:e2e` have manifest-declared proof input. |
| `productionFactoryAddress` | When mainnet factory-scoped launch is planned | Provide the final real mainnet factory address early and write it to the mainnet binding `factoryAddress` instead of using random mainnet token CAs for testing. |
| `productionRestrictedTokenAddresses` | Only for `verified` CA restriction | Workbench/registry-only production restriction input. Do not add it as global `tokenAddresses`, `restrictTokenAddresses`, `caPolicy`, or any other public manifest field. |
| `tokenAddresses` | Yes, at manifest level | Use only inside `match.bindings` entries. In factory mode this is the manifest test-token source, not the production CA restriction. In no-factory mode the checker also accepts token-only and Vault+token mappings with multiple token CAs when Flap review/runtime supplies that manifest shape. In `mini-app` mode, a token-scoped `8888` token address is mandatory because the artifact is bound by token address. |
| `externalContracts` | Optional | Use only when a binding needs a fixed non-token/non-Vault/non-factory contract target. Each entry is `{ address, label }` and is review-only. |
| `externalFrames` | Optional | Use only when a display-only chart embed is unavoidable. At most one entry is allowed. Providers are limited to `tradingview`, `dexscreener`, and `coingecko-terminal`; `src` must be one complete static HTTPS provider URL with fixed query params. |
| `locales` | Yes | Example: `en,zh` or `zh`. Each locale string must be at least two characters. Check validates only declared locales. |
| `VaultABI` | Yes | Minimal Vault ABI fragments used by the component. Do not include standard ERC20 here. |
| `uiWorkflow` | Yes | Primary reads, primary writes, approval spender, native value, refetch points, empty states, risk posture, and current contract risk-status handling. |
| `actionAvailabilityStage` | Yes | One of `internal-market`, `dex-listed`, `both`, or `read-only`. Use `context.host?.marketPhase` and `isActionAvailableForPhase(...)` for runtime gating. Do not hide available actions because the token is not DEX-listed. |
| `preview addresses` | Recommended | Real `chainId`, `tokenAddress`, `vaultAddress`, and, when available, `factoryAddress` for local preview. |

## Fast New Vault Flow

There are two supported creation paths:

| Path | Use When | Required Commands |
| --- | --- | --- |
| Scaffold-first | The Agent is creating a new package from inputs such as folder name, chain, factory or Vault, and locales. | `yarn vault:scaffold {folder-name} ...` |
| Manifest-first | The Agent already has or generated the four Vault files from a provided manifest. | `yarn vault:register {folder-name}` |

Both paths must end with `yarn vault:check {folder-name}`, `yarn vault:e2e {folder-name}`, and `yarn vault:package {folder-name}`. Do not hand-edit `src/vaults/index.ts` unless `vault:register` reports that the index shape cannot be parsed.
For a step-by-step beginner path that starts from raw Vault requirements and ends with a verified zip, follow `docs/from-zero-vault-ui.md`.

Use the scaffold command to avoid folder and manifest mistakes. For a mainnet factory-scoped launch, the complete case keeps the testnet proof token and final mainnet factory in the same manifest:

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 97 --factory 0xTestnetFactory --token 0xReal7777TestToken --chain 56 --factory 0xMainnetFactory --locales en,zh
```

For a single-Vault UI that has no factory, omit `--factory` and provide one Vault address plus a manifest test token:

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --vault 0xVaultAddressRequired --token 0xReal7777TestToken --locales en,zh
```

For a single-language UI:

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 97 --factory 0xTestnetFactory --token 0xReal7777TestToken --chain 56 --factory 0xMainnetFactory --locales zh
```

Replace these placeholder strings with real `0x` + 40 hex deployment addresses before running scaffold. `vault:check` blocks malformed, zero, and reserved template placeholder binding addresses, including the legacy `0x1000000000000000000000000000000000000001` factory fixture.

Every binding-scoped `tokenAddresses` entry, including optional factory-mode entries, must be a real deployed ERC20 token address ending in `7777` or `8888`. In factory mode, `tokenAddresses` is package proof input, not production CA restriction. Do not add global `tokenAddresses`, `restrictTokenAddresses`, or `caPolicy`. Local-only `vault:e2e --token` overrides do not satisfy `vault:check`. Production CA restriction must be collected as `caRestrictionMode`: `none` does not restrict production CA, `reserved` locks a future CA but cannot publish/route, and `verified` is applied only by Workbench/registry after ERC20 plus factory/Vault/token relationship checks.

If the UI needs a non-oracle HTTPS endpoint, declare it in `manifest.endpoints` as a single absolute HTTPS URL string without username/password credentials or an array of those strings so `vault:check` can validate it and the Workbench can route it for review. Any direct `fetch(...)` must use a static absolute HTTPS string covered by that declaration. Also add it as an `openItems` entry until Flap review explicitly approves it. The `openItems` entry must include: the endpoint URL, purpose, request/response shape, data sensitivity, why on-chain reads or `sdk.readOracle(...)` are insufficient, and the fallback behavior when the endpoint is unavailable. This repository does not define SLA, approver, or ticket routing for endpoint review; agents must not imply approval just because `manifest.endpoints` validates.

If the UI needs a display-only market chart iframe, declare it in `manifest.externalFrames` and render it only through `ReviewedFrame` from `@/src/ui`. The declaration must be an array with at most one entry containing `id`, `provider`, `src`, and `title`. Supported providers are only `tradingview`, `dexscreener`, and `coingecko-terminal`; CoinGecko Terminal embeds use the GeckoTerminal domain. The `src` must be the complete static HTTPS provider URL with a non-empty fixed query string, no username/password credentials, and no hash. Component code may render at most one `ReviewedFrame` and must pass static string literal `frameId`, `provider`, `src`, and `title` props that exactly match the manifest entry. Do not use raw `<iframe>`, `srcDoc`, dynamic URL construction, postMessage, wallet connection, transaction flows, quote/risk/settlement logic, or arbitrary third-party embeds. Add the external frame as an `openItems` entry until Flap review explicitly approves it.

If the UI needs a fixed non-token/non-Vault/non-factory contract target, declare it under the relevant `match.bindings[].externalContracts` entry with `address` and `label`. Also add it as an `openItems` entry until Flap review explicitly approves the target. The `openItems` entry must include: address, label, chain/factory binding, purpose, read/write methods, why runtime token/Vault/factory addresses are insufficient, and fallback behavior when the call fails. Do not use a top-level `contracts` field.

Then edit only:

```plain text
src/vaults/{folder-name}/Component.tsx
src/vaults/{folder-name}/manifest.json
src/vaults/{folder-name}/VaultABI.ts
src/vaults/{folder-name}/i18n.json
```

If the Vault files were generated directly from a provided manifest instead of using `vault:scaffold`, run:

```bash
yarn vault:register {folder-name}
```

This only adds local preview wiring to `src/vaults/index.ts`; it does not perform any production publish or deployment binding step.

Do not add helper files, nested components, assets, docs, local JSON data, symlinks, CommonJS `require(...)`, or dynamic imports inside the Vault folder.

The folder name is the route and source folder only. Do not use it as the artifact identity. `vault:scaffold` generates the stable source-package `artifactId`, and the folder-name segment in that ID must stay tied to the Vault folder name. `match` remains the developer-facing binding intent for deployment targets.

## Implementation Rules

Use:

- `@/src/sdk` for runtime context, contract reads/writes, oracle reads, notifications, i18n, formatting, and tx errors.
- `@/src/sdk` exported `erc20Abi` or `standardErc20Abi` for standard ERC20 `balanceOf`, `allowance`, `approve`, `decimals`, `symbol`, `transfer`, and `transferFrom`.
- `@/src/ui` for shared UI primitives.
- CSS/HTML card shapes and `lucide-react` icons before ad hoc SVG. Search the official Lucide icon library first: `https://lucide.dev/icons/` (main site: `https://lucide.dev/`). FontAwesome is acceptable only in host repositories or runtimes that explicitly include and allow it; this template's Vault package allowlist does not include FontAwesome by default.
- Handwritten inline SVG JSX only when it is static pure graphic markup: `svg`, `g`, `defs`, `path`, `circle`, `rect`, `line`, `polyline`, `polygon`, `ellipse`, `linearGradient`, `radialGradient`, `stop`, `clipPath`, `mask`, `title`, and `desc`, with local fragment refs such as `fill="url(#gradient)"`.
- `canvas` only for component-scoped business visualization inside the Vault body. Use a React ref rather than `document` queries, draw only from local state or SDK/host-derived data, keep the required host risk status above any large canvas block, and do not treat canvas as a free-form app shell or full-screen editor.
- `ReviewedFrame` from `@/src/ui` only for the single reviewed display-only `manifest.externalFrames` entry.
- `./VaultABI` as the only local relative import.
- Tuple result types for ABI methods with multiple return values. `sdk.readContract` returns `returns (uint256 a, uint256 b)` as a tuple array, even when the outputs are named in a human-readable ABI. Read it as `readonly [a: bigint, b: bigint]`, then map tuple indexes into object-shaped UI state. Do not type multi-output reads as object interfaces. A single returned Solidity `tuple` / struct output declared as one ABI output with `components` may still be read as an object.
- No additional SDK package, SDK-like wrapper, or shared-runtime deep import beyond exact `@/src/sdk` and `@/src/ui` barrel imports. Do not import `@/src/sdk/format`, `@/src/ui/Button`, or any other `@/src/sdk/*` / `@/src/ui/*` path from Vault source.
- `docs/ui-pattern-snippets.md` to choose section order, metric grids, action panels, transaction states, and empty/error states.
- The scaffold default surface as the preferred visual starting point. Built-in examples are behavior references; do not copy their visual layout as the default.
- For `manifest.mode: "mini-app"`, put a full-height class or inline height on the outermost returned layout element, for example `min-h-[100vh]`, `min-h-screen`, `min-h-full`, or `h-full`.
- An explicit action availability stage: `internal-market`, `dex-listed`, `both`, or `read-only`.
- `context.host?.marketPhase` as the stage source of truth. The current template preview host provides this API for local self-test; production Flap host injects equivalent context. Existing tokens with `tokenInfo.status < 2` are `internal-market`; existing tokens with `tokenInfo.status >= 2` are `dex-listed`; missing token info is `unknown`.
- `readTaxVaultHostContext(context.host)` as the normalized public SDK accessor for custom Vault host state. Custom Vault UI in this template targets the tax-token path, so the live runtime fields that matter are `marketPhase`, `isListed`, and host-injected token metadata rather than ad hoc token-type props.
- Current contract risk status from `readTaxVaultHostContext(context.host)` for default Vault UI. Derive it from `host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel`, display it within the first three visible Vault-specific business rows/blocks and before any preview, hero, banner, showcase, media, chart, or large visual block, and render a warning/danger notice when the risk level is unavailable. This is required unless `manifest.mode` is `mini-app` for a token-scoped 8888-token Mini App. Do not hardcode or unconditionally render `Low risk` / `低风险` labels, badges, summaries, or reassuring copy; those labels may appear only when selected from the host-derived `riskLevel === 1` branch.
- `isActionAvailableForPhase(stage, context.host?.marketPhase ?? "unknown")` to keep stage-gated buttons consistent.
- `sdk.wallet.isWrongNetwork` and `sdk.wallet.switchChain()` when a write flow depends on the active wallet being on `context.chainId`. Keep the write section visible and render a clear switch-network state instead of attempting the write on the wrong chain.
- `context.tokenImageUrl`, `context.tokenName`, and `context.tokenSymbol` for token header/media data. The template preview shell first asks the same-origin runtime proxy for host presentation data, then falls back to ERC20 `symbol()` / `name()` from the preview `tokenAddress`; mocked image fallback is reserved for the neutral preview fixture only. `tokenAddress` alone is metadata-only in preview; use `marketPhase`, `isListed`, `status`, or `tokenStatusCode` when token lifecycle state matters.
- `IpfsImage` from `@/src/ui` when a Vault-specific immutable image is unavoidable, or `IpfsBackground` from `@/src/ui` for a decorative full-area/background image. Pass only a static image CID via `cid`; do not pass full gateway URLs, metadata CIDs, `ipfs://` values, paths, or dynamic expressions. `vault:check` verifies each CID resolves through at least one allowed Flap IPFS gateway to `image/*` before packaging.
- Contract targets limited to `context.vaultAddress`, `context.tokenAddress`, `context.factoryAddress`, runtime payment/quote/dividend token addresses, token/NFT addresses derived from Vault reads, and declared `match.bindings[].externalContracts`. Do not interact with routers, bridges, aggregators, or unrelated app contracts from a Vault package.
- For Vaults that coordinate internal modules such as wrap factories, routers, dividend distributors, staking wrappers, or trigger helpers, keep those modules behind Vault UI-facing view methods and public proxy actions. Add only the Vault-facing ABI fragments to `VaultABI.ts` and call them through `context.vaultAddress`; do not declare dynamic module addresses as `externalContracts` to bypass this boundary. Public proxy actions such as resolve, claim, or deposit flows are acceptable when they are stage-gated, wrong-network-gated, and contract-state-gated; operator/admin config methods such as `setConfig`, `setSwapPath`, and `setSplit` must not be exposed from `Component.tsx`.
- Fixed extra contract targets declared under `match.bindings[].externalContracts` only when the target is truly required and cannot be represented by runtime token/Vault/factory context.
- The preview shell / production host for the target surface to own token breadcrumb/header, close control, `Vault Information` frame, wallet header, language selector, invalid token fallback, width constraint, and any standard shared summary block already present on the host surface.
- The component to start at the first Vault-specific business section below `Vault Information`.
- `VaultBanner` only when the target host surface truly lacks a standard shared summary/header block. Do not default to a component-owned top banner.

Do not use:

- Direct wallet APIs such as `window.ethereum`, injected wallet providers such as `web3.currentProvider`, EIP-6963 provider discovery, wallet-client/account signing utilities, or raw provider `request` / `send` / signing / transaction RPC methods.
- Direct browser-global member access such as `window.*`, `document.*`, or `navigator.*`, except safe `window.setTimeout` / `window.clearTimeout` / `window.setInterval` / `window.clearInterval` timers and reviewed explorer-only `window.open` calls.
- Arbitrary `window.open` or bare `open(...)`. `window.open` may be used only for current-chain explorer `/address/` or `/tx/` URLs derived from `context.explorerBaseUrl`, and must include `noopener` or `noreferrer`.
- `eval`, string-based timer callbacks, the `Function` constructor, constructor-based scope escapes, raw iframe, `srcDoc`, script injection including `document.write` / `document.writeln` / `document.open` / `document.close`, direct HTML replacement such as `innerHTML` / `outerHTML` / `insertAdjacentHTML`, or `dangerouslySetInnerHTML`.
- Unsafe inline SVG JSX, including `script`, event attributes, `foreignObject`, `image`, `use`, external URLs, non-local `url(...)`, `style` `url(...)` / `@import`, `href` / `src` except static local fragments, spread attributes, or unsupported SVG/HTML nodes inside an `<svg>` subtree.
- Canvas flows that depend on browser-global DOM queries, workers, direct browser network/media APIs, `new Image()`, external assets, or full-screen whiteboard/editor behavior.
- CommonJS `require(...)`; use static ESM imports only.
- Dynamic imports inside Vault source.
- Direct browser network/media APIs such as `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, or `new Image()`.
- Browser storage, cookie, navigation, Worker, cross-context messaging including postMessage listeners, clipboard, geolocation, permission, or notification APIs.
- External URLs unless declared as non-oracle `manifest.endpoints` using a single HTTPS URL string without credentials or an array of HTTPS URL strings without credentials. Full gateway image URLs are not allowed; immutable Vault-specific images must use `IpfsImage cid` or `IpfsBackground cid`.
- More than one `ReviewedFrame`, or external frames unless declared in `manifest.externalFrames` and rendered through `ReviewedFrame` with static string literal props that exactly match the declaration.
- Dynamic, relative, HTTP, credentialed, or undeclared `fetch(...)` targets. Direct `fetch(...)` must use a static absolute HTTPS string covered by `manifest.endpoints`.
- Fixed contract targets outside `context.tokenAddress`, `context.vaultAddress`, `context.factoryAddress`, binding-scoped `tokenAddresses`/`vaultAddresses`, or `match.bindings[].externalContracts`.
- Arbitrary off-site navigation. Component-owned links should stay on the current chain explorer only; do not send users to other websites from a Vault package.
- Oracle config in `manifest.json`.
- Actions, media, fallback, id, owner, version, sdkVersion, or contracts in `manifest.json`.
- Undeclared hardcoded transaction target addresses in `Component.tsx`.
- Standard ERC20 ABI fragments in `VaultABI.ts`; use the SDK export unless the token has custom non-standard methods.
- Silent action removal when an action is unavailable. Show the panel with a clear disabled or unavailable state instead.
- Reimplementing token phase detection inside `Component.tsx`; use the host-provided `marketPhase`.
- Uploading media, fetching private token metadata or token image APIs inside `Component.tsx`; use runtime context values injected by the template preview host / production Flap host, or `IpfsImage` / `IpfsBackground` with a static image CID when the image is Vault-specific and immutable.

### Vault-Specific Images

Use `context.tokenImageUrl`, `context.tokenName`, and `context.tokenSymbol` for token presentation. Only use custom media when the image is Vault-specific, immutable, and already pinned outside the Vault UI package.

If a project needs Flap-hosted IPFS availability instead of a developer's personal Pinata gateway, upload the image through the Flap token metadata upload API documented in [Launch token through Portal](https://docs.flap.sh/flap/developers/token-launcher-developers/launch-token-through-portal#id-1-prepare-token-metadata). Use `https://funcs.flap.sh/api/upload` outside the Vault package with the `create(file, meta)` mutation. The response `data.create` is a metadata CID for Portal launch `meta`, not the `IpfsImage` value. For Vault UI media, fetch that metadata JSON, read its `image` field, strip any gateway URL or `ipfs://` prefix, and keep only the actual image CID.

When a user provides an `imageCid`, render it through `IpfsImage` and emit the CID as a static string literal:

```tsx
import { IpfsImage } from "@/src/ui";

<IpfsImage
  cid="bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq"
  alt={i18n.t("media.heroAlt")}
  className="aspect-[16/9] w-full rounded-md object-cover"
/>
```

Do not emit `imageUrl`, `<img src="https://.../ipfs/...">`, `ipfs://...`, CSS `url(...)`, a metadata CID, or a runtime variable/expression for `cid`. If the upload flow returns a metadata CID, fetch the metadata JSON and extract the `image` field first; then strip the gateway or `ipfs://` prefix and keep only the actual image CID. The Vault package must not implement the upload or pinning flow.

For a decorative full-area background, use `IpfsBackground` inside a positioned container instead of CSS `background-image`:

```tsx
import { IpfsBackground } from "@/src/ui";

<div className="relative overflow-hidden rounded-[18px]">
  <IpfsBackground cid="bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq" overlayClassName="bg-black/45" />
  <div className="relative z-10">{/* Vault business UI */}</div>
</div>
```

`vault:check` validates every static `IpfsImage cid` or `IpfsBackground cid` by probing the allowed Flap IPFS gateways and requiring an `image/*` response. If `media-policy/invalid-ipfs-image-cid` appears, replace the prop with a raw static image CID. If `media-policy/ipfs-image-unavailable` appears, the CID is not currently readable as an image through the allowed gateways, so use a pinned image CID that resolves correctly or remove the media.

For default Vault UI, risk status still controls visual order: if the image is a hero, preview, showcase, or other large visual block, place the required host-derived risk status before it. `manifest.mode: "mini-app"` skips only this risk-status tag requirement.

## Validation Loop

All Vault commands are designed for Agent recovery. On failure, parse the JSON output:

- `ok: false`
- `code`
- `error`
- `fixHint`
- `agent.nextActions`

Do not retry the same command blindly. Apply `agent.nextActions` first, then rerun the failed command.

Run:

```bash
yarn vault:check {folder-name}
```

This command first fetches the official template ref and requires local `HEAD` to exactly match the latest `origin/main`; behind, ahead, or diverged branches fail with `template-freshness/behind`, `template-freshness/ahead`, or `template-freshness/diverged`. It then checks npm latest `@flapsdk/vault-runtime` against the local `package.json` version and verifies that the local git history contains the npm latest package's published `gitHead`. A stale checkout, for example local `0.1.0` when npm latest is `0.1.1`, fails with `template-freshness/npm-outdated`. A checkout with only the version string edited but not the source update fails with `template-freshness/npm-git-head-mismatch`.

The output is JSON and includes:

- `ok`
- `summary`
- `agent.verdict`
- `agent.nextActions`
- `issues`

If `summary.blocking` is greater than zero, fix those issues before doing anything else.
If `manual-review/action-stage-gating` appears, the component has a write path but does not reference `marketPhase` or `isActionAvailableForPhase`. This is blocking; add explicit stage gating and visible unavailable-state copy before packaging.
If `visual-policy/row-heavy-dashboard` appears, the component copied the old sample-dashboard shape. Rebuild it with the scaffold default surface / NiePan-style compact template: one primary business card, a small metric strip, one visible action panel, and lower runtime facts.
If `manifest-binding/mixed-binding-target` appears, one binding contains both `factoryAddress` and `vaultAddresses`. Choose one scope: factory-scoped UI uses `factoryAddress`; single-Vault UI omits `factoryAddress` and uses exactly one `vaultAddresses` entry.
If `manifest-binding/missing-test-token` appears, add the required package-proof token source. If `manifest-binding/invalid-test-token-suffix` appears, replace the offending `tokenAddresses` entry with a real deployed ERC20 token ending in `7777` or `8888`. This applies to factory bindings too; it is still not a production CA restriction.
If `manifest-binding/invalid-mini-app-binding` or `manifest-binding/invalid-mini-app-token` appears, use `manifest.mode: "mini-app"` only with token-scoped `match.bindings[].tokenAddresses` ending in `8888`. Mini App artifacts are bound by token address, so factory/Vault bindings or missing token addresses are invalid.
If `mini-app-layout/missing-full-height-root` appears, add `min-h-[100vh]`, `min-h-screen`, `min-h-full`, or `h-full` to the outermost returned Mini App layout element.
If `risk-status/missing-host-risk-state` appears, the default Vault UI component does not visibly render the current contract risk status from host Vault/TaxInfo context. Add `riskLevel` handling from `readTaxVaultHostContext(context.host)` and a prominent missing-risk warning before retrying. Use `manifest.mode: "mini-app"` only for a token-scoped 8888-token Mini App.
If `risk-status/not-prominent-placement` appears, the component renders host risk status too low or after a large visual block. Move the risk badge, metric, or row within the first three visible Vault-specific business rows/blocks, before any preview, hero, banner, showcase, media, chart, or large visual block, before retrying.
If `risk-status/manual-low-risk-label` appears, the component renders `Low risk` / `低风险` copy without deriving it from host `riskLevel === 1`. Remove the manual label or move it into the explicit host-risk mapping branch before retrying.
If `contract-abi/human-readable-requires-parse-abi` appears, `VaultABI.ts` exports human-readable ABI signature strings without `parseAbi(...)`. Import `parseAbi` from `viem` and wrap the string array, or use full object ABI fragments.
If `contract-abi/multiple-outputs-require-tuple-read` appears, `Component.tsx` typed an ABI method with multiple return values as an object. Change the `readContract` generic to a tuple type and map indexes into the object state after the read.
If `contract-boundary/operator-method-exposed` appears, `Component.tsx` is trying to expose an operator/admin configuration method. Remove `setConfig`, `setSwapPath`, `setSplit`, or similar config setters from the Vault UI; ask the Vault contract to expose a user-facing view or public proxy action instead.

When changing the check script or Agent contract itself, also run:

```bash
yarn vault:check:selftest
```

That selftest creates temporary Vault fixtures and verifies the checker still blocks CA policy inside the UI manifest, missing manifest test tokens, non-`7777`/`8888` test tokens, mixed factory/Vault binding targets, malformed, zero, or reserved placeholder binding addresses, malformed or credentialed endpoint declarations, endpoint-prefix escapes, invalid or dynamic external frame usage, hidden host-relative/dynamic/credentialed fetches, CommonJS `require(...)`, symlinks, browser-global escapes, unsafe `window.open`, document overwrite APIs, eval-like execution, direct wallet-provider/signing bypasses, browser storage/navigation/worker/permission APIs, SDK-like package imports, phishing-sensitive external navigation, disallowed contract targets, operator/admin config methods in `Component.tsx`, IPFS-style non-image resources, full gateway image URLs, invalid `IpfsImage` / `IpfsBackground` CIDs, invalid folder names, raw human-readable ABI string arrays without `parseAbi(...)`, object-typed reads for multi-output ABI methods, and standard ERC20 ABI fragments in `VaultABI.ts`.

When it passes:

```bash
yarn vault:e2e {folder-name}
yarn vault:package {folder-name}
yarn vault:verify-package dist/{folder-name}.zip
```

The package command prints:

- `sourcePackagePath`
- `sourcePackageAbsolutePath`
- `packageMarkerFile`
- `packageKind`
- `runtimePackageGitHead`
- `sha256`
- `bytes`

`vault:e2e` writes `dist/e2e/{folder-name}/qa-report.json` and must cover PC / iPad / H5 for `default`, `internal-market`, `dex-listed`, and wrong-network states. This V1 gate is deterministic Playwright DOM/layout/state checking and must not depend on AI image judgment. The E2E proof must use a real deployed `7777`/`8888`-suffix test token declared in manifest `match.bindings[].tokenAddresses`; local `--token 0x...` overrides are only for developer self-test and do not satisfy `vault:check` or Workbench intake.
First-time local machines, especially Windows machines, may need `yarn playwright install chromium` before Chromium can launch. If the browser is missing, `vault:e2e` must emit the JSON code `vault-e2e/playwright-browser-missing` with that fix hint. GitHub Actions uses `npx playwright install --with-deps chromium`.
Submit only the zip produced by this command. The zip contains format-version `4` `flap-vault-package.json`, `qa/e2e-report.json`, and matching `e2e` summary fields, which identify the package as a script-generated Flap Vault UI source package and record required file hashes, E2E proof hashes, plus npm latest `@flapsdk/vault-runtime` `gitHead` provenance. Flap Artifact Workbench should reject hand-made zips without this marker, proof, or matching hashes.
The package command uses the same official git freshness gate as `vault:check` and rejects missing, failed, or stale E2E proof, so a checkout that is behind, ahead, diverged, or not E2E-proven cannot produce a source zip.
The verify command checks the same source package from the Workbench side: marker, kind/version, exact file list, metadata, E2E proof, and SHA-256 hashes. If it fails, read the JSON `code`, `fixHint`, and `agent.nextActions`, then regenerate the package instead of editing the zip by hand.
Do not describe a future write-UI tx hash as a strong local-origin proof. A local wallet trace or tx hash can prove a real transaction and target, but only a platform-controlled Playwright + wallet runner can strongly prove the UI path by replaying it in a trusted environment.

If you changed shared runtime surfaces such as `src/sdk/*`, `src/ui/*`, the runtime proxy, or the host-runtime package boundary, also run:

```bash
yarn runtime:package
yarn runtime:verify-package
```

That proves the shared runtime surface is still packable for Workbench / host reuse and that the generated `runtime-contract.json` stays in sync.
`yarn build` and `yarn runtime:package` also run the same exact-`origin/main` git freshness gate and npm latest version gate before producing local build outputs.

## Preview Loop

Start local preview:

```bash
yarn dev
```

Open:

```plain text
http://localhost:3000/{folder-name}
```

If this route returns 404, run `yarn vault:check {folder-name}`. A missing local preview registration is reported as `preview-registration/missing-vault-module`; fix it with `yarn vault:register {folder-name}`.

Use URL params when real runtime addresses are needed:

```plain text
http://localhost:3000/{folder-name}?chainId=56&vaultAddress=0x...&tokenAddress=0x...
```

Preview/runtime binding resolution is conservative. Prefer an exact `chainId + factoryAddress` match for factory-scoped UI, or `chainId + vaultAddress` plus optional `tokenAddress` for the core no-factory path. Manifest-provided no-factory token mappings can also match by `chainId + tokenAddress`. A partial hint such as `chainId` alone is only used when it resolves to one unambiguous binding. The first manifest binding is only a local-preview default when the route provides no runtime hints at all. When the preview host can read live token/Vault factory or Vault data from chain, the active runtime target must match `manifest.match.bindings`.

For real action-gating QA, first use a supported `chainId + tokenAddress` so the preview host reads the live Portal status and host context for that token. Use the right-side "Token phase self-test" panel only when you intentionally want to override that host context for isolated UI checks. In that panel, `Real` restores the live host phase, while `Internal` and `Listing` are explicit local overrides. `unknown` can still appear in runtime readout when host data is unavailable, but it is not a primary phase tab.

Token image/name/symbol are host-owned preview values. When the preview URL has a token address, the shell first asks the same-origin `/api/runtime/token-presentation` route for host presentation data, then falls back to ERC20 `symbol()` / `name()` from chain, and reads real host lifecycle/tax context on supported preview chains. `/logo.png` is now reserved for the neutral preview fixture only. This lets developers verify token media rendering and stage-gated behavior without adding private fetches to the Vault component.

The same preview host API is addressable by URL:

```plain text
http://localhost:3000/{folder-name}?tokenAddress=0x...&vaultAddress=0x...&factoryAddress=0x...&marketPhase=internal-market
http://localhost:3000/{folder-name}?tokenAddress=0x...&vaultAddress=0x...&factoryAddress=0x...&marketPhase=dex-listed
```

`marketPhase` is preferred for preview. Low-level `status=1` and `status=2` remain available when testing raw Portal status behavior.

If you need taxinfo/feeinfo host surfaces in preview, `taxInfo=1` plus a valid `tokenAddress` seeds an existing-token preview context only when real chain host data is unavailable or when you intentionally want fixture behavior. Add `marketPhase=internal-market` or `marketPhase=dex-listed` when the exact stage matters.

Built-in reference packages:

- `example`: reward/oracle pattern with approve, simulate, write, claim, and refetch.
- `dex-listed-example`: listed-only stage gate with visible disabled state before listing and approve -> write after `marketPhase=dex-listed`.
- `action-gallery-example`: richer action gallery showing internal-market, DEX-listed, both-stage, and read-only controls in one previewable Vault.
- `community-buyback-example`: live CA Store example for the Community Approved Buyback vault on BNB.
- `flapixel-example`: live CA Store example for the FLAPixel NFT vault on BNB.

Built-in examples use real `7777`/`8888`-suffix BNB token/factory bindings for package proof. `example`, `dex-listed-example`, and `action-gallery-example` are workflow fixtures only; `community-buyback-example` and `flapixel-example` are reviewed live host/runtime examples. Do not treat any example as a factory, token, Vault, or project endorsement. For local testing with a different reviewed Store factory or fixed Vault, pass real runtime values through URL params instead of committing additional addresses into a public template fixture.

Token image preview is also addressable by URL. `tokenImageUrl` is the direct override when a local preview needs a different mocked image:

```plain text
http://localhost:3000/{folder-name}?tokenAddress=0x...&tokenImageUrl=/logo.png
```

The manifest panel on the preview page is only a review aid. It is not part of the packaged Vault UI.
The same boundary applies to the shell header and frame around the Vault body. The packaged Vault source should contain only the business UI that renders below the shell-owned frame.

## Done Criteria

A generated Vault UI is done only when:

- `yarn vault:check {folder-name}` reports zero blocking issues.
- The local template package version is at least npm latest `@flapsdk/vault-runtime`.
- `manifest.artifactId` exists, matches `vaultui_<folder-name>_<ULID>`, and is unique in this repo.
- The manifest includes at least one valid real deployed `7777`/`8888`-suffix `match.bindings[].tokenAddresses` entry for Workbench/E2E test coverage.
- `yarn vault:e2e {folder-name}` succeeds and writes a current `dist/e2e/{folder-name}/qa-report.json`.
- `yarn vault:package {folder-name}` succeeds and prints the package path.
- `yarn vault:verify-package dist/{folder-name}.zip` succeeds.
- The zip contains the script-generated `flap-vault-package.json` marker, `qa/e2e-report.json`, and matching `e2e` summary metadata.
- The folder name is registered and previewable at `/{folder-name}`.
- All user-facing copy used by `Component.tsx` exists in every locale declared by `manifest.i18n`; `Component.tsx` itself does not hardcode locale text, countdown units, preview fallback names, labels, notices, or button text.
- The component uses runtime context addresses for reads and writes.
- Stage-gated actions were previewed with both `marketPhase=internal-market` and `marketPhase=dex-listed`, and unavailable buttons remain visible with clear copy.
- Default Vault UI shows current contract risk status from host `riskLevel`, and the missing-risk state shows a prominent warning/danger message. `manifest.mode: "mini-app"` is the only exception.
- Default Vault UI host risk status appears within the first three visible Vault-specific business rows/blocks and before any preview, hero, banner, showcase, media, chart, or large visual block.
- Default Vault UI has no `Low risk` / `低风险` label or reassuring low-risk copy unless it is selected from the host-derived `riskLevel === 1` branch.
- Any write-capable flow was also previewed in a wrong-network state, and the component rendered a clear switch-network path instead of attempting the write.

## Done Report

After `vault:verify-package` succeeds, produce a structured handoff summary for the user. The required fields are defined in `agent-contract.json` under `doneReport`. Include at minimum:

- `folderName` and `artifactId`
- `sourcePackagePath` and `sha256` from `vault:package` output
- `e2eReportPath`, `chainId`, `tokenAddress`, viewport count, phase list, and layout blocking count from `vault:e2e`
- `checkSummary` blocking and warning counts
- `previewUrl` (`http://localhost:3000/{folder-name}`)
- `actionAvailabilityStage` and `selectedPatterns`
- `locales` validated by `vault:check`
- `openItems` — any oracle IDs pending Flap provisioning, endpoint declarations pending Flap review, or unresolved assumptions

Use this Markdown shape so handoffs stay comparable across agents:

```plain text
Summary
folderName: ...
artifactId: ...
actionAvailabilityStage: ...
selectedPatterns: ...
locales: ...

Package
sourcePackagePath: ...
sha256: ...

Validation
vault:check: blocking=0 warning=N info=N
vault:verify-package: passed

Preview
previewUrl: http://localhost:3000/{folder-name}
phase checks: internal-market ..., dex-listed ...
wrong-network check: ...

Open Items
- none
```

Build `openItems` from the final `vault:check` output and the work you actually skipped or could not prove. Include every `manual-review/oracle-usage` oracle id, every `manual-review/external-endpoint` endpoint URL, missing ABI/preview address assumptions, skipped phase or wrong-network preview, endpoint approval, oracle provisioning, registry binding, and runtime publish approval. If there are no open items, write `none`; do not omit the section.
