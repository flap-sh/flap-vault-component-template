# Check Rules

`yarn vault:check {folder-name}` reports:

- blocking: must fix before packaging
- warning: allowed but reviewer must inspect
- info: improvement hint

The output is JSON and includes `ok`, `summary`, `agent.verdict`, `agent.nextActions`, and `issues`. Agents should fix `agent.nextActions` with blocking severity first.

## Blocking

- missing required files
- extra files or folders inside `src/vaults/{folder-name}`
- missing registration in `src/vaults/index.ts`
- invalid Vault folder name; it must be 3-64 characters of lowercase kebab-case
- missing, malformed, mismatched, or duplicated `manifest.artifactId`
- local relative import other than `./VaultABI`
- dynamic import
- forbidden files like `.env`, `.git`, `.vercel`, `node_modules`
- invalid manifest binding: `match.bindings` must be a non-empty array of factory-scoped, Vault-scoped, or token-scoped targets
- duplicate `match.bindings` entries with the same runtime target
- missing or non-`7777` manifest test token in `match.bindings[].tokenAddresses`
- legacy `chainIds` top-level field present (removed; chain IDs must live inside `match.bindings` entries)
- disallowed fields at `match` level (only `bindings` is allowed)
- invalid binding entry: missing or invalid `chainId`, missing target, zero factory, no-factory Vault binding without exactly one Vault address, or invalid token target list
- global or match-level CA policy fields such as `restrictTokenAddresses`, global `tokenAddresses`, or `caPolicy`; binding-level `match.bindings[].tokenAddresses` is allowed as a reference list
- malformed `match.bindings[].externalContracts`; each entry must include only `address` and `label`
- any type-field UI binding
- direct wallet access
- `eval` / the `Function` constructor
- raw iframe, iframe `srcDoc`, or script injection, including `document.write` / `document.writeln`
- invalid external frame declarations or `ReviewedFrame` usage; only one static TradingView, DexScreener, or CoinGecko Terminal provider URL declared in `manifest.externalFrames` is allowed for review
- runtime remote import
- dynamic import or CommonJS `require(...)`
- symlink inside the Vault folder
- undeclared URL, endpoint, or external resource
- host-relative, dynamic, HTTP, credentialed, aliased, destructured, or computed browser-global fetch target
- browser storage/navigation/worker/cross-context/permission API or direct browser network/media API
- non-HTTPS, `ipfs://` / gateway image URL, Arweave, WebSocket, or embedded data URL resource usage in Vault source; immutable Vault-specific images must use `IpfsImage` or `IpfsBackground` with a static image CID
- missing or invalid locale declarations in `manifest.i18n`; locale strings must be at least two characters
- i18n key missing from any locale declared by `manifest.i18n`
- missing current contract risk-status integration from host `riskLevel`, including the prominent unavailable-risk warning state
- current contract risk status placed after the first three Vault-specific business rows or after preview/hero/media/chart visuals
- manual `Low risk` / `低风险` labels, badges, summaries, or reassuring copy that are not selected from the host-derived `riskLevel === 1` branch
- object result types on `sdk.readContract` calls for ABI methods with multiple return values; read those methods as tuple arrays and map indexes into UI state
- unprovisioned or registry-only `sdk.readOracle(...)` usage that is not built into the shared runtime
- suspicious `Number(...)` token amount conversion
- remote media inside Vault source
- hardcoded EVM addresses in Vault source unless they are binding-scoped token/Vault/factory references or declared external contract targets
- contract reads/writes, event watches, log/filter calls, or gas estimates against fixed non-token/non-Vault/non-factory addresses that are not declared in `match.bindings[].externalContracts`

## Selftest

Run `yarn vault:check:selftest` after changing checker rules, the Agent contract, manifest policy, package generation, or package verification. It uses temporary fixtures to verify the highest-risk blocking paths still fire, including endpoint-prefix escapes, invalid external frames, and undeclared fixed contract targets, and it exercises scaffold -> check -> package -> verify for one valid temporary package.

## Package Verification

Run `yarn vault:verify-package dist/{folder-name}.zip` after packaging. It checks:

- `flap-vault-package.json` exists
- package kind and format version match the supported Workbench intake contract
- marker generator, sourcePackage, and check summary match the script-generated package
- the zip contains only the four Vault files, manifest schema, package metadata, and package marker
- duplicate zip entries and central/local header filename mismatches are rejected
- metadata matches the marker
- source file and schema SHA-256 hashes match

## Warning

- declared non-oracle endpoint requires Flap review before publish
- a single declared external frame requires Flap review before publish
- unreviewed import
- local image asset
- i18n key mismatch
- refetch below recommended interval
- built-in oracle usage is reported for Flap review/provisioning
- standard ERC20 methods declared in `VaultABI.ts`; use `erc20Abi` or `standardErc20Abi` from `@/src/sdk` instead

## Info

- none

## Expected Fix Style

Fix by using:

- Flap SDK method
- manifest declaration only for match fields, i18n, unavoidable non-oracle endpoints, unavoidable reviewed external frames, and unavoidable fixed extra contract targets
- real runtime data
- i18n key
- approved UI primitive

Manifest declaration is required only for the limited developer-facing surface. It does not make an endpoint, external frame, or external contract approved. Endpoint declarations must be absolute HTTPS URLs without username/password credentials, and direct `fetch(...)` must use a static absolute HTTPS string covered by `manifest.endpoints`. External frame declaration must use at most one `manifest.externalFrames[]` entry and at most one `ReviewedFrame` with an exact static provider URL and fixed query string. Fixed extra contract targets must be declared under `match.bindings[].externalContracts` with `address` and `label`. Prefer removing external endpoints/resources/frames and extra contract targets unless the Vault cannot work without them. Oracle config, actions, media, fallback, artifact id, and version are Flap Artifact Workbench/runtime concerns, not manifest fields.
