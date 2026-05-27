# Manifest

`manifest.json` is intentionally small. It is only the developer-facing match and review boundary, not the place to configure Flap internal runtime behavior.

## Folder Name And Artifact ID

Folder name is the Vault source directory and local preview route. It is not stored as a manifest field:

```plain text
src/vaults/flap-nft-vault
http://localhost:3000/flap-nft-vault
```

Folder naming is strict lowercase kebab-case: 3-64 characters, letters/numbers separated by single hyphens. Do not use spaces, underscores, uppercase letters, leading/trailing hyphens, or nested folders.

`artifactId` is stored in `manifest.json` and is the stable unique identity for the source package/artifact family:

```plain text
vaultui_<folder-name>_<26-char ULID>
```

Example:

```plain text
vaultui_flap-nft-vault_01HZY7J4S9D0W5XJ8H2Q3K4M5N
```

`vault:scaffold` generates this by default. You may pass `--artifact-id` only when restoring a known existing artifact identity. `vault:check` validates that the `artifactId` format is correct, the embedded folder-name segment matches the Vault folder name, and no other `src/vaults/*/manifest.json` uses the same `artifactId`.

`artifactId` is not a runtime match rule. `match` stays in the manifest as the developer-facing deployment binding declaration so the same UI package can describe where it is intended to run.

Do not bind custom UI by type fields. The minimum registry match is:

```plain text
chainId + factoryAddress
```

If a deployment needs a token CA reference list, declare it only inside the relevant binding entry as `tokenAddresses`. This field is a reference allowlist in the source manifest: the template validates its format, but preview/runtime/package flow does not enforce it. Keep any CA restriction scoped to the binding that needs it instead of introducing a global switch.

The Vault address is runtime-derived by Flap. If a deployment wants to record binding-scoped Vault references, declare them only as `match.bindings[].vaultAddresses`. This template validates their format, but preview/runtime does not use them for matching.

Preview/runtime resolution should respect those explicit bindings. Prefer an exact `chainId + factoryAddress` match. A partial hint such as `chainId` alone or `factoryAddress` alone is only safe when it resolves to one unambiguous binding. Do not replace an explicit mismatched hint with an unrelated binding. In local preview, the first binding is only a default seed when the route provides no runtime hints at all. Do not repeat the same `chainId + factoryAddress` pair in multiple binding entries; merge any `vaultAddresses` or `tokenAddresses` references into one entry.

## Required Fields

```json
{
  "artifactId": "vaultui_my-vault_01HZY7J4S9D0W5XJ8H2Q3K4M5N",
  "name": "My Vault UI",
  "match": {
    "bindings": [
      { "chainId": 56, "factoryAddress": "0x..." }
    ]
  },
  "i18n": ["en", "zh"]
}
```

For a UI that supports both mainnet and testnet with different factory addresses:

```json
{
  "artifactId": "vaultui_my-vault_01HZY7J4S9D0W5XJ8H2Q3K4M5N",
  "name": "My Vault UI",
  "match": {
    "bindings": [
      { "chainId": 56, "factoryAddress": "0xMainnetFactory..." },
      { "chainId": 97, "factoryAddress": "0xTestnetFactory..." }
    ]
  },
  "i18n": ["en", "zh"]
}
```

| Field | Required | Description |
| --- | --- | --- |
| `artifactId` | Yes | Stable unique artifact identity. Must match `vaultui_<folder-name>_<ULID>` and the folder-name segment must match the Vault folder name. |
| `name` | Yes | Human-readable UI name for Workbench review. |
| `match.bindings` | Yes | Non-empty array of explicit `{chainId, factoryAddress}` pairs — one entry per deployment target. The same chain can appear more than once when different factories use the same UI logic. |
| `i18n` | Yes | Supported locale list. `vault:check` validates exactly these locales. |

## Optional Chain Entry Fields

These fields are declared inside each `match.bindings` entry, not at the `match` level:

| Field | Required | Description |
| --- | --- | --- |
| `vaultAddresses` | No | Optional reference Vault-address list for that binding. Use only when a deployment wants to record binding-scoped Vault addresses. The template validates the addresses but does not use the list at preview/runtime for matching. |
| `tokenAddresses` | No | Optional reference token CA allowlist for that binding. Use only when a deployment needs a per-binding token list. The template validates the addresses but does not enforce the list at preview/runtime. |

## Optional Top-Level Fields

| Field | Required | Description |
| --- | --- | --- |
| `endpoints` | No | Optional non-oracle external endpoint declarations. Use a single HTTPS URL string or an array of HTTPS URL strings. Avoid by default; declared endpoints enter Flap review and must be approved before publish. |

