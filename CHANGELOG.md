# Changelog

This file records breaking and notable changes to the four versioned compatibility surfaces:

- `agent-contract.json` (`version` field) — AI agent workflow contract
- `schemas/manifest.schema.json` — developer-facing manifest schema
- `flap-vault-package.json` format (`PACKAGE_FORMAT_VERSION` in scripts) — source zip acceptance contract
- `dist/vault-runtime/runtime-contract.json` (`runtimeContractVersion`) — shared runtime package extraction contract

See `docs/versioning.md` for the rules that govern when each surface increments.

---

## [Unreleased]

## [0.1.9] - 2026-06-12

### Changed

- Clarified that external oracle providers requiring path templates, response transforms, signing, EVM byte wrapping, or publish-time validation belong in `@flapsdk/vault-runtime/server`, not in Workbench or `flap.sh` host-local adapters.
- Removed runtime oracle header forwarding from `FLAP_RUNTIME_ORACLE_REGISTRY`; registry entries now support only `endpoint`, `allowedParams`, and `fixedParams`, and upstream authentication must be handled by the provider's own no-secret HTTPS relay.

## [0.1.8] - 2026-06-11

### Added

- Added optional `account` forwarding to `sdk.readContract(...)` so Vault components can read `msg.sender`-dependent view functions without falling back to transaction simulation.
- Added `fixedParams` to runtime oracle provisioning so host/runtime integrations can bind server-controlled query params such as `feed` to reviewed oracle ids.
- Documented `FLAP_RUNTIME_ORACLE_REGISTRY` support for reviewed oracle `endpoint`, `allowedParams`, and `fixedParams` provisioning.

### Changed

- Relaxed no-factory manifest bindings so a package can target either one Vault address or one or more token addresses; package metadata now emits one binding key per no-factory token target.
- Runtime oracle forwarding now filters UI params through `allowedParams` and reapplies `fixedParams` so component-provided params cannot override reviewed route/feed values.

### Fixed

- `preview:smoke:real` no longer fails when the live host presentation proxy has no metadata entry for an otherwise renderable example token; missing metadata still exercises the runtime fallback path while route and proxy errors remain blocking.

## [0.1.4] - 2026-06-02

### Added

- Added a built-in display-only `bnb-usd-price` runtime oracle for BNB-to-USD conversion, using the same Binance `avgPrice` primary source and Pyth fallback strategy already used by `beta-multichain`.
- Standardized the built-in `bnb-usd-price` response shape as `{ price: number, symbol: string, timestamp: number, source: string }` so Vault UI source packages can consume it through `sdk.readOracle("bnb-usd-price")` without declaring external endpoints.

### Changed

- `loadRuntimeOracle(...)` now falls back to built-in runtime oracle handlers when `FLAP_RUNTIME_ORACLE_REGISTRY` does not provision the requested oracle id, while still letting host registry entries override built-ins.
- Documented `bnb-usd-price` in the SDK and runtime package notes as a host/runtime-owned display conversion oracle.

## [0.1.3] - 2026-06-02

### Added

- Added source-package support for no-factory single-Vault bindings using `chainId + vaultAddresses[0]` with an optional single `tokenAddresses[0]`.
- Added matching scaffold, package, validation, preview, runtime, prompt, and Agent-doc support for factory-scoped and no-factory Vault UI modes.

### Changed

- Updated neutral example manifests to use no-factory Vault/token fixture bindings instead of fake factory addresses.
- Added token and Vault references to the live example manifests while keeping their real factory bindings.
- Reworked AI intake/prompt copy so agents ask for binding mode first and do not invent factory addresses.
- Bumped `agent-contract.json` to version 8 for the tightened checker safety surface.

### Fixed

