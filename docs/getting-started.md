# Getting Started

This is the human developer quick-start. AI agents should use `agent-contract.json` and `docs/ai-agent.md` as the required workflow contract, then use this file only as supporting setup and preview context.

## 1. Install

```bash
yarn
```

The template runs without any local env file. Defaults are already wired for wallet preview, BNB RPC fallback, host presentation proxy target, and chain explorer base URLs.

The shared default Reown/WalletConnect Project ID for quick preview is:

```plain text
0f5b4547ebf94f1fe8e524147e630fd9
```

If wallet connection fails or rate-limits during testing, create your own Reown/WalletConnect test Project ID from `https://dashboard.reown.com` and override it in `.env.local`:

```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_reown_project_id_here
```

The preview shell already overrides wagmi's default BSC transport so local chain reads do not use the shared `56.rpc.thirdweb.com` endpoint. It uses official BNB Chain fallback endpoints by default. Only if you still want to force your own RPC in local preview should you set:

```bash
NEXT_PUBLIC_BSC_RPC_URL=https://your-bsc-rpc.example,https://your-bsc-rpc-backup.example
NEXT_PUBLIC_BSC_TESTNET_RPC_URL=https://your-bsc-testnet-rpc.example,https://your-bsc-testnet-rpc-backup.example
```

`.env.local` is optional override-only config. Do not commit it.

## 2. Preview

```bash
yarn dev
```

Open:

```plain text
http://localhost:3000/example
```

Live reviewed example routes:

```plain text
http://localhost:3000/community-buyback-example
http://localhost:3000/flapixel-example
```

After adding and registering another Vault folder name, preview it with:

```plain text
http://localhost:3000/my-vault
```

The preview shell includes the Flap-style header, real RainbowKit/wagmi wallet connection, chain selector, and language selector. Use it to test:

- connect wallet / account modal
- BNB Chain / BNB Testnet switching
- EN / ZH language switching
- component text updating through `sdk.i18n.t(...)`
- current manifest output in the preview-side manifest panel
- token phase self-test from the preview-side panel (`Real` restores live host phase; `Internal` and `Listing` are local overrides)
- invalid token fallback with `http://localhost:3000/example?tokenStatus=invalid`
- internal-market action gating with `http://localhost:3000/example?tokenAddress=0x...&vaultAddress=0x...&factoryAddress=0x...&marketPhase=internal-market`
- DEX-listed action gating with `http://localhost:3000/example?tokenAddress=0x...&vaultAddress=0x...&factoryAddress=0x...&marketPhase=dex-listed`
- no-factory single-Vault matching with `http://localhost:3000/example?tokenAddress=0x...&vaultAddress=0x...&marketPhase=internal-market`
- taxinfo host context with `http://localhost:3000/example?tokenAddress=0x...&vaultAddress=0x...&factoryAddress=0x...&taxInfo=1&marketBps=10000&vaultType=myVault&marketPhase=internal-market`
- live Community Approved Buyback flow with `http://localhost:3000/community-buyback-example`
- live FLAPixel NFT flow with `http://localhost:3000/flapixel-example`
- wrong-network warnings and chain switching on write-capable real examples

The two live routes above are reviewed real examples, not neutral fixtures. Their chain state can move over time, but they are still part of the default regression spine now. The live smoke script checks both routes plus their host-presentation proxy responses:

```bash
yarn preview:smoke:real
```

These shell elements are preview-only and are not part of the packaged Vault source. Implement the Vault body below `Vault Information`; do not duplicate token/header chrome or a host-provided top summary block inside `Component.tsx`.

## 3. Create Your Vault Folder

Recommended for AI agents and repeatable local setup:

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 97 --factory 0xTestnetFactory --token 0xReal7777TestToken --chain 56 --factory 0xMainnetFactory --locales en,zh
```

This creates the strict four-file package, generates `manifest.artifactId`, and registers `my-vault` in `src/vaults/index.ts`. Use a real deployed ERC20 test token ending in `7777` for package proof and keep the final real mainnet factory binding in the same manifest. In factory mode, `tokenAddresses` is not the production CA restriction; Workbench/registry owns `caRestrictionMode`.

`my-vault` is the folder name. It becomes both the source folder and the preview route. Folder names must use 3-64 characters of lowercase kebab-case: letters/numbers separated by single hyphens. Do not use spaces, underscores, uppercase letters, leading/trailing hyphens, or nested folders.

`artifactId` is the unique artifact identity in the form `vaultui_<folder-name>_<ULID>`. `vault:scaffold` generates it automatically. The `match` block stays in the manifest as the deployment binding declaration for this shared UI package.

Manual shape:

```plain text
src/vaults/my-vault/
  Component.tsx
  manifest.json
  VaultABI.ts
  i18n.json
