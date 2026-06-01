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

If the AI assistant does not have direct repository access, use `docs/ai-copy-pack.md` or `yarn --silent vault:ai-context action-gallery-example > vault-ai-context.md` to prepare a pasteable context pack first.

### Reference Docs

Consult these for detail when the startup sequence doesn't answer a specific question:

- `docs/manifest.md` — manifest field rules, ABI policy, and locale validation
- `docs/sdk.md` — full SDK hook surface, context fields, and taxinfo host context
- `docs/safety-boundaries.md` — blocking and allowed behavior reference
- `docs/prd.md` — product scope, implemented acceptance criteria, and explicit non-goals
- `docs/agent-entrypoints.md` — supported agents, entry points, and startup steps
- `docs/ai-copy-pack.md` — copy/paste context pack guide for web-based AI tools without repo access
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
| `bindings` | Yes | Explicit binding targets. Each entry needs `chainId` plus either non-zero `factoryAddress` for factory-scoped UI or exactly one non-zero `vaultAddresses` entry for single-Vault UI without a factory. |
| `vaultAddresses` | Required without factory | In no-factory mode, provide exactly one Vault address as `match.bindings[].vaultAddresses: ["0x..."]`. In factory mode this list is optional. |
| `tokenAddresses` | Optional | Use only inside each `match.bindings` entry. In no-factory mode it may contain at most one token CA and participates in matching when a token hint is available. |
| `externalContracts` | Optional | Use only when a binding needs a fixed non-token/non-Vault/non-factory contract target. Each entry is `{ address, label }` and is review-only. |
| `locales` | Yes | Example: `en,zh` or `zh`. Check validates only declared locales. |
| `VaultABI` | Yes | Minimal Vault ABI fragments used by the component. Do not include standard ERC20 here. |
| `uiWorkflow` | Yes | Primary reads, primary writes, approval spender, native value, refetch points, empty states, and risk posture. |
| `actionAvailabilityStage` | Yes | One of `internal-market`, `dex-listed`, `both`, or `read-only`. Use `context.host?.marketPhase` and `isActionAvailableForPhase(...)` for runtime gating. Do not hide available actions because the token is not DEX-listed. |
| `preview addresses` | Recommended | Real `chainId`, `tokenAddress`, `vaultAddress`, and, when available, `factoryAddress` for local preview. |

## Fast New Vault Flow

There are two supported creation paths:

| Path | Use When | Required Commands |
| --- | --- | --- |
| Scaffold-first | The Agent is creating a new package from inputs such as folder name, chain, factory or Vault, and locales. | `yarn vault:scaffold {folder-name} ...` |
| Manifest-first | The Agent already has or generated the four Vault files from a provided manifest. | `yarn vault:register {folder-name}` |

Both paths must end with `yarn vault:check {folder-name}` and `yarn vault:package {folder-name}`. Do not hand-edit `src/vaults/index.ts` unless `vault:register` reports that the index shape cannot be parsed.

Use the scaffold command to avoid folder and manifest mistakes:

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --factory 0x1000000000000000000000000000000000000001 --locales en,zh
```

For a single-Vault UI that has no factory, omit `--factory` and provide one Vault address. Token is optional:

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --vault 0x3000000000000000000000000000000000000003 --token 0x2000000000000000000000000000000000000002 --locales en,zh
```