- Preview/runtime binding checks now reject explicit factory or Vault mismatches instead of falling back to an unrelated chain-only binding.
- `vault:check` no longer treats `refetchInterval: 5000` as below the 5000ms polling floor.
- URL endpoint/resource scanning now ignores single-line, block, and JSDoc-style comments.
- `vault:check` now blocks `document.write` / `document.writeln` and postMessage event listeners inside Vault source.
- Contract address boundary checks now cover `watchContractEvent`, `createContractEventFilter`, `getLogs`, and `estimateContractGas`.
- Runtime token/Vault address source recognition now includes fee vault, wrapped native, native token, and base token variables while keeping router targets disallowed.
- Risk-status integration checks now accept multiline host risk derivation and boolean missing-risk guards while still requiring host-derived `riskLevel` and visible UI.
- Script locale validation now matches `schemas/manifest.schema.json` by rejecting manifest locale strings shorter than two characters.

## [0.1.2] - 2026-05-31

### Added

- Added `docs/ai-copy-pack.md` for web-based AI tools that cannot read the repository directly, including the required file checklist, first prompt template, follow-up input checklist, and example selection guide.
- Added `yarn vault:ai-context` to generate a pasteable Markdown context pack from the canonical Agent docs plus a selected reference example.

### Changed

- Documented the web AI copy-pack flow from the README and Agent entrypoint docs.
- Added `vault-ai-context.md` to `.gitignore` so generated local context packs are not committed accidentally.

### Fixed

- Replaced `npm view` freshness lookups with direct npm registry metadata requests so `vault:check`, `vault:package`, `build`, and `runtime:package` no longer depend on npm CLI home/cache/log directories.

## [0.1.1] - 2026-05-29

### Added

- Added an MIT `LICENSE` file and package license metadata for public template reuse.
- Added `FLAP_RUNTIME_HOST_ORIGIN` to `.env.example` as the documented runtime host-proxy override.
- Documented the Workbench feedback loop, source package marker schema, endpoint review handoff fields, runtime package current status, and the required `component.mjs` default export contract.
- Added a stable Markdown shape for Agent done reports and explicit `openItems` extraction rules for oracle usage, external endpoints, skipped previews, missing inputs, registry binding, and runtime publish approval.
- Added a runtime oracle provisioning path: `VaultRuntimeProvider` can now take an `oracleReader`, local preview serves `/api/runtime/oracle/{oracleId}`, and the runtime package exports server helpers for the oracle registry plus built-in example defaults.
- Added binding-scoped `externalContracts` manifest declarations for fixed non-token/non-Vault/non-factory contract targets.

### Changed

- Unified canonical Agent startup files across `agent-contract.json`, `docs/ai-agent.md`, and `docs/agent-entrypoints.md`.
- Aligned the Gemini, Windsurf, and generator skill startup reading order with the canonical Agent entrypoint sequence.
- Clarified the pull request validation checklist when live BNB/RPC smoke access is unavailable.
- Updated compatibility entry points to describe the same-origin runtime token-presentation proxy before ERC20 metadata fallback.
- Clarified that `docs/getting-started.md` is a human developer quick-start, not the Agent workflow source of truth.
- CI now packages and verifies the live example source zips and uploads generated validation artifacts as short-lived GitHub Actions artifacts.
- Clarified that reviewed oracle ids should be provisioned through the runtime package / same-origin proxy rather than by exposing raw endpoint URLs to Vault source, and removed the user-facing env setup requirement for the example oracle flow.
- `agent-contract.json` is now version 2 because agents must declare unavoidable fixed extra contract targets under `match.bindings[].externalContracts`.

### Fixed

- CI push validation now targets the active `main` branch.
- `.gitignore` now excludes local `.claude/` settings.
- `vault:check` now blocks duplicate `chainId + factoryAddress` manifest bindings and dynamic imports with expression specifiers.
- `vault:verify-package` now rejects duplicate zip entries and central/local header filename mismatches.
- `agent-contract.json` now names the oracle usage info rule with the checker-emitted `manual-review/oracle-usage` id.
- `docs/getting-started.md` step 6 "Package" no longer lists `yarn runtime:package` / `yarn runtime:verify-package` in the required Vault packaging code block; those commands are now correctly gated behind "if you changed shared runtime surfaces."
- `CHANGELOG.md` initial release entry now correctly records the token-presentation proxy as `/api/runtime/token-presentation` (renamed from `/api/preview/coin-detail`).
- `schemas/manifest.schema.json` `bindings` array now carries `uniqueItems: true`, aligning JSON-schema-level validation with the `vault:check` runtime duplicate-binding rule.
- `docs/ai-agent.md` non-oracle endpoint guidance now explicitly says to declare the endpoint in `manifest.endpoints` first (so `vault:check` can validate it and the Workbench can route it for review) and then also keep it in `openItems`.
- `vault:check` now blocks fixed SDK contract targets unless they are runtime token/Vault/factory addresses, binding-scoped token/Vault references, or declared in `match.bindings[].externalContracts`.

