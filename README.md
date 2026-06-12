# Flap Vault UI Template

[简体中文](./README.zh-CN.md)

## Table of Contents

- [From Zero To Verified Zip](#from-zero-to-verified-zip)
- [Quick Start](#quick-start)
- [AI Agent Entry Point](#ai-agent-entry-point)
- [Add a Vault UI](#add-a-vault-ui)
- [Required Files](#required-files)
- [Safety Rules](#safety-rules)
- [Artifact Model](#artifact-model)
- [Useful Commands](#useful-commands)
- [License](#license)

This repository is a public starter for building private custom Flap Vault UI components.

It is not a free-form website container. A Vault UI component must run inside Flap's controlled runtime boundary:

- Flap SDK for chain, wallet, contract read/write, oracle, i18n, notifications, formatting, and tx errors.
- Flap-owned taxinfo/feeinfo host context for token state, tax info, VaultPortal info, deployment binding, fee mode, and render surface.
- Flap preview shell with real RainbowKit/wagmi wallet connect, chain switching, and Flap language preference behavior.
- Packaged Vault artifacts that contain only the Vault-specific business UI below the host shell/frame; preview shell/header UI stays outside the package.
- Minimal manifest declaration for deployment binding intent, i18n, and unavoidable non-oracle endpoints. Optional per-binding `tokenAddresses` can be carried as reference-only CA allowlists when needed.
- External endpoints and external resources are discouraged. If a non-oracle endpoint is unavoidable, it may be predeclared in the manifest as a single HTTPS URL string without username/password credentials or an array of those strings so `vault:check` can validate it quickly; declaration does not guarantee approval.
- Local preview before submission.
- `vault:check` before packaging.
- AI-agent-friendly contract, scaffold/register commands, and machine-readable check output.
- Private zip handoff to the Flap Artifact Workbench.
- Flap-built remote artifact and runtime deployment binding in production.

## From Zero To Verified Zip

This is the shortest safe path for a developer who wants AI help but still owns the Vault facts and local testing.

1. Prepare real inputs: folder name, display name, `chainId`, factory address or single Vault address, optional token address, minimal Vault ABI, reads, writes, approval spender, action stage, risk posture, and preview addresses.
2. Give those inputs to an AI Agent with this repository context. If the AI cannot read the repo directly, generate a pasteable context pack:

```bash
yarn --silent vault:ai-context action-gallery-example > vault-ai-context.md
```

3. Scaffold the Vault package. Factory-scoped example:

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --factory 0xFactoryAddressRequired --locales en,zh
```

Single-Vault example without a factory:

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --vault 0xVaultAddressRequired --token 0xTokenAddressIfNeeded --locales en,zh
```

Replace placeholder addresses with real deployment addresses before running these commands.

4. Edit only the four package files under `src/vaults/my-vault`: `Component.tsx`, `manifest.json`, `VaultABI.ts`, and `i18n.json`.
   Keep the scaffolded default business card structure unless the Vault needs a different pattern. The built-in example routes are behavior references, not the default visual style.
   For icons, use `lucide-react` first and choose icons from the official Lucide icon library: `https://lucide.dev/icons/`.
5. Preview the route and test the actual workflow:

```plain text
http://localhost:3000/my-vault?chainId=56&factoryAddress=0x...&tokenAddress=0x...&vaultAddress=0x...
```

6. Package only after validation passes:

```bash
yarn vault:check my-vault
yarn vault:package my-vault
yarn vault:verify-package dist/my-vault.zip
```

The deliverable is the zip produced by `yarn vault:package <folder-name>`, plus the package output fields such as `sourcePackagePath` and `sha256`. A prompt-only result, a hand-made zip, or an untested AI output is not ready for Flap Artifact Workbench intake.

For a slower step-by-step walkthrough, use [docs/from-zero-vault-ui.md](./docs/from-zero-vault-ui.md).

## Quick Start

```bash
yarn
yarn dev
```

The template is runnable without any local env file. It already includes defaults for:

- Wallet preview Project ID
- BNB mainnet/testnet RPC fallback list
- Host presentation proxy target
- Chain explorer base URL

The shared default Reown/WalletConnect Project ID for quick preview is:

```plain text
0f5b4547ebf94f1fe8e524147e630fd9
```

If wallet connection fails or rate-limits during testing, create your own Reown/WalletConnect test Project ID from `https://dashboard.reown.com` and override it in `.env.local`:

```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_reown_project_id_here
```

For BNB Chain preview reads, the template already overrides wagmi's default BSC transport and uses official BNB Chain fallback endpoints. Only if your local network still needs a custom RPC should you override it in `.env.local`:

```bash
NEXT_PUBLIC_BSC_RPC_URL=https://your-bsc-rpc.example,https://your-bsc-rpc-backup.example
NEXT_PUBLIC_BSC_TESTNET_RPC_URL=https://your-bsc-testnet-rpc.example,https://your-bsc-testnet-rpc-backup.example
```

`.env.local` is optional override-only config. Do not commit it.

Open:

```plain text
http://localhost:3000/example
http://localhost:3000/dex-listed-example
http://localhost:3000/action-gallery-example
http://localhost:3000/community-buyback-example
http://localhost:3000/flapixel-example
```

Built-in examples:

- `example`: reward/oracle pattern with approve, simulate, write, claim, and refetch.
- `dex-listed-example`: listed-only stage gate using `context.host.marketPhase`, with the action visible but disabled before DEX listing, followed by approve -> write.
- `action-gallery-example`: richer button gallery that shows internal-market, DEX-listed, both-stage, and read-only action states in one Vault.
- `community-buyback-example`: live CA Store example bound to a real Community Approved Buyback token/factory on BNB.
- `flapixel-example`: live CA Store example bound to a real FLAPixel NFT vault token/factory on BNB.

`example`, `dex-listed-example`, and `action-gallery-example` use no-factory neutral bindings: `chainId + vaultAddress` plus the neutral preview token. Those three routes keep stable fixture data for packaging smoke without inventing a fake factory. `community-buyback-example` and `flapixel-example` are different: they default to reviewed live BNB token/factory/Vault bindings so developers can test against a real host/runtime path without typing query params. `yarn preview:smoke:real` now checks both routes plus their host-presentation proxy responses, and `yarn ci` runs that live regression as part of the default validation spine. For local testing against another reviewed CA Store / Store factory, pass real runtime values through preview URL params such as `chainId`, `factoryAddress`, `tokenAddress`, and `vaultAddress`; for no-factory testing, pass `chainId`, `vaultAddress`, and optional `tokenAddress` without `factoryAddress`. On supported preview chains, the shell then reads the real Portal `getTokenV7` state and, when available, the tax helper / VaultPortal state for that token. Manual `marketPhase` / `isListed` params remain explicit overrides for UI QA, not the default source of truth. In the preview panel, `Real` restores the live host phase while `Internal` and `Listing` apply temporary overrides; `unknown` can still appear in runtime readout when host data is missing, but it is no longer a primary phase tab.

After registering another Vault folder name in `src/vaults/index.ts`, preview it with:

```plain text
http://localhost:3000/{folder-name}
```

Use the header language selector to test both English and Chinese. The preview uses the same preference keys as `flap.sh`: `flap:language` in localStorage and `flap_language` in cookies. The selected language is passed into the Vault SDK, so `sdk.i18n.t(...)` should update immediately in the component.
The preview shell header, token frame, and manifest panel are not packaged into the Vault artifact. Implement Vault-specific business sections below `Vault Information`, and do not duplicate a host-provided top summary/header block inside `Component.tsx`.

Run preflight:

```bash
yarn vault:check example
yarn vault:check dex-listed-example
yarn vault:check action-gallery-example
yarn vault:check community-buyback-example
yarn vault:check flapixel-example
```

`vault:check` first compares the local `package.json` version with npm latest `@flapsdk/vault-runtime`, then verifies that the local git history contains the npm latest package's published `gitHead`. If the checkout is older, for example local `0.1.0` while npm latest is `0.1.1`, the command fails with `template-freshness/npm-outdated`. If someone only edits the local version string without updating the source, it fails with `template-freshness/npm-git-head-mismatch`.

Package:

```bash
yarn vault:package example
yarn vault:verify-package dist/example.zip
yarn vault:package dex-listed-example
yarn vault:verify-package dist/dex-listed-example.zip
yarn vault:package action-gallery-example
yarn vault:verify-package dist/action-gallery-example.zip
yarn vault:package community-buyback-example
yarn vault:verify-package dist/community-buyback-example.zip
yarn vault:package flapixel-example
yarn vault:verify-package dist/flapixel-example.zip
```

The package command runs `vault:check` first and also enforces the official git freshness check before writing a zip. The zip is created under `dist/` only after blocking issues pass.
The command output includes `sourcePackagePath` and `sourcePackageAbsolutePath` so the generated zip location is explicit.
Submit only the zip produced by `yarn vault:package <folder-name>`. The package script writes a format-version `3` `flap-vault-package.json` marker, npm latest `@flapsdk/vault-runtime` `gitHead` provenance, and file hashes into the zip; Flap Artifact Workbench should reject manually assembled zips without this marker or with mismatched hashes.
`dist/` is ignored by git. Generate source zips locally or in CI; do not commit generated packages to the template repo.
`yarn vault:verify-package <zip>` validates the package from the Workbench side by checking the marker, file list, metadata, and SHA-256 hashes.
CI-generated zips are uploaded as short-lived GitHub Actions artifacts for validation evidence only. They are not submitted to Artifact Workbench unless a human or release workflow explicitly hands off a verified zip and records its `sha256`.

## AI Agent Entry Point

Agents should read:

```plain text
agent-contract.json
AGENTS.md
docs/ai-agent.md
docs/agent-entrypoints.md
docs/ui-pattern-snippets.md
skills/flap-vault-ui-generator/SKILL.md
```

For web-based AI tools that cannot read this repo directly, use the copy-pack guide:

```plain text
docs/ai-copy-pack.md
```

Fast path:

```bash
yarn --silent vault:ai-context action-gallery-example > vault-ai-context.md
```

Paste the generated Markdown into ChatGPT, Claude, or another AI assistant before asking it to create a Vault UI. If you are unsure which example to use, start with `action-gallery-example`; it shows internal-market, DEX-listed, both-stage, and read-only action states in one package.

Tool-specific entry points are included for common coding agents:

- Codex and AGENTS-aware agents: `AGENTS.md`
- Claude Code: `CLAUDE.md`
- Gemini CLI: `GEMINI.md`
- Windsurf: `.windsurfrules`
- GitHub Copilot: `.github/copilot-instructions.md`
- Cursor: `.cursor/rules/flap-vault-ui.mdc`
- Legacy Cursor fallback: `.cursorrules`

These files are compatibility wrappers. The canonical workflow remains in `agent-contract.json`, `AGENTS.md`, `docs/ai-agent.md`, `docs/agent-entrypoints.md`, `docs/ui-pattern-snippets.md`, and `skills/flap-vault-ui-generator/SKILL.md`.

Before starting a new Vault, agents should collect all required inputs using the structured intake guide:

```plain text
docs/agent-intake-template.md
```

The full input schema is also machine-readable in `agent-contract.json` under `requiredInputs`.

For a new Vault UI, prefer the scaffold command:

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --factory 0xFactoryAddressRequired --locales en,zh
```

For a UI without a factory, scaffold from one Vault address and optionally one token address:

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --vault 0xVaultAddressRequired --token 0xTokenAddressIfNeeded --locales en,zh
```

Replace placeholder addresses with real deployment addresses before running the command. `vault:check` blocks malformed, zero, and reserved template placeholder binding addresses so a source package with a fake factory or Vault cannot enter Workbench publish by accident.

This creates the strict four-file Vault package, generates a stable `artifactId`, and registers the folder name in `src/vaults/index.ts`. If Flap review supplies extra no-factory token restrictions, keep them as `tokenAddresses` inside `match.bindings[]`; Flap review/runtime owns the final publish routing. It does not implement business logic for the Agent; it gives the Agent a valid, previewable starting point.

If the four Vault files already exist because they were generated from a manifest first, register only the local preview mapping:

```bash
yarn vault:register my-vault
```

This writes the static module entry used by local preview. It is not production publish registration and is not included in the source package zip.

Folder name and `artifactId` have different jobs:

- Folder name is the source directory and preview route, for example `src/vaults/flap-nft-vault` and `/flap-nft-vault`.
- `artifactId` is the unique artifact identity, generated as `vaultui_<folder-name>_<ULID>`, for example `vaultui_flap-nft-vault_01HZY7J4S9D0W5XJ8H2Q3K4M5N`.
- `match` stays in `manifest.json` as the intended deployment binding input. It is not the local route and does not make a package auto-publish.

Folder naming is strict lowercase kebab-case: 3-64 characters, letters/numbers separated by single hyphens. Do not use spaces, underscores, uppercase letters, leading/trailing hyphens, or nested folders.

`yarn vault:check <folder-name>` prints JSON with `ok`, `summary`, `agent.verdict`, `agent.nextActions`, and `issues`. Treat any blocking issue as unfinished work.
All Vault CLI failures are also JSON. Read `code`, `fixHint`, and `agent.nextActions`; fix those items before rerunning the command.
For UI style consistency, use `docs/ui-pattern-snippets.md` as the public-safe reference for layout, action panels, read/write flows, and empty/error states. It contains sanitized patterns only, not private Flap source code.
For icons, use `lucide-react` first and search the official Lucide icon library before hand-writing SVG: `https://lucide.dev/icons/` (main site: `https://lucide.dev/`).
Every custom Vault UI with actions must also decide whether actions are available in internal-market, DEX-listed, both, or read-only stage. Use `context.host?.marketPhase` and `isActionAvailableForPhase(...)` for runtime gating, then show unavailable actions with clear disabled states instead of silently hiding them. The current template preview panel provides this phase API for local self-test: `Real` restores the live host phase while `Internal` and `Listing` override it locally. Production Flap host injects equivalent context.
Wrong-network gating is a separate concern from market-phase gating. Use `sdk.wallet.isWrongNetwork` to detect it, keep the action visible, and either prompt `sdk.wallet.switchChain()` or show a clear switch-network state before any write.
Token media follows the same host-context rule: use `context.tokenImageUrl`, `context.tokenName`, and `context.tokenSymbol`. In local preview, the host first calls the same-origin runtime proxy for token presentation data, then falls back to on-chain ERC20 `symbol()` / `name()` if host presentation is unavailable. The mocked `/logo.png` image is reserved for the neutral preview fixture only. `tokenAddress` by itself does not imply a listed token or a non-unknown market phase; use `marketPhase`, `isListed`, `status`, or `tokenStatusCode` when lifecycle state matters. Vault components should not call private token metadata APIs directly.
The same shell boundary applies to layout: token breadcrumb/header, close control, page frame, and any standard shared summary/header belong to the host surface, not the packaged Vault component.
If you change the checker or Agent contract, run `yarn vault:check:selftest` as a regression guard for the most important blocking rules.
For full code-base validation, run `yarn ci`. CI runs lint, typecheck, checker selftest, built-in example check/package/verify, Next build, shared runtime pack/verify, the neutral preview smoke test, and the live real-example smoke test.

## Add a Vault UI

Recommended (single chain):

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --factory 0xFactoryAddressRequired
```

For mainnet + testnet (repeat `--chain` / `--factory` per target):

```bash
yarn vault:scaffold my-vault --name "My Vault UI" \
  --chain 56 --factory 0xMainnetFactory \
  --chain 97 --factory 0xTestnetFactory
```

For no-factory mode, repeat `--chain` / `--vault` per target. `--token` is optional, but when provided it must also be paired one-for-one:

```bash
yarn vault:scaffold my-vault --name "My Vault UI" \
  --chain 56 --vault 0xMainnetVault --token 0xMainnetToken \
  --chain 97 --vault 0xTestnetVault --token 0xTestnetToken
```

Manual package shape:

```plain text
src/vaults/{folder-name}/
  Component.tsx
  manifest.json
  VaultABI.ts
  i18n.json
```

Then run `yarn vault:register <folder-name>` if the package was not created by `vault:scaffold`. The register command updates `src/vaults/index.ts` so `/{folder-name}` can load the component during local preview.

Local preview uses the real wallet/runtime path with safe default preview addresses, so a registered route should render without hand-written query params. Pass real addresses through the preview URL when needed, for example `?chainId=56&factoryAddress=0x...&tokenAddress=0x...&vaultAddress=0x...` or no-factory `?chainId=56&vaultAddress=0x...&tokenAddress=0x...`. Binding resolution is conservative: preview/runtime prefers an exact `chainId + factoryAddress` match for factory mode, or exact `chainId + vaultAddress` plus optional `tokenAddress` for no-factory mode. It falls back to partial hints only when unambiguous, and uses the first manifest binding only when the route provides no runtime hints at all. On supported preview chains, `chainId + tokenAddress` triggers real chain reads for `Portal.getTokenV7` and, when the chain exposes them, the tax helper and VaultPortal reads used to populate `context.host`. Local preview also calls the same-origin `/api/runtime/token-presentation` proxy so `full-host` mode can fill host-owned token image/name/symbol data without exposing protected backend headers in the browser. Use the right-side "Token phase self-test" panel or URL params such as `marketPhase`, `isListed`, `status`, `tokenStatusCode`, `marketBps`, `feeMode`, `vaultType`, and `renderSurface` only when you intentionally want to override that host state for isolated UI QA. The panel now uses `Real` to restore the live host phase and `Internal` / `Listing` as explicit override buttons. `taxInfo=1` is now just a seed for neutral fixture routes or unsupported chains. The shell header still reads ERC20 `symbol()` / `name()` from `tokenAddress` automatically when host presentation is unavailable, and only the neutral preview fixture uses `/logo.png` as a mocked token image. Do not add auxiliary files to the template.

The local runtime proxy forwards to `FLAP_RUNTIME_HOST_ORIGIN` when that env var is set; otherwise it defaults to `https://flap.sh`.

The file set is fixed. Do not add `helpers`, nested components, folders, assets, docs, or any other files under `src/vaults/{folder-name}`.

Use `example` as the reward/oracle reference, `dex-listed-example` as the DEX-listed stage-gate plus approve/write reference, `action-gallery-example` as the richer multi-button action-state reference, `community-buyback-example` as the live governance/buyback reference, and `flapixel-example` as the live NFT vault reference.

The current product requirements and implementation status are tracked in `docs/prd.md`.
Versioning rules for the Agent contract, manifest schema, and source package format are tracked in `docs/versioning.md`.

## Required Files

The Vault folder is a strict source package boundary. It may contain only:

- `Component.tsx`: the controlled React Vault UI component.
- `manifest.json`: required `artifactId`; required `match.bindings` — explicit factory-scoped `{chainId, factoryAddress}` or no-factory `{chainId, vaultAddresses: [vaultAddress]}` targets; optional per-binding `tokenAddresses`; optional non-oracle `endpoints`; optional reviewed `externalFrames`; and `i18n`.
- `VaultABI.ts`: minimal Vault ABI fragments only. Standard ERC20 ABI is exported from `@/src/sdk`; add token ABI fragments here only for custom non-standard token methods.
- `i18n.json`: locale dictionaries declared by `manifest.i18n`; manifest locale strings must be at least two characters.

Any other file or subfolder under `src/vaults/{folder-name}` is a blocking check issue.

## Safety Rules

Blocking by default:

- `window.ethereum.request`
- `eval` / `new Function`
- raw iframe UI or iframe `srcDoc`; the single reviewed display-only chart frame must use `manifest.externalFrames` plus one `ReviewedFrame`
- script injection, including `document.write` and `document.writeln`
- runtime remote imports
- dynamic imports and CommonJS `require(...)`
- undeclared external URLs, endpoints, external frames, or external resources
- dynamic, relative, HTTP, credentialed, aliased, destructured, or computed browser-global `fetch(...)` targets
- browser storage, navigation, worker, cross-context messaging including postMessage listeners, and permission APIs
- direct browser network/media APIs such as `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, or `new Image()`
- arbitrary off-site navigation or phishing-sensitive external jumps
- hidden transaction targets
- unapproved dependencies
- additional SDK packages or SDK-like wrappers outside the shared runtime surface
- missing locales declared by `manifest.i18n`
- i18n keys missing from any locale declared by `manifest.i18n`
- remote images inside Vault source
- contract reads/writes, event watches, log/filter calls, or gas estimates to routers, bridges, aggregators, or unrelated contracts outside the Vault/token/NFT/factory/declaration boundary
- binding by type field instead of registry-controlled chain/factory or chain/Vault targets
- extra files, folders, or symlinks inside the Vault package
- relative imports other than `./VaultABI`

External endpoints, oracle usage, third-party images, extra fixed contract targets, and other external resources should be avoided when the same result can be achieved through Flap SDK capabilities or on-chain reads. Non-oracle endpoints are declared in `manifest.json`; fixed non-token/non-Vault/non-factory contract targets are declared under `match.bindings[].externalContracts`; oracle config, media policy, actions, fallback, artifact id, and version are Flap Artifact Workbench/runtime concerns. Any undeclared external URL or fixed extra contract target in Vault source is rejected.
Endpoint declarations may be either one HTTPS URL string without username/password credentials or an array of those strings. Direct `fetch(...)` must use a static absolute HTTPS string covered by `manifest.endpoints`. Host-relative, dynamic, HTTP, credentialed, aliased, destructured, or computed browser-global fetch targets are blocked by default, as are IPFS/Arweave links, WebSocket URLs, embedded data URL media, CommonJS `require(...)`, symlinks, browser storage/navigation/worker/permission APIs, and direct browser network/media APIs.
Component-owned navigation should stay on the current chain explorer only. If an NFT metadata base URL or another reviewed non-oracle host must be fetched directly, declare that base URL in `manifest.endpoints`; do not use endpoint declarations as a back door for off-site user navigation. Internal Oracle endpoints should normally stay behind `sdk.readOracle(...)` and host/runtime provisioning rather than raw URL literals in Vault source.

## Artifact Model

The zip produced by this template is not loaded by `flap.sh` directly.

Production flow:

```plain text
private zip
  -> Flap Artifact Workbench validation
  -> Flap build
  -> component.mjs + manifest + i18n + metadata
  -> Flap static artifact storage
  -> Flap deployment binding
  -> flap.sh runtime loader
```

The registry decides usability. A file existing in Blob/R2/S3 does not mean the UI can be rendered.

The package zip is a source package for the Flap Artifact Workbench. The runtime artifact uploaded to Blob/R2/S3 is a Flap-built, browser-executable `component.mjs`. Keep the MVP runtime artifact readable by default; do not minify it unless Flap enables a release optimization step with source maps and source backup.

The source zip must be generated by `yarn vault:package <folder-name>`. This script runs `vault:check`, writes `flap-vault-package.json`, and records package kind, format version, source file hashes, schema hash, and check summary. Workbench validation should require that marker and reject hand-made zips.
Use `yarn vault:verify-package <zip>` to exercise the same package acceptance shape locally before handing the zip to the Flap Artifact Workbench.

The Flap Artifact Workbench uses `artifactId` as the stable source-package artifact identity. The folder name remains the local source folder and preview route. Runtime build versions and storage paths are Workbench concerns; developers still do not declare runtime version in `manifest.json`.

One shared artifact can declare one or more factory-scoped `chainId + factoryAddress` binding entries, one or more no-factory `chainId + vaultAddress` entries, or one or more no-factory `chainId + tokenAddress` entries. In no-factory mode, a binding can be Vault-scoped with exactly one Vault address, token-scoped with one or more token addresses, or Vault + token scoped with one Vault address and multiple token addresses. Declare token CA lists only as `match.bindings[].tokenAddresses`.

Vault source should import shared runtime surfaces through public aliases:

```ts
import { erc20Abi, useFlapSdk } from "@/src/sdk";
import { Button } from "@/src/ui";
import { ShieldCheck } from "lucide-react";
```

Use `lucide-react` as the first choice for icons. Search `https://lucide.dev/icons/` before adding ad hoc inline SVG; the Lucide main site is `https://lucide.dev/`.
Use `erc20Abi` or `standardErc20Abi` from `@/src/sdk` for normal ERC20 `balanceOf`, `allowance`, `approve`, `decimals`, `symbol`, `transfer`, and `transferFrom` flows. Do not copy standard ERC20 ABI into a Vault package.
For ABI methods with multiple return values, type `sdk.readContract` as a tuple array and then map indexes into object-shaped UI state. For example, `returns (uint256 currentPool, uint256 totalReceived)` should use `readonly [currentPool: bigint, totalReceived: bigint]`, not an object interface. A single returned Solidity `tuple` / struct output declared as one ABI output with `components` may still be read as an object.
Do not introduce any additional SDK package or SDK-like wrapper beyond the shared `@/src/sdk` and `@/src/ui` surfaces.

The host resolves taxinfo/feeinfo preflight data before the custom Vault component loads. Use `context.host` or the exported SDK helper `readTaxVaultHostContext(context.host)` for token info, parsed tax info, VaultPortal info, fee mode, render surface, market phase, and registry-selected vault type. Custom Vault UIs in this template target the tax-token path, so the live runtime state that still matters is token lifecycle (`marketPhase` / `isListed`) plus token metadata. Use the public SDK/host for that instead of ad hoc props. For host/runtime integrations, the SDK now exports the whole shared preflight stack: `runHostRuntime(...)`, `loadTokenRuntimeSnapshot(publicClient, chainId, tokenAddress)`, `readErc20TokenMetadata(publicClient, tokenAddress)`, `createVaultRuntimeContext(...)`, and `createLocalHostPresentationFetcher(...)`. Local preview uses the same-origin `/api/runtime/token-presentation` proxy so `full-host` mode can read the same protected presentation data path that production host adapters can provide. Use `context.tokenImageUrl` for host-provided token media. Do not make every submitted Vault UI reimplement Portal/helper reads, backend reads, factory-to-type mapping, token phase detection, token metadata fetches, or fee-mode detection.
Contract interaction should stay on `context.vaultAddress`, `context.tokenAddress`, `context.factoryAddress`, runtime payment/quote/dividend token addresses, token/NFT addresses derived from Vault reads, or fixed targets declared in `match.bindings[].externalContracts`. Do not use a Vault package to talk to unrelated routers, bridges, aggregators, or other app contracts.

The local relative import surface is fixed: `Component.tsx` may import `./VaultABI` only. Do not import `./helpers`, `../VaultABI`, nested components, local assets, or any other local file. Use public aliases such as `@/src/sdk` and `@/src/ui` for shared runtime surfaces.

For the build/runtime boundary, see [docs/runtime-module-contract.md](./docs/runtime-module-contract.md). The intended model is one shared runtime surface for `@/src/sdk` and `@/src/ui` across local preview, Artifact Workbench, and `flap.sh`, rather than separately bundling unrelated SDK/provider copies into every Vault artifact.

The template now also builds a packable shared runtime package under `dist/vault-runtime`:

```bash
yarn runtime:package
yarn runtime:verify-package
```

`yarn build` and `yarn runtime:package` use the same npm latest version gate, so a stale local template cannot produce a local build or shared runtime package that appears current.

That generated package currently exposes:

- `@flapsdk/vault-runtime/sdk`
- `@flapsdk/vault-runtime/ui`
- `@flapsdk/vault-runtime/host`
- `@flapsdk/vault-runtime/server`

along with a machine-readable `runtime-contract.json`. Vault source should still author against `@/src/sdk` and `@/src/ui`; the package exists so Workbench and `flap.sh` can converge on one shared runtime surface underneath those aliases.

The shared runtime package now includes the oracle provisioning path used by preview and future hosts:

- `VaultRuntimeProvider` accepts `oracleReader`
- `createLocalOracleReader()` reads through `/api/runtime/oracle/{oracleId}`
- `@flapsdk/vault-runtime/server` exports the server-side registry helpers for that proxy route

The template preview now carries built-in defaults for the example oracle flow and `bnb-usd-price`, so users do not need to configure env vars just to exercise common `sdk.readOracle(...)` paths. `bnb-usd-price` is display-only BNB/USD data returned as `{ price: number, symbol: string, timestamp: number, source: string }`. If Workbench or `flap.sh` later needs to override oracle ids with reviewed upstream URLs, register them in the host/runtime integration layer rather than pushing that setup burden onto Vault package authors. The same-origin proxy can be configured with `FLAP_RUNTIME_ORACLE_REGISTRY`; each reviewed id may declare a no-secret `endpoint`, `allowedParams`, and `fixedParams` for server-enforced query values such as feed routing. Registry entries cannot include headers or Flap-held upstream tokens.

`dist/vault-runtime` is currently a local packability and contract proof. It is not bundled into source zips and is not automatically consumed by Workbench or `flap.sh` unless that integration is explicitly adopted and version-pinned.

## Useful Commands

```bash
yarn dev
yarn build
yarn lint
yarn typecheck
yarn vault:scaffold example-copy --name "Example Copy UI" --chain 56 --factory 0xFactoryAddressRequired --dry-run
yarn vault:check example
yarn vault:check action-gallery-example
yarn vault:check:selftest
yarn vault:package example
yarn vault:verify-package dist/example.zip
yarn runtime:package
yarn runtime:verify-package
yarn preview:smoke
yarn preview:smoke:real
yarn ci
```

`yarn vault:package <folder-name>` prints the generated source zip path in `sourcePackagePath` and `sourcePackageAbsolutePath`, the package marker in `packageMarkerFile`, and the npm runtime provenance in `runtimePackageGitHead`.

## License

This template is released under the MIT License. See [LICENSE](./LICENSE).