For a single-language UI:

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --factory 0x1000000000000000000000000000000000000001 --locales zh
```

If a factory-scoped UI needs a reference token CA allowlist, still scaffold the shared UI artifact first. Then add `tokenAddresses` manually under the relevant `match.bindings` entry in `manifest.json`; do not add global `tokenAddresses`, `restrictTokenAddresses`, or `caPolicy`, and do not pass CA flags to factory-mode `vault:scaffold`.

If the UI needs a non-oracle HTTPS endpoint, declare it in `manifest.endpoints` as a single absolute HTTPS URL string without username/password credentials or an array of those strings so `vault:check` can validate it and the Workbench can route it for review. Any direct `fetch(...)` must use a static absolute HTTPS string covered by that declaration. Also add it as an `openItems` entry until Flap review explicitly approves it. The `openItems` entry must include: the endpoint URL, purpose, request/response shape, data sensitivity, why on-chain reads or `sdk.readOracle(...)` are insufficient, and the fallback behavior when the endpoint is unavailable. This repository does not define SLA, approver, or ticket routing for endpoint review; agents must not imply approval just because `manifest.endpoints` validates.

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
- `./VaultABI` as the only local relative import.
- No additional SDK package or SDK-like wrapper beyond the shared `@/src/sdk` and `@/src/ui` surfaces.
- `docs/ui-pattern-snippets.md` to choose section order, metric grids, action panels, transaction states, and empty/error states.
- An explicit action availability stage: `internal-market`, `dex-listed`, `both`, or `read-only`.
- `context.host?.marketPhase` as the stage source of truth. The current template preview host provides this API for local self-test; production Flap host injects equivalent context. Existing tokens with `tokenInfo.status < 2` are `internal-market`; existing tokens with `tokenInfo.status >= 2` are `dex-listed`; missing token info is `unknown`.
- `readTaxVaultHostContext(context.host)` as the normalized public SDK accessor for custom Vault host state. Custom Vault UI in this template targets the tax-token path, so the live runtime fields that matter are `marketPhase`, `isListed`, and host-injected token metadata rather than ad hoc token-type props.
- `isActionAvailableForPhase(stage, context.host?.marketPhase ?? "unknown")` to keep stage-gated buttons consistent.
- `sdk.wallet.isWrongNetwork` and `sdk.wallet.switchChain()` when a write flow depends on the active wallet being on `context.chainId`. Keep the write section visible and render a clear switch-network state instead of attempting the write on the wrong chain.
- `context.tokenImageUrl`, `context.tokenName`, and `context.tokenSymbol` for token header/media data. The template preview shell first asks the same-origin runtime proxy for host presentation data, then falls back to ERC20 `symbol()` / `name()` from the preview `tokenAddress`; mocked image fallback is reserved for the neutral preview fixture only. `tokenAddress` alone is metadata-only in preview; use `marketPhase`, `isListed`, `status`, or `tokenStatusCode` when token lifecycle state matters.
- Contract targets limited to `context.vaultAddress`, `context.tokenAddress`, `context.factoryAddress`, runtime payment/quote/dividend token addresses, token/NFT addresses derived from Vault reads, and declared `match.bindings[].externalContracts`. Do not interact with routers, bridges, aggregators, or unrelated app contracts from a Vault package.
- Fixed extra contract targets declared under `match.bindings[].externalContracts` only when the target is truly required and cannot be represented by runtime token/Vault/factory context.
- The preview shell / production host for the target surface to own token breadcrumb/header, close control, `Vault Information` frame, wallet header, language selector, invalid token fallback, width constraint, and any standard shared summary block already present on the host surface.
- The component to start at the first Vault-specific business section below `Vault Information`.
- `VaultBanner` only when the target host surface truly lacks a standard shared summary/header block. Do not default to a component-owned top banner.

Do not use:

- Direct wallet APIs such as `window.ethereum`.
- `eval`, the `Function` constructor, iframe, script injection, or `dangerouslySetInnerHTML`.
- CommonJS `require(...)`; use static ESM imports only.
- Dynamic imports inside Vault source.
- Direct browser network/media APIs such as `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, or `new Image()`.
- Browser storage, cookie, navigation, Worker, cross-context messaging, clipboard, geolocation, permission, or notification APIs.
- External URLs unless declared as non-oracle `manifest.endpoints` using a single HTTPS URL string without credentials or an array of HTTPS URL strings without credentials.
- Dynamic, relative, HTTP, credentialed, or undeclared `fetch(...)` targets. Direct `fetch(...)` must use a static absolute HTTPS string covered by `manifest.endpoints`.
- Fixed contract targets outside `context.tokenAddress`, `context.vaultAddress`, `context.factoryAddress`, binding-scoped `tokenAddresses`/`vaultAddresses`, or `match.bindings[].externalContracts`.
- Arbitrary off-site navigation. Component-owned links should stay on the current chain explorer only; do not send users to other websites from a Vault package.
- Oracle config in `manifest.json`.
- Actions, media, fallback, id, owner, version, sdkVersion, or contracts in `manifest.json`.
- Undeclared hardcoded transaction target addresses in `Component.tsx`.
- Standard ERC20 ABI fragments in `VaultABI.ts`; use the SDK export unless the token has custom non-standard methods.
- Silent action removal when an action is unavailable. Show the panel with a clear disabled or unavailable state instead.
- Reimplementing token phase detection inside `Component.tsx`; use the host-provided `marketPhase`.
- Fetching private token metadata or token image APIs inside `Component.tsx`; use runtime context values injected by the template preview host / production Flap host.

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