---

## [0.1.0] - 2026-05-25

### Breaking Changes

#### Manifest schema — `match.bindings` replaces `chainIds` + `match.factoryAddresses`; `restrictTokenAddresses` removed

**Old format (no longer valid):**
```json
{
  "chainIds": [56, 97],
  "match": {
    "factoryAddresses": ["0x..."],
    "restrictTokenAddresses": false
  }
}
```

**New format:**
```json
{
  "match": {
    "bindings": [
      { "chainId": 56, "factoryAddress": "0xMainnetFactory..." },
      { "chainId": 97, "factoryAddress": "0xTestnetFactory..." }
    ]
  }
}
```

- `chainIds` is removed as a top-level field. `vault:check` reports `manifest-schema/disallowed-field` with a migration hint.
- `match.factoryAddresses`, `match.restrictTokenAddresses`, `match.tokenAddresses`, and `match.vaultAddresses` are removed from the `match` level.
- `match.bindings` is a required non-empty array. Each entry must have `chainId` (positive integer) and `factoryAddress` (0x address). This removes cross-product ambiguity when a UI has multiple factory addresses across different chains.
- `restrictTokenAddresses` is removed entirely. The boolean was an explicit enforcement switch; the new model is that flap.sh enforces CA policy in its own registry. Vault manifests declare intent only.
- Optional `tokenAddresses` and `vaultAddresses` may be declared inside each `match.bindings` entry as reference lists. The template validates their address format, but preview/runtime does not use `vaultAddresses` for matching and does not enforce `tokenAddresses`. CA restrictions declared here are advisory; actual enforcement is handled by the Flap registry.
- Global or match-level `tokenAddresses` and `caPolicy` are blocked. `vault:check` reports `manifest-binding/ca-policy-not-in-manifest`.
- `--restrict-token` and `--token` scaffold flags are now blocked with error `manifest-binding/ca-policy-not-in-manifest`. Scaffold the shared UI artifact first; then add `tokenAddresses` manually to the relevant `match.bindings` entry.
- `--chain N --factory 0x...` scaffold flags are unchanged; scaffold generates the new `bindings` array format.
- Affected files: `schemas/manifest.schema.json`, `scripts/vault-scaffold.mjs`, `scripts/vault-check.mjs`, `scripts/vault-check-selftest.mjs`, `src/vaults/*/manifest.json`, `src/sdk/types.ts`, all agent docs and compatibility entry points.

### Added
- `.windsurfrules` — Windsurf IDE compatibility entry point.
- `GEMINI.md` — Gemini CLI compatibility entry point.
- `.github/copilot-instructions.md` — GitHub Copilot workspace instructions.
- `agent-contract.json`: `errorCodes` field mapping every blocking/warning check code to a concrete fix action.
- `agent-contract.json`: `requiredInputs` field with a JSON-schema-style spec for all inputs an agent must collect before generating a Vault.
- `agent-contract.json`: `doneReport` field specifying the structured handoff summary agents must produce after `vault:verify-package` succeeds.
- `docs/agent-intake-template.md` — structured Q&A conversation guide for collecting required inputs before Vault generation.
- `CHANGELOG.md` — this file.
- `docs/agent-entrypoints.md`: added Windsurf, GitHub Copilot, and Gemini CLI rows to the Supported Agents table.
- `src/vaults/dex-listed-example` — second built-in example package for `dex-listed` stage gating and approve → write flow.
- `src/vaults/action-gallery-example` — third built-in example package showing internal-market, DEX-listed, both-stage, and read-only controls together in one previewable Vault.
- `yarn vault:register --remove` — deregisters local preview wiring from `src/vaults/index.ts` for a given folder name.

