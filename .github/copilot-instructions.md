# GitHub Copilot Workspace Instructions

This repository is a public template for controlled Flap Vault UI packages. Read the agent contract before generating or editing any Vault code.

## Required Reading Order

1. `agent-contract.json` — machine-readable workflow contract
2. `AGENTS.md` — strict Vault rules and package boundary
3. `docs/ai-agent.md` — comprehensive implementation guide
4. `docs/agent-entrypoints.md` — canonical entrypoint map for tools and humans
5. `docs/ui-pattern-snippets.md` — public-safe UI patterns (read before implementing Component.tsx)
6. `skills/flap-vault-ui-generator/SKILL.md` — generator skill with implementation checklist

## Core Rules

- Use `yarn` as the package manager.
- A Vault package lives under `src/vaults/{folder-name}` and may contain only four files: `Component.tsx`, `manifest.json`, `VaultABI.ts`, and `i18n.json`.
- Create new Vault packages with `yarn vault:scaffold <folder-name> --chain 56 --factory 0x...` for factory mode, or `yarn vault:scaffold <folder-name> --chain 56 --vault 0x... [--token 0x...]` for single-Vault mode without a factory.
- If the four files already exist, register with `yarn vault:register <folder-name>`.
- Do not add helper files, nested components, assets, or extra folders inside `src/vaults/{folder-name}`.
- Use `@/src/sdk` for runtime context, contract reads/writes, oracle, i18n, formatting, and tx errors.
- Use `@/src/ui` for shared UI primitives.
- The only allowed local relative import is `./VaultABI`.
- Prefer CSS/HTML card shapes and `lucide-react` icons before ad hoc SVG; search the official Lucide icon library first: `https://lucide.dev/icons/` (main site: `https://lucide.dev/`). FontAwesome is allowed only when the host/runtime explicitly includes and allows it.
- Handwritten inline SVG JSX must stay static and graphic-only: no scripts, event attributes, `foreignObject`, `image`, `use`, external URLs, non-local `url(...)`, `style` `url(...)` / `@import`, `href` / `src` except static local fragments, spread attributes, or unsupported nodes.
- Use `context.host?.marketPhase` and `isActionAvailableForPhase(...)` for internal-market vs DEX-listed action gating.
- In preview, a supported `chainId + tokenAddress` triggers the public SDK chain-read path for token metadata and real Portal/helper/VaultPortal host state. Use `marketPhase`, `isListed`, `status`, or `tokenStatusCode` only when you intentionally need to override action-stage behavior.
- Use `context.tokenImageUrl`, `context.tokenName`, and `context.tokenSymbol` for token media. The template preview shell first asks the same-origin runtime proxy for host-owned token presentation data, then falls back to on-chain ERC20 `symbol()` / `name()`; `/logo.png` is reserved for the neutral preview fixture only. Do not call private token metadata APIs from Vault source.
- Declare fixed non-token/non-Vault/non-factory contract targets only under `match.bindings[].externalContracts` with `address` and `label`; undeclared fixed targets fail `vault:check`.
- If a deployment needs a token CA list, declare it only as `match.bindings[].tokenAddresses`; in no-factory mode this may be the token-scoped target and may contain multiple token CAs. Do not add global CA policy fields.
- All user-facing copy must be in `i18n.json` for every locale declared by `manifest.i18n`.
- Treat every Vault CLI failure as JSON. Read `code`, `fixHint`, and `agent.nextActions` before retrying.

## Validation Before Handoff

Run in order:

```bash
yarn vault:check <folder-name>     # fix all blocking issues first
yarn vault:e2e <folder-name>       # produces dist/e2e/<folder-name>/qa-report.json
yarn vault:package <folder-name>   # only after zero blocking issues and passing E2E
yarn vault:verify-package dist/<folder-name>.zip
```

For code-base changes: `yarn ci`, which includes full PC / iPad / H5 E2E for built-in examples.

## Forbidden

- `window.ethereum`, `eval`, the `Function` constructor, raw iframe, iframe `srcDoc`, script injection including `document.write` / `document.writeln`, dynamic import, CommonJS `require(...)`, or symlinks. The single reviewed display-only chart frame must use `manifest.externalFrames` plus one `ReviewedFrame`.
- Unsafe inline SVG JSX
- Undeclared, host-relative, dynamic, HTTP, credentialed, aliased, destructured, or computed browser-global `fetch(...)`
- Browser storage/navigation/worker/cross-context/permission APIs and direct browser network/media APIs
- Undeclared hardcoded EVM addresses in Vault source
- Standard ERC20 ABI in `VaultABI.ts` — use `erc20Abi` from `@/src/sdk`
- `wagmi`, `ethers`, `axios`, `next/image`, `framer-motion`, `recharts` as direct Vault imports
- Fields `chainIds`, `id`, `owner`, `version`, `sdkVersion`, `actions`, `oracles`, `media`, `fallback`, `contracts`, `restrictTokenAddresses`, global `tokenAddresses`, or `caPolicy` in `manifest.json` — chain IDs and optional reference token/external-contract lists live inside `match.bindings` entries

If anything here conflicts with `agent-contract.json` or `docs/ai-agent.md`, follow those files and update this one.