```

The Vault folder is strict. Do not add extra source files, nested folders, local assets, README files, or other documents under `src/vaults/my-vault`. The file set is fixed to `Component.tsx`, `manifest.json`, `VaultABI.ts`, and `i18n.json`.

If those four files already exist because an Agent generated them from a manifest first, register the local preview route with:

```bash
yarn vault:register my-vault
```

This updates `src/vaults/index.ts` with the static import mapping that lets `/my-vault` load the component. It is only local preview wiring, not production registry or publish state.

To remove the local preview wiring for a folder (for example after deleting an experiment), run:

```bash
yarn vault:register my-vault --remove
```

This only deregisters the preview mapping in `src/vaults/index.ts`; it does not delete the `src/vaults/my-vault` files.

For local preview, use real wallet and contract data. Pass real addresses through URL params such as `chainId`, `factoryAddress`, `tokenAddress`, and `vaultAddress`. Binding resolution is conservative: preview prefers an exact `chainId + factoryAddress` match for factory mode, or `chainId + vaultAddress` plus optional `tokenAddress` for no-factory mode. It falls back to partial hints only when unambiguous, and uses the first manifest binding only when the route provides no runtime hints at all. On supported preview chains, `chainId + tokenAddress` now triggers real `Portal.getTokenV7` reads and, when available, the matching tax helper / VaultPortal reads that fill `context.host`. When those live reads expose a token/Vault factory or Vault address, the active runtime target must match `manifest.match.bindings`; mismatches make the preview token unavailable and the Vault component does not render. The preview host also calls the same-origin `/api/runtime/token-presentation` route so it can read host-owned token image/name/symbol data without leaking protected backend headers in the browser. The preview panel and params like `marketPhase`, `isListed`, `status`, `tokenStatusCode`, `marketBps`, `feeMode`, `vaultType`, and `renderSurface` are explicit overrides for self-test, not the default path. In the panel, `Real` restores the live host phase and `Internal` / `Listing` apply temporary overrides; `unknown` can still appear in runtime readout when host data is unavailable, but it is not a main tab. `taxInfo=1` is mainly a fixture seed for neutral preview routes or unsupported chains. The shell header automatically reads ERC20 `symbol()` / `name()` from `tokenAddress` when host presentation is unavailable, shows the current token address, and reserves `/logo.png` for the neutral preview fixture only.

## 4. Implement UI

Use:

- `@/src/sdk` for runtime capability.
- `erc20Abi` or `standardErc20Abi` from `@/src/sdk` for normal ERC20 balance, allowance, approval, decimals, symbol, transfer, and transferFrom flows.
- `@/src/ui` for Flap UI primitives.
- `lucide-react` for icons before ad hoc SVG. Search the official Lucide icon library first: `https://lucide.dev/icons/` (main site: `https://lucide.dev/`).
- `./VaultABI` as the only allowed local relative import.
- `manifest.json` for required `artifactId`, match fields, i18n, at least one binding-scoped real `7777`-suffix `tokenAddresses` entry per manifest for Workbench/E2E testing, optional per-binding `externalContracts`, optional `layout: "fullscreen"` only when Flap explicitly asks for a full-screen Vault body, optional non-oracle endpoints, and optional reviewed `externalFrames`. Each binding needs `chainId` plus either non-zero `factoryAddress`, exactly one non-zero `vaultAddresses` entry when there is no factory, or token-only binding via `tokenAddresses`; production CA restriction is Workbench/registry `caRestrictionMode`, not a manifest field.

Do not copy standard ERC20 ABI into `VaultABI.ts`. Add token ABI fragments there only when a token has custom non-standard methods or a special mechanism.

