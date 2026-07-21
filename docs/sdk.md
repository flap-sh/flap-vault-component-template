# Flap Capability SDK

The component should depend on the SDK contract, not on private `flap.sh` internals.

## Hooks

```ts
import { useFlapSdk, useVaultContext, useFlapI18n, useFlapNotify, useFlapWallet } from "@/src/sdk";
```

## Common Methods

```ts
sdk.readContract<T>(request)
sdk.simulateContract(request)
sdk.writeContract(request)
sdk.waitForTx(hash)
sdk.readOracle<T>(oracleId, params)
sdk.refetch(keys)
sdk.refetchNonce
sdk.openExplorerTx(hash)
```

`sdk.readContract(...)` accepts an optional `account` field. Use it when a view function depends on `msg.sender`, for example `sdk.readContract({ contract: "vault", address: context.vaultAddress, abi: vaultAbi, functionName: "myInfo", account: context.userAddress })`.

ABI methods with multiple return values are tuple arrays at runtime. Even if the ABI names the outputs, `returns (uint256 currentPool, uint256 totalReceived)` should be read as `readonly [currentPool: bigint, totalReceived: bigint]`, then mapped into object-shaped UI state if that is easier to render. Do not type a multi-output `sdk.readContract` call as an object interface. A single returned Solidity `tuple` / struct output declared as one ABI output with `components` may still be read as an object.

`VaultRuntimeProvider` can now receive an `oracleReader` so the host/runtime owns oracle provisioning instead of the component owning raw endpoint URLs:

```ts
import { createLocalOracleReader, VaultRuntimeProvider } from "@/src/sdk";

<VaultRuntimeProvider
  manifest={manifest}
  i18n={i18n}
  oracleReader={createLocalOracleReader()}
>
  <Component />
</VaultRuntimeProvider>
```

`createLocalOracleReader()` targets the same-origin runtime proxy at `/api/runtime/oracle/{oracleId}`. In this template, local preview now ships with built-in runtime defaults for `example-reward-oracle`, the display-only `bnb-usd-price` price oracle, the official `v2-pool-reserves` Flap Oracle path, and the `x-verifier` Gift Vault proof relay. `bnb-usd-price` returns `{ price: number, symbol: string, timestamp: number, source: string }` for BNB-to-USD display conversion. `v2-pool-reserves` forwards `{ pool }` to the mainnet or testnet Flap Oracle endpoint based on the current runtime `chainId`. `x-verifier` accepts `{ tax_token, tweet_id }` params and the runtime posts them to the reviewed X proof relay. If a host/runtime needs to override an oracle id with a reviewed upstream URL, it should register that in the host integration layer rather than exposing endpoint config to Vault authors. The older `context.extraConfig.oracleEndpoints` map remains a legacy preview fallback only. Source package validation accepts built-in runtime oracle ids only; registry-only ids remain blocking so template packages cannot pass locally and then fail in Workbench production.

For the same-origin runtime proxy, reviewed oracle ids can be previewed with `FLAP_RUNTIME_ORACLE_REGISTRY`. The value is a JSON object keyed by oracle id:

```json
{
  "reviewed-feed-id": {
    "endpoint": "https://oracle.example.com/feed",
    "fixedParams": { "feed": "reviewed-feed" },
    "allowedParams": ["matchId"]
  }
}
```

`fixedParams` are appended by the runtime after UI params, so a component cannot override server-fixed routing values such as `feed`. `allowedParams` limits which UI-provided params are forwarded. Registry entries cannot include headers, and Flap runtime does not hold or forward upstream tokens. If authentication is required, the provider must expose its own reviewed no-secret HTTPS relay before the oracle is provisioned. Registry-only ids are still blocked by `vault:check` for source packages; repeated or official oracle ids must be promoted into the built-in shared runtime provider list.

### Runtime-Owned Oracle Providers

`FLAP_RUNTIME_ORACLE_REGISTRY` is intentionally a narrow pass-through contract: static no-secret HTTPS endpoint, UI-param allowlisting, and server-fixed query params. If an oracle needs dynamic path construction, request signing, response transformation, EVM byte wrapping, price-id allowlisting, publish-time window validation, or any other provider-specific logic, implement that provider in `@flapsdk/vault-runtime/server` from this template repo and publish a new runtime package version.

