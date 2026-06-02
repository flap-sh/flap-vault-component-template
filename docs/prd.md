# Flap Vault UI Template PRD

## Goal

Provide a public source template for controlled Flap custom Vault UI packages.

The template should make the developer workflow small and predictable:

1. Edit only the Vault package files.
2. Preview the result in a Flap-like runtime shell.
3. Run the same checks that the Flap Artifact Workbench expects.
4. Package a source zip for the Flap Artifact Workbench.

For AI agents, the repository should also expose a stable machine-readable contract, a deterministic scaffold command, and JSON check output with fix-oriented next actions.

This repository is not a free-form website builder and does not publish runtime JavaScript directly.

## Current Product Scope

### Vault Package Boundary

Each Vault UI package lives under:

```plain text
src/vaults/{folder-name}/
```

The Vault folder name is the local source folder and preview route. It must be 3-64 characters of lowercase kebab-case, for example `flap-nft-vault`. It is not the artifact identity.

The folder may contain only:

```plain text
Component.tsx
manifest.json
VaultABI.ts
i18n.json
```

No helpers, nested components, local assets, local docs, sample data, or extra folders are allowed inside the Vault package.

### Shell vs Vault Boundary

The submitted Vault package is the business UI only. It does not own the preview shell or host shell chrome.

Shell-owned UI:

- Flap header and wallet connect
- token breadcrumb, image, symbol/name, CA, copy button, explorer link
- close control
- `Vault Information` heading/frame
- width constraint and invalid-token fallback
- any standard shared summary/header block already rendered by the target host surface

Vault-owned UI:

- status panels
- action panels
- runtime detail panels
- business-specific metrics, notices, and transaction feedback below the shell-owned frame

Agents should start `Component.tsx` at the first Vault-specific business section below `Vault Information`. Do not duplicate shell-owned header/shell chrome or add a component-owned top summary/hero block when the target host already provides a standard summary/header area.

### Developer-Facing Manifest

`manifest.json` is intentionally minimal. It is not an internal Flap runtime registry.

Allowed fields:

- `artifactId`
- `name`
- `match`
- `i18n`
- `endpoints`

Disallowed developer fields:

- `id`
- `owner`
- `version`
- `sdkVersion`
- `actions`
- `oracles`
- `media`
- `fallback`
- `contracts`

`artifactId` is the stable unique identity for the source package/artifact family. It uses:

```plain text
vaultui_<folder-name>_<26-char ULID>
```

`vault:scaffold` generates it by default, and `vault:check` validates its format, the embedded folder-name segment, and uniqueness across `src/vaults/*/manifest.json`.

Vault matching intent is captured by explicit chain/factory pairs:

```json
"match": {
  "bindings": [
    { "chainId": 56, "factoryAddress": "0xMainnet..." },
    { "chainId": 97, "factoryAddress": "0xTestnet..." }
  ]
}
```

`match.bindings` is a non-empty array where each entry declares one explicit runtime target: `(chainId, factoryAddress)` for factory-scoped UI, `(chainId, vaultAddress)` for Vault-scoped UI without a factory, or `(chainId, tokenAddress)` for token-scoped UI without a factory. The same UI logic can target multiple chains, factories, fixed Vaults, or token CAs by adding entries or token lists.

In factory mode, the Vault address can be runtime-derived. In no-factory mode, `match.bindings[].vaultAddresses` is optional unless the binding is Vault-scoped; if provided without factoryAddress it must contain exactly one non-zero Vault address. `tokenAddresses` may be used as the no-factory token-scoped target and may contain multiple token addresses. If a deployment needs a fixed non-token/non-Vault/non-factory contract target, it is declared only as `match.bindings[].externalContracts` with `address` and `label`. This `match` block is not the local route and does not auto-publish anything; it is a developer-facing binding declaration for deployment targets.

### i18n Policy

`manifest.i18n` controls validation.

If the manifest declares `["en", "zh"]`, both locales must exist in `i18n.json`, and keys must match across both.

