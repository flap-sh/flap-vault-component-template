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

Do not bind custom UI by type fields. There are three supported registry match modes:

```plain text
chainId + factoryAddress
chainId + vaultAddress (+ optional tokenAddress)
chainId + tokenAddress
```

For factory-scoped UI, `factoryAddress` must be the real non-zero deployed factory contract address for that chain. `0x0000000000000000000000000000000000000000` and reserved template placeholder addresses such as `0x1000000000000000000000000000000000000001` are invalid. For UI without a factory, omit `factoryAddress` and provide either exactly one real non-zero Vault address in `match.bindings[].vaultAddresses` or one or more real non-zero token addresses in `match.bindings[].tokenAddresses`.

Every binding-scoped `tokenAddresses` entry must be a real deployed ERC20 token address ending in `7777`, including entries placed on factory bindings. In factory mode, `tokenAddresses` is package proof input, not the production CA restriction. Production CA restriction is a Workbench/registry `caRestrictionMode` decision: `none` does not restrict production CA, `reserved` locks a future CA but cannot publish/route, and `verified` may write the production token restriction only after review checks. In no-factory mode `tokenAddresses` can be paired with a single Vault address or used as the token-scoped binding target, and it may contain multiple token addresses.

Do not mix `factoryAddress` and `vaultAddresses` in the same binding. In factory mode the Vault address is runtime-derived by Flap. In no-factory mode, `vaultAddresses` is the Vault-scoped binding target and `tokenAddresses` can be the token-scoped binding target.

If the UI must call a fixed contract address that is not the runtime token, runtime Vault, runtime factory, or binding-scoped token/Vault reference, declare it only inside the relevant binding as `externalContracts`. This is a review declaration, not a preview/runtime match rule.

Preview/runtime resolution should respect those explicit bindings. Prefer an exact `chainId + factoryAddress` match for factory mode, exact `chainId + vaultAddress` plus optional `tokenAddress` for Vault-scoped no-factory mode, or exact `chainId + tokenAddress` for token-scoped no-factory mode. A partial hint such as `chainId` alone is only safe when it resolves to one unambiguous binding. Do not replace an explicit mismatched hint with an unrelated binding. In local preview, the first binding is only a default seed when the route provides no runtime hints at all. Do not repeat the same runtime target in multiple binding entries; merge any `vaultAddresses`, `tokenAddresses`, or `externalContracts` references into one entry.

## Required Fields

Complete factory-scoped case: testnet proof token plus final mainnet factory binding.

```json
{
  "artifactId": "vaultui_my-vault_01HZY7J4S9D0W5XJ8H2Q3K4M5N",
  "name": "My Vault UI",
  "match": {
    "bindings": [
      {
        "chainId": 97,
        "factoryAddress": "0xTestnetFactoryRequired",
        "tokenAddresses": ["0xReal7777TestToken"]
      },
      { "chainId": 56, "factoryAddress": "0xMainnetFactoryRequired" }
    ]
  },
  "i18n": ["en", "zh"]
}
```

For a UI that supports both mainnet and testnet with different factory addresses, use the same shape and replace both factory placeholders with real deployed factories:

```json
{
  "artifactId": "vaultui_my-vault_01HZY7J4S9D0W5XJ8H2Q3K4M5N",
  "name": "My Vault UI",
  "match": {
    "bindings": [
      {
        "chainId": 97,
        "factoryAddress": "0xTestnetFactoryRequired",
        "tokenAddresses": ["0xReal7777TestToken"]
      },
      { "chainId": 56, "factoryAddress": "0xMainnetFactoryRequired" }
    ]
  },
  "i18n": ["en", "zh"]
}
```

For a UI that has no factory and is bound to one Vault, use one Vault address and one or more token addresses:

```json
{
  "artifactId": "vaultui_my-vault_01HZY7J4S9D0W5XJ8H2Q3K4M5N",
  "name": "My Vault UI",
  "match": {
    "bindings": [
      {
        "chainId": 56,
        "vaultAddresses": ["0xVaultAddressRequired"],
        "tokenAddresses": [
          "0xReal7777TestToken",
          "0xAdditional7777TokenIfNeeded"
        ]
      }
    ]
  },
  "i18n": ["en", "zh"]
}
```

For a UI that has no factory and is bound by token CA only, omit `vaultAddresses` and list the supported tokens:

