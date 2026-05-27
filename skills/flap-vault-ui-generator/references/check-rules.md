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
- invalid manifest binding: `match.bindings` must be a non-empty array of `{chainId, factoryAddress}` pairs
- duplicate `match.bindings` entries with the same `chainId + factoryAddress`
- legacy `chainIds` top-level field present (removed; chain IDs must live inside `match.bindings` entries)
- disallowed fields at `match` level (only `bindings` is allowed)
- invalid binding entry: missing or invalid `chainId` (must be a positive integer) or `factoryAddress` (must be a 0x address)
- global or match-level CA policy fields such as `restrictTokenAddresses`, global `tokenAddresses`, or `caPolicy`; binding-level `match.bindings[].tokenAddresses` is allowed as a reference list
- any type-field UI binding
- direct wallet access
- `eval` / `new Function`
- iframe/script injection
- runtime remote import
- undeclared URL, endpoint, or external resource
- host-relative fetch such as `fetch("/api/...")`
- non-HTTPS, IPFS, Arweave, WebSocket, or embedded data URL resource usage in Vault source
- missing a locale declared by `manifest.i18n`
- i18n key missing from any locale declared by `manifest.i18n`
- remote media inside Vault source
- hardcoded EVM addresses in Vault source

## Selftest

Run `yarn vault:check:selftest` after changing checker rules, the Agent contract, manifest policy, package generation, or package verification. It uses temporary fixtures to verify the highest-risk blocking paths still fire, including endpoint-prefix escapes, and it exercises scaffold -> check -> package -> verify for one valid temporary package.

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
- unreviewed import
- local image asset
- i18n key mismatch
- refetch below recommended interval
- suspicious `Number(...)` token amount conversion
- standard ERC20 methods declared in `VaultABI.ts`; use `erc20Abi` or `standardErc20Abi` from `@/src/sdk` instead

## Info

- oracle usage is reported for Flap review/provisioning

## Expected Fix Style

Fix by using:

- Flap SDK method
- manifest declaration only for match fields, i18n, and unavoidable non-oracle endpoints
- real runtime data
- i18n key
- approved UI primitive

Manifest declaration is required only for the limited developer-facing surface. It does not make an endpoint approved. Prefer removing external endpoints/resources unless the Vault cannot work without them. Oracle config, actions, media, fallback, artifact id, and version are Flap Artifact Workbench/runtime concerns, not manifest fields.