If the manifest declares only `["zh"]`, only `zh` is checked. The template must not force English when the manifest does not declare it.

All user-facing Vault component copy belongs in `i18n.json`.

### Preview Experience

Preview is a template/runtime shell, not part of the final Vault UI package.

Implemented routes:

- `/example`
- `/dex-listed-example`
- `/action-gallery-example`
- `/community-buyback-example`
- `/flapixel-example`
- `/{folder-name}`

The preview shell provides:

- Flap-style navbar
- wallet connection and chain switching
- language selector
- token/Vault frame
- neutral preview token/Vault defaults when URL params are absent
- invalid token state
- taxinfo/feeinfo host context simulation through URL params
- current manifest display panel

The manifest panel is a review aid only. It shows the currently loaded manifest on the page and must not be included in the packaged Vault source as component UI.
The same rule applies to the preview shell header and frame. Preview shell UI helps developers test the Vault body, but it is not part of the packaged Vault artifact.

### SDK Surface

Vault components should use:

- `@/src/sdk` for runtime context, contract reads/writes, simulation, oracle reads, notifications, i18n, formatting, and tx errors
- `@/src/ui` for shared UI primitives
- `./VaultABI` as the only local relative import

Vault components must not use direct wallet APIs, iframe, eval, script injection, runtime remote imports, host app private imports, or undeclared endpoints/resources.

### AI Agent Workflow

Agents should use `docs/ai-agent.md` as the human-readable entry point and `agent-contract.json` as the machine-readable contract.

For new Vault packages, agents should run:

```bash
yarn vault:scaffold <folder-name> --name "My Vault UI" --chain 56 --factory 0x...
```

The scaffold command creates the strict four-file package and registers the folder name in `src/vaults/index.ts`.

If an Agent generated the four Vault files from an existing manifest without running scaffold, it must run:

```bash
yarn vault:register <folder-name>
```

This command adds the local preview module mapping in `src/vaults/index.ts`. It is not a production publish or deployment-binding step and is not packaged into the source zip.

`yarn vault:check <folder-name>` must return machine-readable JSON with:

- `ok`
- `summary`
- `agent.verdict`
- `agent.nextActions`
- `issues`

The Agent workflow is not complete until blocking issues are zero and `yarn vault:package <folder-name>` succeeds.

### Oracle And Endpoint Policy

Oracle config is not declared in `manifest.json`.

If component code calls `sdk.readOracle("id")`, `vault:check` reports the oracle id as an info item for Flap review/provisioning. The Flap Artifact Workbench/runtime owns endpoint and signing policy.

Non-oracle external endpoints and fixed extra contract targets are discouraged. If unavoidable, endpoints may be declared in `manifest.endpoints`, and fixed extra contract targets may be declared in `match.bindings[].externalContracts`; declaration only makes them reviewable and does not guarantee approval.
Endpoint declarations must be a single HTTPS URL string without username/password credentials or an array of those strings. Direct `fetch(...)` must use a static absolute HTTPS target covered by that declaration. Host-relative, dynamic, HTTP, credentialed, undeclared, aliased, destructured, or computed browser-global fetch targets are blocked. WebSocket URLs, IPFS/Arweave links, embedded data URL media, CommonJS `require(...)`, symlinks, browser storage/navigation/worker/permission APIs, and direct browser network/media APIs are blocked inside Vault source by default so the template does not package code that the Workbench intake will reject.

### Packaging

`yarn vault:package <folder-name>` runs `vault:check` first and writes a source zip under `dist/`.

The package output includes:

- `file`
- `sourcePackagePath`
- `sourcePackageAbsolutePath`
- `packageKind`
- `packageFormatVersion`
- `packageMarkerFile`
- `runtimePackageGitHead`
- `sha256`
- `bytes`

The source zip is for the Flap Artifact Workbench. Runtime `component.mjs` is built by the Flap Artifact Workbench, not by project developers.