This command first checks npm latest `@flapsdk/vault-runtime` against the local `package.json` version, then verifies that the local git history contains the npm latest package's published `gitHead`. A stale checkout, for example local `0.1.0` when npm latest is `0.1.1`, fails with `template-freshness/npm-outdated`. A checkout with only the version string edited but not the source update fails with `template-freshness/npm-git-head-mismatch`.

The output is JSON and includes:

- `ok`
- `summary`
- `agent.verdict`
- `agent.nextActions`
- `issues`

If `summary.blocking` is greater than zero, fix those issues before doing anything else.
If `manual-review/action-stage-gating` appears, the component has a write path but does not reference `marketPhase` or `isActionAvailableForPhase`. Add explicit stage gating and visible unavailable-state copy before packaging.

When changing the check script or Agent contract itself, also run:

```bash
yarn vault:check:selftest
```

That selftest creates temporary Vault fixtures and verifies the checker still blocks CA policy inside the UI manifest, malformed or credentialed endpoint declarations, endpoint-prefix escapes, hidden host-relative/dynamic/credentialed fetches, CommonJS `require(...)`, symlinks, browser-global escapes, browser storage/navigation/worker/permission APIs, SDK-like package imports, phishing-sensitive external navigation, disallowed contract targets, IPFS-style resources, invalid folder names, and standard ERC20 ABI fragments in `VaultABI.ts`.

When it passes:

```bash
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

Submit only the zip produced by this command. The zip contains format-version `3` `flap-vault-package.json`, which identifies the package as a script-generated Flap Vault UI source package and records required file hashes plus npm latest `@flapsdk/vault-runtime` `gitHead` provenance. Flap Artifact Workbench should reject hand-made zips without this marker or with mismatched hashes.
The package command also enforces the official git freshness gate, so a checkout that is behind or diverged from the configured upstream cannot produce a source zip.
The verify command checks the same source package from the Workbench side: marker, kind/version, exact file list, metadata, and SHA-256 hashes. If it fails, read the JSON `code`, `fixHint`, and `agent.nextActions`, then regenerate the package instead of editing the zip by hand.

If you changed shared runtime surfaces such as `src/sdk/*`, `src/ui/*`, the runtime proxy, or the host-runtime package boundary, also run:

```bash
yarn runtime:package
yarn runtime:verify-package
```

That proves the shared runtime surface is still packable for Workbench / host reuse and that the generated `runtime-contract.json` stays in sync.
`yarn build` and `yarn runtime:package` also run the npm latest version gate before producing local build outputs.

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

Preview/runtime binding resolution is conservative. Prefer an exact `chainId + factoryAddress` match for factory-scoped UI, or `chainId + vaultAddress` plus optional `tokenAddress` for no-factory UI. A partial hint such as `chainId` alone is only used when it resolves to one unambiguous binding. The first manifest binding is only a local-preview default when the route provides no runtime hints at all. When the preview host can read live token/Vault factory or Vault data from chain, the active runtime target must match `manifest.match.bindings`; mismatched targets make the preview token unavailable and the Vault component does not render.

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

`example`, `dex-listed-example`, and `action-gallery-example` use no-factory neutral bindings with the preview Vault and token, so their routes render without inventing fake factory addresses. Those three routes are workflow fixtures only. `community-buyback-example` and `flapixel-example` instead default to reviewed live BNB token/factory/Vault bindings so a developer can verify the real host/runtime flow without typing URL params. Do not treat any example as a factory, token, Vault, or project endorsement. For local testing with a different reviewed Store factory or fixed Vault, pass real runtime values through URL params instead of committing additional addresses into a public template fixture.

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
- `yarn vault:package {folder-name}` succeeds and prints the package path.
- `yarn vault:verify-package dist/{folder-name}.zip` succeeds.
- The zip contains the script-generated `flap-vault-package.json` marker.
- The folder name is registered and previewable at `/{folder-name}`.
- All user-facing copy used by `Component.tsx` exists in every locale declared by `manifest.i18n`.
- The component uses runtime context addresses for reads and writes.
- Stage-gated actions were previewed with both `marketPhase=internal-market` and `marketPhase=dex-listed`, and unavailable buttons remain visible with clear copy.
- Any write-capable flow was also previewed in a wrong-network state, and the component rendered a clear switch-network path instead of attempting the write.

## Done Report

After `vault:verify-package` succeeds, produce a structured handoff summary for the user. The required fields are defined in `agent-contract.json` under `doneReport`. Include at minimum:

- `folderName` and `artifactId`
- `sourcePackagePath` and `sha256` from `vault:package` output
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