Do not reimplement Flap's taxinfo page preflight in the Vault component. The host provides token info, parsed tax info, VaultPortal info, fee mode, render surface, and registry-selected Vault type in `context.host`. For component code, prefer the public SDK helper `readTaxVaultHostContext(context.host)` so every Vault reads the same normalized host shape.
Use `context.host?.marketPhase` or the normalized `readTaxVaultHostContext(context.host).marketPhase` for token phase checks. The current template preview host provides this API for local self-test, and the production Flap host injects equivalent context. The host maps existing tokens with `tokenInfo.status < 2` to `internal-market`, existing tokens with `tokenInfo.status >= 2` to `dex-listed`, and missing token info to `unknown`. Custom Vault UI in this template targets the tax-token path, so the main public SDK fields are `marketPhase`, `isListed`, and the host-injected token metadata; `readTaxVaultHostContext(context.host).isSupportedCustomVaultToken` remains available when the host wants to assert that it resolved a tax token. `tokenAddress` alone does not create token lifecycle state in preview; it only fills token symbol/name/image. Use `isActionAvailableForPhase(...)` for stage-gated buttons and keep unavailable buttons visible with clear copy.
Wrong-network handling is separate from market-phase handling. Use `sdk.wallet.isWrongNetwork` to keep write buttons visible but disabled, then prompt `sdk.wallet.switchChain()` or show a clear switch-network state before any write.
Do not fetch private token metadata or image APIs from the Vault component. If token media is needed, read `context.tokenImageUrl`, `context.tokenName`, and `context.tokenSymbol`; the template preview shell now injects these host values through the same-origin runtime proxy when available, then falls back to on-chain ERC20 metadata. Production Flap host should inject equivalent data.