The source zip must include `flap-vault-package.json`, generated by `yarn vault:package <folder-name>`. Workbench validation should reject any manually assembled zip that is missing the marker, has a wrong package kind/version, lacks the runtime npm `gitHead` provenance, has an unexpected file list, or has mismatched SHA-256 hashes.

The template also provides a local Workbench-side verifier:

```bash
yarn vault:verify-package dist/<folder-name>.zip
```

It validates the package marker, package kind/version, runtime npm `gitHead` provenance, exact file list, metadata consistency, schema entry, and SHA-256 hashes. It is a local acceptance proxy; the Flap Artifact Workbench still owns production validation and review.

## Implemented Acceptance Criteria

| Area | Status | Evidence |
| --- | --- | --- |
| Fixed Vault package file set | Done | `vault:check` blocks files outside `Component.tsx`, `manifest.json`, `VaultABI.ts`, `i18n.json`. |
| Folder route boundary | Done | `vault:check` requires 3-64 character lowercase kebab-case folder names for source folders and preview routes. |
| Artifact identity | Done | `artifactId` is required, follows `vaultui_<folder-name>_<ULID>`, matches the Vault folder name, and is unique across Vault manifests. |
| Minimal manifest | Done | Schema and check script allow only developer-facing fields. |
| CA policy boundary | Done | `vault:check` blocks global `restrictTokenAddresses`, global `tokenAddresses`, and `caPolicy`, while allowing optional per-binding `match.bindings[].tokenAddresses` as a reference-only list. |
| External contract declaration boundary | Done | `vault:check` blocks fixed SDK contract targets outside runtime token/Vault/factory addresses, binding-scoped token/Vault references, or `match.bindings[].externalContracts`. |
| Type-field binding ban | Done | Recursive manifest scan blocks `vaultType` / `vaultTypes` binding fields. |
| Dynamic locale validation | Done | Checks follow `manifest.i18n`; single-locale manifests are valid. |
| Oracle review surface | Done | `sdk.readOracle(...)` usage is reported by `vault:check`; oracle config is not in manifest. |
| Non-oracle endpoint declaration | Done | HTTPS endpoint declarations are review warnings; undeclared URLs are blocking. |
| Preview shell | Done | `/example` and `/{folder-name}` render via `VaultPreviewClient`. |
| Shell-owned header boundary | Done | Preview shell owns token header, close control, `Vault Information` frame, width, invalid-token fallback, and manifest panel; packaged Vault source is limited to business UI below that frame. |
| Second example Vault | Done | `src/vaults/dex-listed-example` is a strict four-file package that demonstrates `dex-listed` stage gating and approve -> write with a no-factory neutral Vault binding. |
| Multi-action example Vault | Done | `src/vaults/action-gallery-example` is a strict four-file package that demonstrates internal-market, DEX-listed, both-stage, and read-only action controls. |
| Manifest display panel | Done | Current manifest is shown by the preview shell and homepage, outside Vault package source. |
| Public-safe UI pattern snippets | Done | `docs/ui-pattern-snippets.md` provides sanitized layout, read/write, claim, quote, NFT/inventory, distribution, lending, prize/staking, submission/gallery, countdown, oracle, schema, risk, and error-state snippets without private names, addresses, endpoints, or copied private source. |
| Custom Vault action-stage rule | Done | Agent docs require each action UI to state `internal-market`, `dex-listed`, `both`, or `read-only`, and to show unavailable actions with clear disabled states instead of silently hiding them. |
| Market phase runtime capability | Done | SDK exposes `context.host.marketPhase`, `resolveTokenMarketPhase`, and `isActionAvailableForPhase`; the preview panel provides a local phase self-test API and URL params support `marketPhase=internal-market` / `marketPhase=dex-listed`. |
| Wrong-network wallet capability | Done | SDK exposes `sdk.wallet.isWrongNetwork`, `requiredChainId`, `requiredChainLabel`, `canSwitchChain`, `isSwitchingChain`, and `switchChain()` so write-capable Vault UIs can render a switch-network path before attempting writes. |
| Token image preview capability | Done | Preview shell first asks the same-origin runtime proxy for host-owned token presentation data, then falls back to ERC20 `symbol()` / `name()` from `tokenAddress`; `/logo.png` is reserved for the neutral preview fixture only. |
| Source package output path | Done | `vault:package` prints relative and absolute zip paths. |
| Script-generated package marker | Done | `vault:package` writes `flap-vault-package.json`, npm `gitHead` provenance, and file hashes for Workbench rejection of manual zips. |
| Workbench-side package verifier | Done | `yarn vault:verify-package <zip>` checks marker, package kind/version, runtime npm provenance, exact file list, metadata, and hashes. |
| Runtime artifact boundary | Done | Docs state that the Flap Artifact Workbench builds runtime JS. |
| AI Agent entrypoint | Done | `docs/ai-agent.md` and `agent-contract.json` define the stable Agent workflow. |
| Common Agent entrypoint adapters | Done | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.windsurfrules`, `.github/copilot-instructions.md`, `.cursor/rules/flap-vault-ui.mdc`, `.cursorrules`, and `docs/agent-entrypoints.md` route common agents to the same source-of-truth contract. |
| Scaffold command | Done | `yarn vault:scaffold` creates the four-file package and registers the folder name. |
| Preview registration command | Done | `yarn vault:register` registers manifest-first or already-generated packages for local preview without hand-editing `src/vaults/index.ts`. |
| Agent-oriented check output | Done | `vault:check` emits `ok`, `agent.verdict`, and fix-focused `agent.nextActions`. |
| Action-stage checker warning | Done | `vault:check` warns when a component has a write path but no `marketPhase` / `isActionAvailableForPhase` usage. |
| Agent-oriented CLI errors | Done | `vault:scaffold`, `vault:register`, and `vault:package` failures emit JSON with `code`, `fixHint`, and `agent.nextActions`. |
| Checker regression selftest | Done | `yarn vault:check:selftest` verifies critical blocking rules for invalid folder names, CA policy, duplicate bindings and duplicate binding-scoped addresses, external contract declarations and undeclared fixed contract targets, malformed/credentialed endpoint declarations, endpoint-prefix escapes, hidden relative/dynamic/credentialed fetches, symlinks, CommonJS `require(...)`, browser-global escapes, browser storage/navigation/worker/permission APIs, IPFS-style resources, dynamic imports, ERC20 ABI drift, registration formatting, unregister, and scaffold/check/package/verify positive flow. |
| CI validation gate | Done | `.github/workflows/ci.yml` runs `yarn ci` on pull requests and pushes to `main`. |
| Preview route/API smoke | Done | `yarn preview:smoke` starts the built app and checks `/example`, `/dex-listed-example`, and `/action-gallery-example`. `yarn preview:smoke:real` covers `/community-buyback-example` and `/flapixel-example`, validates their host-presentation proxy responses, and is part of the default `yarn ci` regression spine. |
| Generated package hygiene | Done | `dist/` is ignored by git; source zips are generated by package commands and CI instead of committed. |

## Explicit Non-Goals

- Drag-and-drop UI builder.
- Direct developer upload of runtime `component.mjs`.
- Free-form website pages inside Vault package folders.
- Agent-generated helper modules, assets, docs, or local data files inside Vault package folders.
- Agent-generated preview shell/header chrome or duplicate host summary banners inside Vault package source.
- Developer-declared action registry in `manifest.json`.
- Developer-declared oracle config in `manifest.json`.
- Developer-declared media policy in `manifest.json`.
- Private `flap.sh` business logic or project-specific configuration in the public template.

## Open Follow-Ups

These are not blockers for the current MVP:

- Add a deeper browser/hydration smoke test if this template starts accepting frequent UI shell changes.
- Add a documented Workbench-side build contract once the Flap Artifact Workbench has a stable external artifact API.
- Add future example Vaults only when they teach a workflow not covered by the current built-in fixtures, and only if they stay within the same strict four-file package boundary.