```json
{
  "artifactId": "vaultui_my-vault_01HZY7J4S9D0W5XJ8H2Q3K4M5N",
  "name": "My Vault UI",
  "match": {
    "bindings": [
      {
        "chainId": 56,
        "tokenAddresses": [
          "0xTokenAddressOneRequired",
          "0xTokenAddressTwoRequired"
        ]
      }
    ]
  },
  "i18n": ["en", "zh"]
}
```

| Field | Required | Description |
| --- | --- | --- |
| `artifactId` | Yes | Stable unique artifact identity. Must match `vaultui_<folder-name>_<ULID>` and the folder-name segment must match the Vault folder name. |
| `name` | Yes | Human-readable UI name for Workbench review. |
| `match.bindings` | Yes | Non-empty array of explicit runtime targets. Each entry must include `chainId` and optionally a non-zero `factoryAddress`, exactly one non-zero `vaultAddresses` entry, or a no-factory `tokenAddresses` target. At least one binding in the manifest must include a real deployed `7777`-suffix test token under `tokenAddresses` for Workbench/E2E test coverage. |
| `i18n` | Yes | Supported locale list. Each locale string must be at least two characters, and `vault:check` validates exactly these locales. |

## Optional Chain Entry Fields

These fields are declared inside each `match.bindings` entry, not at the `match` level:

| Field | Required | Description |
| --- | --- | --- |
| `vaultAddresses` | Required for Vault-scoped no-factory binding | Optional for factory-scoped and token-scoped bindings. If provided without `factoryAddress`, it must contain exactly one non-zero Vault address. Do not include it in the same binding as `factoryAddress`. |
| `tokenAddresses` | Required in at least one binding | Manifest-declared test token source; every entry must be a real deployed ERC20 token address ending in `7777`. In factory mode this is not a production CA restriction. In no-factory mode it may contain multiple token addresses and participates in matching when token data is available. |
| `externalContracts` | No | Optional review list for fixed contract targets that are not the runtime token, Vault, factory, or binding-scoped token/Vault references. Each entry must contain only `address` and `label`. The template validates it but does not use it for preview/runtime matching. |

Example:

```json
{
  "chainId": 56,
  "factoryAddress": "0xFactoryAddressRequired",
  "externalContracts": [
    {
      "address": "0xExternalContractIfNeeded",
      "label": "Reward distributor"
    }
  ]
}
```

## Optional Top-Level Fields

| Field | Required | Description |
| --- | --- | --- |
| `endpoints` | No | Optional non-oracle external endpoint declarations. Use a single absolute HTTPS URL string without username/password credentials or an array of those strings. Avoid by default; declared endpoints enter Flap review and must be approved before publish. |
| `externalFrames` | No | Optional reviewed display-only chart iframe declaration. At most one entry is allowed. Use only for `tradingview`, `dexscreener`, or `coingecko-terminal` provider embeds with a complete static HTTPS `src` URL and fixed query string. |

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

Those are either source-package identity, build/runtime concerns, or unsupported global switches. Use `artifactId`, not `id`, for the source-package artifact identity. If you need a test token, declare it only as `match.bindings[].tokenAddresses`. If production routing must restrict CA, configure that in Workbench/registry after choosing `caRestrictionMode`; do not add a public manifest field. If you need fixed extra contract targets, declare them only as `match.bindings[].externalContracts`.

## Locale Validation

`manifest.i18n` controls i18n validation.

If the manifest declares both English and Chinese:

```json
{
  "i18n": ["en", "zh"]
}
```

then `i18n.json` must include both `en` and `zh`, and every key used by `Component.tsx` must exist in both locales.
`Component.tsx` must not hardcode locale text. Countdown units, preview fallback collection names, labels, notices, placeholders, and button text also belong in `i18n.json`.

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

If you write human-readable ABI signatures, parse them before export:

```ts
import { parseAbi } from "viem";

export const vaultAbi = parseAbi([
  "function vaultInfo() view returns (uint256 totalDeposited)",
]);
```

Do not export raw signature string arrays such as `export const vaultAbi = ["function ..."] as const`; runtime contract calls expect parsed ABI objects.

When an ABI method has multiple return values, read it as a tuple array. For example, `function poolInfo() view returns (uint256 currentPool, uint256 totalReceived)` should use a `readContract` result type like `readonly [currentPool: bigint, totalReceived: bigint]`, then map `tuple[0]` and `tuple[1]` into object-shaped UI state. Named outputs in a human-readable ABI do not make viem return an object for multi-output functions. A single returned Solidity `tuple` / struct output declared as one ABI output with `components` may still be read as an object.

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

## External Contract Targets

Vault source may call SDK contract methods against:

- `context.tokenAddress`
- `context.vaultAddress`
- `context.factoryAddress`
- binding-scoped `tokenAddresses`
- binding-scoped `vaultAddresses`
- fixed addresses declared in `match.bindings[].externalContracts`

If `Component.tsx` calls `readContract`, `simulateContract`, `writeContract`, `watchContractEvent`, `createContractEventFilter`, `getLogs`, or `estimateContractGas` against a fixed address that is not one of those allowed targets, `yarn vault:check <folder-name>` reports a blocking issue. This is the on-chain equivalent of endpoint declaration: extra contract dependencies must be visible before Workbench review.

`externalContracts` does not make a target approved. It only makes the target reviewable and checkable.

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

Use runtime context addresses such as `context.vaultAddress`, `context.tokenAddress`, and `context.factoryAddress` as transaction targets. If a fixed extra contract target is unavoidable, declare it under `match.bindings[].externalContracts`. The check script scans for hidden targets, undeclared fixed contract addresses, direct wallet access, unsafe imports, and missing i18n keys.

## Oracle Usage

Do not declare oracle config in `manifest.json`.

If the component calls `sdk.readOracle(...)`, `yarn vault:check <folder-name>` reports the oracle id for Flap review/provisioning. Oracle endpoints and signing policy are controlled by the Flap Artifact Workbench/runtime, not by the public source package.

Simple reviewed oracle ids can be provisioned by the runtime registry. External oracle providers that need dynamic paths, response transformation, binary/EVM payload wrapping, request signing, allowlisted upstream ids, or publish-time window validation must be implemented in the shared `@flapsdk/vault-runtime/server` package, not as one-off Workbench or `flap.sh` host code. The manifest remains free of oracle config in both cases.

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
Endpoint declarations must be valid absolute HTTPS URL strings without username/password credentials. A declaration covers only that URL path or child paths on the same origin; it does not allow sibling paths or lookalike hosts. Direct `fetch(...)` calls must use a static absolute HTTPS string covered by `manifest.endpoints`. Host-relative, dynamic, HTTP, credentialed, aliased, destructured, or computed browser-global fetch targets are blocked. IPFS/Arweave links, WebSocket URLs, embedded data URL media, browser storage/navigation/worker/permission APIs, direct browser network/media APIs, symlinks, and CommonJS `require(...)` are also blocked inside Vault source by default. Full gateway image URLs are blocked in Vault source; immutable Vault-specific images must use `IpfsImage` from `@/src/ui` with a static image CID, and the CID must pass `vault:check` image validation.

## External Frames

Avoid external frames. If a display-only market chart is unavoidable, declare one entry under `externalFrames` and render it only through one `ReviewedFrame` from `@/src/ui`:

```json
{
  "externalFrames": [
    {
      "id": "nvidia-tradingview-chart",
      "provider": "tradingview",
      "src": "https://s.tradingview.com/widgetembed/?symbol=NASDAQ%3ANVDA&interval=60&theme=dark&style=1",
      "title": "TradingView NVDA chart"
    }
  ]
}
```

Supported providers and exact origins:

| Provider | Allowed origins |
| --- | --- |
| `tradingview` | `https://www.tradingview.com`, `https://s.tradingview.com` |
| `dexscreener` | `https://dexscreener.com` |
| `coingecko-terminal` | `https://www.geckoterminal.com` |

The `src` must be one complete static HTTPS URL with a non-empty fixed query string, no username/password credentials, and no hash. Query params must be written directly in `manifest.json`; do not derive `symbol`, pair address, network, theme, or embed flags from runtime state.

Component code must reference the same static values:

```tsx
import { ReviewedFrame } from "@/src/ui";

<ReviewedFrame
  frameId="nvidia-tradingview-chart"
  provider="tradingview"
  src="https://s.tradingview.com/widgetembed/?symbol=NASDAQ%3ANVDA&interval=60&theme=dark&style=1"
  title="TradingView NVDA chart"
/>
```

Raw `<iframe>`, more than one `ReviewedFrame`, `document.createElement("iframe")`, `srcDoc`, dynamic `src={chartUrl}`, template-string URLs, postMessage handlers, wallet connection inside frames, and frame-driven quotes/risk/settlement/transaction flows are blocked. A frame declaration enters Flap review; it is not automatically approved and can still be rejected. `manifest.externalFrames` does not allow `fetch(...)`, user-facing navigation, scripts, images, or arbitrary provider domains.

`vault:check` prints the valid frame declaration in `review.externalFrames[]` and includes the full iframe `src` in the `manual-review/external-frame` warning so Workbench can surface it directly for human review.
