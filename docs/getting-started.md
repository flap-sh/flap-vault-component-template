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
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --factory 0x1000000000000000000000000000000000000001 --locales en,zh
```

This creates the strict four-file package, generates `manifest.artifactId`, and registers `my-vault` in `src/vaults/index.ts`.

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

For local preview, use real wallet and contract data. Pass real addresses through URL params such as `chainId`, `factoryAddress`, `tokenAddress`, and `vaultAddress`. Binding resolution is conservative: preview prefers an exact `chainId + factoryAddress` match, falls back to a single-field hint only when it is unambiguous, and uses the first manifest binding only when the route provides no runtime hints at all. On supported preview chains, `chainId + tokenAddress` now triggers real `Portal.getTokenV7` reads and, when available, the matching tax helper / VaultPortal reads that fill `context.host`. The preview host also calls the same-origin `/api/runtime/token-presentation` route so it can read host-owned token image/name/symbol data without leaking protected backend headers to the browser. The preview panel and params like `marketPhase`, `isListed`, `status`, `tokenStatusCode`, `marketBps`, `feeMode`, `vaultType`, and `renderSurface` are explicit overrides for self-test, not the default path. In the panel, `Real` restores the live host phase and `Internal` / `Listing` apply temporary overrides; `unknown` can still appear in runtime readout when host data is unavailable, but it is not a main tab. `taxInfo=1` is mainly a fixture seed for neutral preview routes or unsupported chains. The shell header automatically reads ERC20 `symbol()` / `name()` from `tokenAddress` when host presentation is unavailable, shows the current token address, and reserves `/logo.png` for the neutral preview fixture only.

## 4. Implement UI

Use:

- `@/src/sdk` for runtime capability.
- `erc20Abi` or `standardErc20Abi` from `@/src/sdk` for normal ERC20 balance, allowance, approval, decimals, symbol, transfer, and transferFrom flows.
- `@/src/ui` for Flap UI primitives.
- `./VaultABI` as the only allowed local relative import.
- `manifest.json` for required `artifactId`, match fields, i18n, optional per-binding `tokenAddresses`, optional per-binding `externalContracts`, and optional non-oracle endpoints.

Do not copy standard ERC20 ABI into `VaultABI.ts`. Add token ABI fragments there only when a token has custom non-standard methods or a special mechanism.

Do not reimplement Flap's taxinfo page preflight in the Vault component. The host provides token info, parsed tax info, VaultPortal info, fee mode, render surface, and registry-selected Vault type in `context.host`. For component code, prefer the public SDK helper `readTaxVaultHostContext(context.host)` so every Vault reads the same normalized host shape.
Use `context.host?.marketPhase` or the normalized `readTaxVaultHostContext(context.host).marketPhase` for token phase checks. The current template preview host provides this API for local self-test, and the production Flap host injects equivalent context. The host maps existing tokens with `tokenInfo.status < 2` to `internal-market`, existing tokens with `tokenInfo.status >= 2` to `dex-listed`, and missing token info to `unknown`. Custom Vault UI in this template targets the tax-token path, so the main public SDK fields are `marketPhase`, `isListed`, and the host-injected token metadata; `readTaxVaultHostContext(context.host).isSupportedCustomVaultToken` remains available when the host wants to assert that it resolved a tax token. `tokenAddress` alone does not create token lifecycle state in preview; it only fills token symbol/name/image. Use `isActionAvailableForPhase(...)` for stage-gated buttons and keep unavailable buttons visible with clear copy.
Wrong-network handling is separate from market-phase handling. Use `sdk.wallet.isWrongNetwork` to keep write buttons visible but disabled, then prompt `sdk.wallet.switchChain()` or show a clear switch-network state before any write.
Do not fetch private token metadata or image APIs from the Vault component. If token media is needed, read `context.tokenImageUrl`, `context.tokenName`, and `context.tokenSymbol`; the template preview shell now injects these host values through the same-origin runtime proxy when available, then falls back to on-chain ERC20 metadata. Production Flap host should inject equivalent data.

Avoid external endpoints and external resources. If a special non-oracle endpoint is unavoidable, declare it in `manifest.json` as a single absolute HTTPS URL string without username/password credentials or an array of those strings; it will enter Flap review and must be approved before publish. Direct `fetch(...)` targets must be static absolute HTTPS URLs covered by that declaration. Oracle usage is detected by `vault:check` and provisioned by the Flap Artifact Workbench/runtime, not declared in the manifest. Declaration does not guarantee approval, and undeclared, host-relative, dynamic, HTTP, or credentialed fetch targets are rejected.

Avoid fixed extra contract targets. If a component must call a fixed contract address that is not `context.tokenAddress`, `context.vaultAddress`, `context.factoryAddress`, or a binding-scoped token/Vault reference, declare it in the relevant binding:

```json
{
  "chainId": 56,
  "factoryAddress": "0x1000000000000000000000000000000000000001",
  "externalContracts": [
    {
      "address": "0x4000000000000000000000000000000000000004",
      "label": "Reward distributor"
    }
  ]
}
```

Undeclared fixed contract targets are blocking `vault:check` issues.

Do not use direct wallet APIs, undeclared endpoints/resources, undeclared fixed contract targets, `./helpers`, `../VaultABI`, nested component imports, local asset imports, or dynamic imports.

Keep all Vault component text in `i18n.json`. The local preview uses Flap's language preference keys (`flap:language` and `flap_language`) and passes the active locale into the SDK.

## 5. Check

```bash
yarn vault:check my-vault
```

Fix all blocking issues before submitting to Flap.

The check script returns JSON with `ok`, `summary`, `agent.verdict`, `agent.nextActions`, and `issues`. It blocks missing locales declared by `manifest.i18n` and missing keys across those declared locales. If the manifest declares only one locale, only that locale is validated. It also reports oracle usage for Flap review/provisioning without requiring oracle config in `manifest.json`.

## 6. Package

```bash
yarn vault:package my-vault
yarn vault:verify-package dist/my-vault.zip
```

The package command runs `vault:check` first. Send the zip under `dist/` to the Flap Artifact Workbench after it passes.
The command output prints the generated zip location in `sourcePackagePath` and `sourcePackageAbsolutePath`.
Do not hand-zip files. `yarn vault:package` writes `flap-vault-package.json`, `runtimePackageGitHead`, and hashes into the zip; the Flap Artifact Workbench should reject packages missing this script marker, provenance, or matching hashes.
Run `yarn vault:verify-package dist/<folder-name>.zip` after packaging to check the marker, runtime npm provenance, expected file list, metadata, and hashes from the Workbench acceptance side.

If you changed shared runtime surfaces such as `src/sdk/*`, `src/ui/*`, the runtime proxy, or the host-runtime package boundary, also verify the shared runtime package:

```bash
yarn runtime:package
yarn runtime:verify-package
```

This writes a packable package to `dist/vault-runtime` with `sdk`, `ui`, `host`, and `server` subpath exports plus `runtime-contract.json`. Vault source should still author against `@/src/sdk` and `@/src/ui`; the runtime package is the host/Workbench convergence layer underneath those aliases.
The generated package includes the runtime-side oracle provisioning contract as well: `VaultRuntimeProvider` can take an `oracleReader`, `createLocalOracleReader()` targets `/api/runtime/oracle/{oracleId}`, and the server export carries the registry helpers for the same-origin proxy route. The template preview now includes built-in defaults for the example oracle flow, so local preview does not require user env setup just to exercise `sdk.readOracle(...)`.
In the current template, `dist/vault-runtime` is a local contract proof and is not automatically consumed by Workbench or `flap.sh` unless that integration is explicitly adopted.

`yarn ci` now includes both `yarn preview:smoke` and `yarn preview:smoke:real`, so changes to the runtime, reviewed live defaults, or host-presentation path are covered by the default validation loop.