Do not implement those provider adapters separately inside Workbench or `flap.sh`. Those hosts should validate their route/query/env boundaries and then call the shared runtime server helper, so local preview, Workbench review, and production host behavior stay aligned. A host-local adapter is acceptable only as a temporary migration fallback and should be replaced by a runtime package provider before the oracle becomes a repeated pattern.

`sdk.wallet` exposes the connected account and chain status. `address` and `isConnected` come from the real preview wallet connection. `balance` is the connected wallet's real native-token balance (formatted, `"0"` when no wallet is connected). `chainId`, `chainLabel`, `requiredChainId`, `requiredChainLabel`, and `isWrongNetwork` let a Vault UI detect when the wallet is on the wrong chain and prompt a switch before continuing. `connect()`, `disconnect()`, and `switchChain()` forward to the preview wallet runtime; in production, wallet connection remains host/shell-owned, so Vault components should mainly read `sdk.wallet.isWrongNetwork` and render a clear switch-network state instead of sending writes on the wrong chain. Local preview reads and writes should use the real public client, wallet client, and contract addresses.

```ts
const sdk = useFlapSdk();

if (sdk.wallet.isWrongNetwork) {
  await sdk.wallet.switchChain();
}
```

### Reloading data after a write

`sdk.refetch()` increments `sdk.refetchNonce`, a monotonic counter. Components that want automatic reloads add `sdk.refetchNonce` to the dependency array of the effect that performs reads:

```ts
const { refetchNonce } = useFlapSdk();
useEffect(() => {
  void loadData();
}, [loadData, refetchNonce]);
```

You may also just call your own `loadData()` directly after `waitForTx(...)`, which is what the bundled examples do. The optional `keys` argument to `refetch(keys)` is reserved for future scoped invalidation and is currently advisory only.

Prefer SDK methods and on-chain reads over external endpoints or frames. `sdk.readOracle(...)` usage is reported by `vault:check` for Flap review/provisioning; oracle config is not declared in `manifest.json`. When oracle access is required, provision it through the runtime (`oracleReader`, same-origin proxy, Workbench adapter, or `flap.sh` host adapter) instead of hardcoding client-visible endpoint URLs into Vault source. Non-oracle external endpoints may be predeclared in `manifest.json` as a single absolute HTTPS URL string without username/password credentials or an array of those strings, then approved before publish. One display-only market chart frame may be predeclared in `manifest.externalFrames` only for TradingView, DexScreener, or CoinGecko Terminal/GeckoTerminal exact provider origins and must render through one `ReviewedFrame` with a complete static query URL. Undeclared URLs and host-relative, dynamic, HTTP, credentialed, aliased, destructured, or computed browser-global fetch targets are rejected.

Contract calls should normally target runtime addresses: `context.vaultAddress`, `context.tokenAddress`, and `context.factoryAddress`. If a component must call a fixed extra contract address that is not the runtime token, Vault, factory, or a binding-scoped token/Vault reference, declare it under `match.bindings[].externalContracts` with `address` and `label`; otherwise `vault:check` blocks the call.

## Standard ERC20 ABI

Standard ERC20 token ABI is part of the public SDK surface:

```ts
import { erc20Abi, standardErc20Abi } from "@/src/sdk";
```

Use it for normal token reads and approvals such as `balanceOf`, `allowance`, `approve`, `decimals`, `symbol`, `transfer`, and `transferFrom`.

Do not copy standard ERC20 ABI fragments into `src/vaults/{folder-name}/VaultABI.ts`. Only add token ABI fragments there when a token has custom non-standard methods or special mechanics.

## Utilities

The public `@/src/sdk` barrel also exports pure formatting, tx-error, IPFS, and oracle-helper utilities that Vault components can import directly:

```ts
import {
  formatTokenAmount,
  parseTokenAmount,
  formatPercentBps,
  formatCountdown,
  shortenAddress,
  getTxErrorKind,
  handleTxError,
  isIpfsImageCid,
  resolveIpfsImageUrl,
  resolveIpfsImageUrls,
  buildLocalOracleUrl,
  fetchOracleJson,
  fetchProvisionedOracle,
  createLocalOracleReader,
} from "@/src/sdk";
```