### Changed
- `agent-contract.json`: `entrypoints` now includes `windsurf`, `copilot`, and `gemini` keys.
- `agent-contract.json`: `manifest.allowedMatchFields` updated to `["bindings"]`; `disallowedTopLevelFields` now includes `chainIds`, `restrictTokenAddresses`, `tokenAddresses`, and `caPolicy`.
- `agent-contract.json`: `requiredInputs.fields.bindings` replaces the former `chainIds`/`factoryAddresses` pair; `tokenAddressRule` updated to block global CA policy and allow per-binding reference lists.
- `docs/ai-agent.md`: startup reading order simplified to a 5-item canonical sequence; reference docs moved to a separate section. Required Inputs table updated for `bindings` pairs, per-binding optional `vaultAddresses` reference lists, and per-binding optional `tokenAddresses`.
- `docs/manifest.md`: Required Fields, Optional Fields, and binding explanation rewritten for `match.bindings`; `restrictTokenAddresses` moved to the Do Not Declare list.
- `docs/agent-intake-template.md`: Q5/Q6 updated to explain binding-scoped `vaultAddresses` / `tokenAddresses` reference-list semantics and new scaffold flow.
- `docs/prd.md`: manifest scope updated; cross-product model replaced with explicit `bindings` description; CA policy boundary entry added to acceptance criteria.
- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.windsurfrules`, `.cursorrules`, `.cursor/rules/flap-vault-ui.mdc`, `.github/copilot-instructions.md`, `README.md`: scaffold command hints and forbidden field lists updated.
- `skills/flap-vault-ui-generator/SKILL.md`: gathering inputs and manifest description updated for `bindings`, binding-scoped `vaultAddresses` references, and binding-scoped `tokenAddresses` references.
- `skills/flap-vault-ui-generator/references/check-rules.md`: blocking rules updated with new `manifest-binding/*` validation rule IDs; per-binding `tokenAddresses` reference lists noted as allowed.
- `skills/flap-vault-ui-generator/references/existing-vaults.md`: rewritten as a public-safe pattern-to-template mapping table, removing the private-checkout-only framing.
- `src/sdk/types.ts`: `VaultManifest` interface updated; `ManifestBindingEntry` replaces flat chain/factory fields; `match.bindings` is the typed array; `restrictTokenAddresses` removed.
- Reading order unified across `CLAUDE.md`, `GEMINI.md`, `.windsurfrules`, `.cursorrules`, and `.cursor/rules/flap-vault-ui.mdc`.
- `yarn ci` and `yarn preview:smoke` now validate all three built-in example routes.

---

## [0.0.1] - Initial release

**agent-contract.json version: 1**
**manifest schema: initial**
**package format version: 1**

Established:

- Four-file Vault package boundary (`Component.tsx`, `manifest.json`, `VaultABI.ts`, `i18n.json`).
- `artifactId` format: `vaultui_<folder-name>_<ULID>`.
- `vault:scaffold`, `vault:register`, `vault:check`, `vault:package`, `vault:verify-package` CLI contract.
- Machine-readable JSON error output with `code`, `fixHint`, and `agent.nextActions`.
- `doneCriteria` checklist.
- `actionAvailabilityStage` enforcement: `internal-market`, `dex-listed`, `both`, or `read-only`.
- `marketPhase` / `isActionAvailableForPhase` runtime contract.
- Token media via `context.tokenImageUrl`, `context.tokenName`, `context.tokenSymbol`.
- Preview shell token-presentation proxy at `/api/runtime/token-presentation` (initially exposed as `/api/preview/coin-detail`; renamed in a later release).
- Source package marker `flap-vault-package.json` with SHA-256 hashes.
- Multi-agent entry points: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/flap-vault-ui.mdc`, `.cursorrules`.