For a Vault-specific immutable image that cannot come from host token media, use CID-only `IpfsImage`. Upload and pin the image outside the Vault UI package. Prefer the Flap token metadata upload API from [Launch token through Portal](https://docs.flap.sh/flap/developers/token-launcher-developers/launch-token-through-portal#id-1-prepare-token-metadata) when the image must be available through Flap's gateway rather than a developer's personal Pinata gateway. Call `https://funcs.flap.sh/api/upload` outside the Vault package with the `create(file, meta)` mutation; the returned `data.create` is a metadata CID for Portal launch `meta`, not the `IpfsImage` value. Fetch that metadata JSON and read its `image` field; from an `image` value such as `https://.../ipfs/<imageCid>` or `ipfs://<imageCid>`, keep only `<imageCid>`. Do not use the metadata CID as the image CID.

Minimal image upload example:

```bash
curl -X POST "https://funcs.flap.sh/api/upload" \
  -F 'operations={"query":"mutation Create($file: Upload!, $meta: MetadataInput!) { create(file: $file, meta: $meta) }","variables":{"file":null,"meta":{"website":null,"twitter":null,"telegram":null,"description":"placeholder","creator":"0x0000000000000000000000000000000000000000"}}}' \
  -F 'map={"0":["variables.file"]}' \
  -F "0=@./logo.png;type=image/png"
```

Use real metadata values before a production token launch; placeholder social fields are only acceptable for a temporary image-pinning handoff.

```tsx
import { IpfsImage } from "@/src/ui";

<IpfsImage
  cid="bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq"
  alt={i18n.t("media.heroAlt")}
  className="aspect-[16/9] w-full rounded-md object-cover"
/>
```

Do not pass a full gateway URL, an `ipfs://` value, the metadata CID, a CSS `url(...)`, an `imageUrl` prop, or a runtime variable/expression into the image source. If a generator collects an `imageCid` from the user, emit it as the static string literal in the `cid` prop. `vault:check` resolves each CID through the allowed Flap IPFS gateways and blocks packaging unless at least one response is a real `image/*` asset. The Vault UI does not upload or pin images; it only reads and verifies the already-pinned image CID. Keep required host risk status before any large or visually prominent image.

Avoid external endpoints, resources, and frames. If a special non-oracle endpoint is unavoidable, declare it in `manifest.json` as a single absolute HTTPS URL string without username/password credentials or an array of those strings; it will enter Flap review and must be approved before publish. Direct `fetch(...)` targets must be static absolute HTTPS URLs covered by that declaration. If a display-only chart iframe is unavoidable, declare at most one entry in `manifest.externalFrames[]` and render it only through one `ReviewedFrame` from `@/src/ui`; providers are limited to TradingView, DexScreener, and CoinGecko Terminal/GeckoTerminal, and the `src` must be a complete static HTTPS URL with fixed query params. Oracle usage is detected by `vault:check` and provisioned by the Flap Artifact Workbench/runtime, not declared in the manifest. Declaration does not guarantee approval, and undeclared, host-relative, dynamic, HTTP, credentialed, raw iframe, or multiple `ReviewedFrame` usage is rejected.

Avoid fixed extra contract targets. If a component must call a fixed contract address that is not `context.tokenAddress`, `context.vaultAddress`, `context.factoryAddress`, or a binding-scoped token/Vault reference, declare it in the relevant binding:

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

Undeclared fixed contract targets are blocking `vault:check` issues.

Do not use direct wallet APIs, undeclared endpoints/resources/frames, undeclared fixed contract targets, raw iframe or `srcDoc`, `./helpers`, `../VaultABI`, nested component imports, local asset imports, or dynamic imports.

Keep all Vault component text in `i18n.json`. The local preview uses Flap's language preference keys (`flap:language` and `flap_language`) and passes the active locale into the SDK.

## 5. Check

```bash
yarn vault:check my-vault
```

Fix all blocking issues before submitting to Flap.

The check script returns JSON with `ok`, `summary`, `agent.verdict`, `agent.nextActions`, and `issues`. It blocks manifest locale strings shorter than two characters, missing locales declared by `manifest.i18n`, and missing keys across those declared locales. If the manifest declares only one valid locale, only that locale is validated. It also reports oracle usage for Flap review/provisioning without requiring oracle config in `manifest.json`.

## 6. Package

```bash
yarn vault:e2e my-vault
yarn vault:package my-vault
yarn vault:verify-package dist/my-vault.zip
```

The E2E command runs deterministic PC / iPad / H5 Playwright checks for default, internal-market, DEX-listed, and wrong-network states, then writes `dist/e2e/my-vault/qa-report.json`. It checks DOM/layout/state rules directly and does not require AI image judgment. It must use a real deployed `7777`-suffix test token declared in manifest `match.bindings[].tokenAddresses`; local `--token 0x...` overrides are only for developer self-test and do not satisfy `vault:check` or Workbench intake.
On a first local run, especially on Windows, install Chromium once if Playwright reports a missing browser:

```bash
yarn playwright install chromium
```

The missing-browser failure is reported as machine-readable JSON code `vault-e2e/playwright-browser-missing`. CI installs Chromium with `npx playwright install --with-deps chromium`.
The package command runs `vault:check` first and rejects missing, failed, or stale E2E reports. Send the zip under `dist/` to the Flap Artifact Workbench after it passes.
The command output prints the generated zip location in `sourcePackagePath` and `sourcePackageAbsolutePath`.
Do not hand-zip files. `yarn vault:package` writes format `4` `flap-vault-package.json`, `runtimePackageGitHead`, `qa/e2e-report.json`, E2E summary, and hashes into the zip; the Flap Artifact Workbench should reject packages missing this script marker, proof, provenance, or matching hashes.
Run `yarn vault:verify-package dist/<folder-name>.zip` after packaging to check the marker, runtime npm provenance, expected file list, metadata, and hashes from the Workbench acceptance side.

If you changed shared runtime surfaces such as `src/sdk/*`, `src/ui/*`, the runtime proxy, or the host-runtime package boundary, also verify the shared runtime package:

```bash
yarn runtime:package
yarn runtime:verify-package
```

This writes a packable package to `dist/vault-runtime` with `sdk`, `ui`, `host`, and `server` subpath exports plus `runtime-contract.json`. Vault source should still author against `@/src/sdk` and `@/src/ui`; the runtime package is the host/Workbench convergence layer underneath those aliases.
The generated package includes the runtime-side oracle provisioning contract as well: `VaultRuntimeProvider` can take an `oracleReader`, `createLocalOracleReader()` targets `/api/runtime/oracle/{oracleId}`, and the server export carries the registry helpers for the same-origin proxy route. The template preview now includes built-in defaults for the example oracle flow, so local preview does not require user env setup just to exercise `sdk.readOracle(...)`.
In the current template, `dist/vault-runtime` is a local contract proof and is not automatically consumed by Workbench or `flap.sh` unless that integration is explicitly adopted.

`yarn ci` now includes full built-in example E2E/package/verify plus `yarn preview:smoke` and `yarn preview:smoke:real`, so changes to the runtime, reviewed live defaults, host-presentation path, and responsive Vault layouts are covered by the default validation loop.
V1 E2E proof is a source-hash-bound layout/state proof. It is not a cryptographic proof that a future wallet write was initiated by the developer's local UI; strong write-UI origin assurance requires a platform-controlled Playwright + wallet runner.