- Formatting: `formatTokenAmount` / `parseTokenAmount` convert between display strings and on-chain `bigint` amounts, `formatPercentBps` renders basis points as a percent, `formatCountdown` renders a remaining-time value, and `shortenAddress` renders a truncated address.
- Tx errors: `getTxErrorKind` classifies a caught error into a `TxErrorKind`, and `handleTxError` maps it to a user-facing notification path. Prefer these over ad hoc string matching on wallet/RPC errors.
- IPFS: `isIpfsImageCid` validates an image CID, and `resolveIpfsImageUrl` / `resolveIpfsImageUrls` resolve a CID (or list) to allowed Flap gateway URLs. Vault-specific images should still render through `IpfsImage` / `IpfsBackground` from `@/src/ui` with a static CID.
- Oracle: `createLocalOracleReader`, `buildLocalOracleUrl`, `fetchOracleJson`, and `fetchProvisionedOracle` back the runtime oracle provisioning path described above.

## i18n

```ts
const { i18n } = useFlapSdk();
i18n.t("actions.deposit");
```

Each Vault folder owns its `i18n.json` with the locales declared by `manifest.i18n`. The Flap preview shell owns shell/header text and any shared host summary/header copy. Do not import the shell content files from a Vault component.

## Token Unavailable State

The Flap shell can mark a token as unavailable before rendering the Vault component:

```ts
context.extraConfig.tokenUnavailable === true
```

Local preview can also simulate it with `?tokenStatus=invalid`. When this state is active, the shell shows a developer-facing check message and does not render the Vault component.

## Context

```ts
context.chainId
context.factoryAddress
context.tokenAddress
context.vaultAddress
context.userAddress
context.tokenSymbol
context.tokenName
context.tokenImageUrl
context.paymentToken
context.extraConfig
context.manifest
```

## Token Metadata And Image

The preview shell owns the token header and the shared frame above the Vault body. Vault components should consume token metadata from runtime context instead of calling private coin-detail APIs:

```ts
context.tokenSymbol
context.tokenName
context.tokenImageUrl
```

In local preview, the host first reads token presentation data through the same-origin runtime proxy, then falls back to ERC20 `symbol()` and `name()` from the preview `tokenAddress` if host presentation is unavailable. The mocked `/logo.png` image is reserved for the neutral preview fixture only. Production Flap host should inject equivalent token metadata.

Do not fetch private token metadata APIs from `src/vaults/{folder-name}/Component.tsx`.
When implementing `Component.tsx`, start at the first Vault-specific business section below `Vault Information`. Do not recreate token/header chrome or a duplicate top summary banner when the host surface already provides one.

For a Vault-specific immutable image that is not token media, use the shared UI component and pass only the raw image CID:

```tsx
import { IpfsImage } from "@/src/ui";

<IpfsImage
  cid="bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq"
  alt={i18n.t("media.heroAlt")}
  className="aspect-[16/9] w-full rounded-md object-cover"
/>
```