## Do Not Declare

Do not put these fields in `manifest.json`:

- `id`
- `owner`
- `version`
- `sdkVersion`
- `actions`
- `oracles`
- `media`
- `fallback`
- `contracts`
- `chainIds`
- `restrictTokenAddresses`
- global or match-level `tokenAddresses`
- `caPolicy`

Those are either source-package identity, build/runtime concerns, or unsupported global switches. Use `artifactId`, not `id`, for the source-package artifact identity. If you need a token CA reference list, declare it only as `match.bindings[].tokenAddresses`.

## Locale Validation

`manifest.i18n` controls i18n validation.

If the manifest declares both English and Chinese:

```json
{
  "i18n": ["en", "zh"]
}
```

then `i18n.json` must include both `en` and `zh`, and every key used by `Component.tsx` must exist in both locales.

If the manifest declares only one locale:

```json
{
  "i18n": ["zh"]
}
```

then `vault:check` validates only `zh`. It does not require or compare `en`.

## ABI Requirement

The Vault ABI is required, but it lives in the Vault source package, not in `manifest.json`.

```plain text
src/vaults/{folder-name}/VaultABI.ts
```

Keep ABI fragments minimal. Include only the Vault methods the component actually reads or writes. Do not include standard ERC20 token ABI fragments in `VaultABI.ts`.

Standard ERC20 token ABI is already available from the public SDK:

```ts
import { erc20Abi, standardErc20Abi } from "@/src/sdk";
```

Use the SDK-provided ERC20 ABI for standard `balanceOf`, `allowance`, `approve`, `decimals`, `symbol`, `transfer`, and `transferFrom` flows. Add token ABI fragments to `VaultABI.ts` only when the token uses custom non-standard methods or special mechanics that are not part of standard ERC20.

The Vault package file set is fixed. Do not add `helpers`, nested components, folders, assets, docs, or any other files under `src/vaults/{folder-name}`. The only local relative import allowed from `Component.tsx` is `./VaultABI`.

## Runtime Artifact Name

The Flap Artifact Workbench builds and names runtime versions/storage paths. Developers declare only the stable source-package `artifactId`; they do not declare runtime version in `manifest.json`.

The runtime artifact should still be tracked internally by reusable UI family and artifact version, not by chain id, factory address, token CA, or Vault address. Those values belong in deployment bindings and permission checks outside this public source package.

## Runtime Addresses

The production runtime injects:

```plain text
context.chainId
context.factoryAddress
context.tokenAddress
context.vaultAddress
```

Use these runtime context values in the component instead of hardcoding addresses in the manifest. Local preview can provide the same values through real runtime data or URL params such as `chainId`, `factoryAddress`, `tokenAddress`, and `vaultAddress`.

## Actions

Do not declare UI actions in `manifest.json`.

Action behavior belongs in `Component.tsx` through SDK methods such as:

```plain text
sdk.readContract
sdk.simulateContract
sdk.writeContract
sdk.waitForTx
sdk.refetch
```

Use runtime context addresses such as `context.vaultAddress` and `context.tokenAddress` as transaction targets. The check script scans for hidden targets, direct wallet access, unsafe imports, and missing i18n keys.

## Oracle Usage

Do not declare oracle config in `manifest.json`.

If the component calls `sdk.readOracle(...)`, `yarn vault:check <folder-name>` reports the oracle id for Flap review/provisioning. Oracle endpoints and signing policy are controlled by the Flap Artifact Workbench/runtime, not by the public source package.

Endpoint declarations are also review inputs, not approvals. When an endpoint is unavoidable, the handoff must include the URL, purpose, request/response shape, data sensitivity, fallback behavior, and why SDK/on-chain/oracle reads are insufficient. This public template does not define review SLA, approver, or ticket routing; keep endpoint approval in `openItems` until Flap records the decision outside the source package.

## External Endpoints

Avoid custom external endpoints. If an endpoint is unavoidable and is not an oracle, declare it under `endpoints`:

```json
{
  "endpoints": "https://api.example.com/proof"
}
```

Or:

```json
{
  "endpoints": [
    "https://api.example.com/proof",
    "https://metadata.example.com/nft"
  ]
}
```

A declared endpoint enters Flap review; it is not automatically approved and can still be rejected. Undeclared external URLs in Vault source are blocking check issues.
Endpoint declarations must be HTTPS URL strings only. Host-relative requests such as `fetch("/api/...")`, non-HTTPS URLs, IPFS/Arweave links, WebSocket URLs, and embedded data URL media are blocked inside Vault source by default.