The CID must be the image CID, not a metadata CID. If an image must be pinned through Flap instead of a personal Pinata gateway, use the Flap token metadata upload API from [Launch token through Portal](https://docs.flap.sh/flap/developers/token-launcher-developers/launch-token-through-portal#id-1-prepare-token-metadata) outside the Vault package. The `https://funcs.flap.sh/api/upload` `create(file, meta)` response `data.create` is the metadata CID used for Portal launch `meta`; read that metadata JSON and extract the `image` field before using `IpfsImage` or `IpfsBackground`. Strip any gateway URL or `ipfs://` prefix before using the value. Do not pass `imageUrl`, a full gateway URL, a CSS `url(...)`, or a dynamic expression. `vault:check` verifies the static CID resolves as `image/*` through the allowed Flap IPFS gateways.

## Taxinfo Host Context

The Flap host owns the taxinfo and feeinfo preflight layer. Production should resolve Portal token state, helper tax info, VaultPortal info, registry factory/CA binding, and fee mode before rendering a custom Vault UI. Vault components should consume the result instead of calling private backend APIs or rebuilding type / fee-mode mapping.

Custom Vault UI in this template targets the tax-token path. Do not spend component logic on a separate non-tax custom-Vault branch. The live runtime state that still matters is token lifecycle (`marketPhase` / `isListed`) plus token metadata, and the public SDK/host provides that uniformly.

```ts
context.host?.tokenInfo
context.host?.taxInfo
context.host?.vaultInfo
context.host?.feeMode
context.host?.renderSurface
context.host?.vaultType
context.host?.isListed
context.host?.marketPhase
context.host?.vaultInfo?.riskLevel
context.host?.taxInfo?.vaultInfo?.riskLevel
```

The SDK also exports a normalized host helper:

```ts
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";

const { context } = useFlapSdk();
const host = readTaxVaultHostContext(context.host);
```

`host.isSupportedCustomVaultToken` remains available when the host wants to assert that it resolved an existing tax token. For component gating and AI-agent guidance, the main fields are `host.marketPhase`, `host.isListed`, and current contract risk status from `host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel`.

Every onboarded Vault UI must visibly render the current contract risk status within the first three visible Vault-specific business rows/blocks and before any preview, hero, banner, showcase, media, chart, or large visual block. If `riskLevel` is unavailable, the component must show a prominent warning/danger notice that risk-status integration is required before delivery. Do not hardcode or unconditionally render `Low risk` / `低风险` labels, badges, summaries, or reassuring copy; those labels may appear only when selected from the host-derived `riskLevel === 1` branch.

`marketPhase` is the normalized token lifecycle stage exposed to custom Vault UI. In this template, the local preview host computes and injects it from the real Portal token status when the route provides a supported `chainId + tokenAddress`; explicit preview params can still override it for UI QA:

| Value | Meaning | Source Rule |
| --- | --- | --- |
| `internal-market` | Token exists but has not migrated/listed yet. | `tokenInfo.exists === true` and `tokenInfo.status < 2` |
| `dex-listed` | Token has migrated/listed and DEX-stage actions may be available. | `tokenInfo.exists === true` and `tokenInfo.status >= 2` |
| `unknown` | Token state is missing or unavailable. | No existing token info |

`isListed` remains available for backwards-compatible boolean checks. Prefer `marketPhase` for new UI because it makes internal-market vs DEX-listed button gating explicit.

In local preview, token metadata and token lifecycle are separate concerns:

- `tokenAddress` alone lets the shell ask the same-origin host proxy for token presentation data and, if that is unavailable, fall back to ERC20 `symbol()` / `name()` for `context.tokenSymbol` / `context.tokenName`. Only the neutral preview fixture uses a mocked `context.tokenImageUrl`.
- On supported preview chains, `chainId + tokenAddress` also lets the shell read real `Portal.getTokenV7` data and derive `marketPhase` / `isListed` from the returned `status`.
- To override lifecycle state intentionally, pass `marketPhase`, `isListed`, `status`, or `tokenStatusCode`.
- If you pass `taxInfo=1` with a valid `tokenAddress`, the preview host seeds an existing-token taxinfo surface only when no real chain host data is available or when you intentionally want fixture data.

The preview shell and production host resolve this snapshot with chain-read helpers such as `readErc20TokenMetadata(...)`, `loadTokenRuntimeSnapshot(...)`, `runHostRuntime(...)`, and `createLocalHostPresentationFetcher(...)`. These are host/runtime-side helpers defined in the runtime package, not part of the Vault-importable `@/src/sdk` surface. A Vault Component must not import them from `@/src/sdk`; it consumes the already-resolved result through `context.host` and `readTaxVaultHostContext(context.host)`. Host/runtime integrations that need those helpers import them from the shared runtime `host` export (`@flapsdk/vault-runtime/host`), never from Vault source.

`readErc20TokenMetadata(...)` reads ERC20 `symbol()` / `name()` directly from chain. `loadTokenRuntimeSnapshot(...)` reuses the same public chain-read path as preview: ERC20 metadata plus, on supported chains, `Portal.getTokenV7`, helper tax info, VaultPortal info, and a normalized `host` snapshot. `runHostRuntime(...)` adds the full-host/on-chain/unavailable policy layer on top, and `createLocalHostPresentationFetcher()` is the preview-side adapter that resolves host-owned token presentation through the same-origin runtime proxy.

Robinhood Testnet chain `46630` is supported by these host/runtime helpers starting in `@flapsdk/vault-runtime@0.1.23`. Its host config uses the flap.sh `robinhood-testnet` slug plus the deployed Portal, tax helper, VaultPortal, wrapped native token, explorer, and network label. Standard Robinhood manifest/E2E proof tokens are listed in `docs/robinhood-testnet.md`.

For action gating, import the stage helper from the SDK:

```ts
import { isActionAvailableForPhase, useFlapSdk } from "@/src/sdk";

const { context } = useFlapSdk();
const marketPhase = context.host?.marketPhase ?? "unknown";
const depositAvailable = isActionAvailableForPhase("internal-market", marketPhase);
const claimAvailable = isActionAvailableForPhase("dex-listed", marketPhase);
```

Do not hide a supported action only because the token is in the wrong phase. Render the action section, disable the unavailable button, and show copy that says whether it requires internal-market, DEX-listed, both, or read-only mode.

Wrong-network gating is separate from market-phase gating. If a component can write on only one chain, keep the write section visible, disable the write path when `sdk.wallet.isWrongNetwork === true`, and offer a clear switch-network state through `sdk.wallet.switchChain()`.

The runtime side owns the pure parsing/resolution helpers that mirror Flap's stable taxinfo/feeinfo shape, for example:

```plain text
parsePortalTokenInfo(rawGetTokenV7)
parseTaxTokenInfo(rawTaxInfo, rawTaxInfoV2, options)
parseVaultPortalInfo(rawTryGetVault)
resolveFeeMode(taxInfo, giftVaultFactory)
isManifestRuntimeMatch(manifest, runtime)
createTaxInfoHostContext(input)
readErc20TokenMetadata(publicClient, tokenAddress)
loadTokenRuntimeSnapshot(publicClient, chainId, tokenAddress)
```

These are host/runtime-side helpers. They are NOT re-exported by the Vault-facing `@/src/sdk` barrel, so a Vault Component cannot import them from `@/src/sdk`; any example that does will not compile. From the Vault-importable surface, only the phase helpers `resolveTokenMarketPhase(tokenInfo)` and `isActionAvailableForPhase(stage, marketPhase)` (plus `readTaxVaultHostContext(context.host)`) are available. The parsing helpers keep chain registry data and private configuration outside the public template and live in the shared runtime package for hosts to import from `@flapsdk/vault-runtime/host`. Custom Vault source should still import only `@/src/sdk`, `@/src/ui`, and `./VaultABI`, and consume host state through `context.host` + `readTaxVaultHostContext(context.host)`.

Local preview includes a right-side "Token phase self-test" panel. `Real` restores the live host phase resolved from `chainId + tokenAddress`; `Internal` and `Listing` apply temporary local overrides without editing code or depending on an external SDK. `unknown` remains a runtime value and can still appear in readout when host data is missing, but it is no longer a primary phase tab.

The same local preview API can also be driven with URL params:

```plain text
/example?tokenAddress=0x...&vaultAddress=0x...&factoryAddress=0x...&taxInfo=1&marketBps=10000&vaultType=myVault&feeMode=gift&marketPhase=internal-market
```

Use `marketPhase=internal-market`, `marketPhase=dex-listed`, `isListed=false`, or `status=1` / `status=2` to exercise stage-gated actions. `status` and `tokenStatusCode` are low-level numeric overrides; `marketPhase` is the preferred preview input for custom Vault UI work.

Use `renderSurface=feeinfo`, `renderSurface=vault-taxinfo`, or `tokenStatus=invalid` to exercise route/fallback states.

The production runtime will inject equivalent methods. Local preview uses the same real runtime path with addresses supplied by the runtime or preview URL.

## Import Stability

Use public aliases for shared Flap runtime surfaces:

```ts
import { useFlapSdk } from "@/src/sdk";
import { Button } from "@/src/ui";
```

Do not import host app files from `flap.sh`. The only local relative import allowed inside a Vault package is `./VaultABI`. Do not use `./helpers`, `../VaultABI`, nested component imports, local asset imports, or dynamic imports. Use public aliases such as `@/src/sdk` and `@/src/ui` for shared runtime surfaces.
Import those shared aliases exactly. Deep imports such as `@/src/sdk/format` or `@/src/ui/Button` are not supported in source packages; import the needed helper or primitive from `@/src/sdk` or `@/src/ui` instead.

## Transaction Pattern

```plain text
validate input
  -> read allowance / approval
  -> approve if needed
  -> wait for approval receipt
  -> refetch allowance
  -> simulate dynamic write
  -> write
  -> wait for receipt
  -> refetch affected data
```
