# From Zero To A Verified Vault UI Zip

Use this walkthrough when the developer is new to the template or is using an AI Agent to write the Vault UI.

The goal is not to understand every internal rule by hand. The goal is to give the Agent accurate Vault requirements, keep the source package inside the template boundary, test the result locally, and hand off only a verified zip.

## What You Must Provide

Before asking an Agent to build anything, collect these inputs:

| Input | Example | Why it matters |
| --- | --- | --- |
| Folder name | `my-vault` | Creates `src/vaults/my-vault` and preview route `/my-vault`. |
| Display name | `My Vault UI` | Written to `manifest.json` for Workbench display. |
| Binding target | `chainId 56 + factory 0x...` or `chainId 56 + vault 0x...` | Controls which runtime Vault can use this UI. |
| Optional token address | `0x...` | Useful for single-Vault preview and matching. |
| Minimal Vault ABI | `function claim()`, `function info(address)` | The UI can only call methods it knows. |
| Reads and writes | `info`, `deposit`, `claim` | Defines the actual business workflow. |
| Approval spender | Usually `context.vaultAddress` | Required for token approval flows. |
| Action stage | `internal-market`, `dex-listed`, `both`, or `read-only` | Prevents wrong-phase buttons from silently disappearing. |
| Risk posture | `verified`, `review-required`, `unverified`, or `high-risk` | Helps the UI explain risk clearly. |
| Preview addresses | token, Vault, factory when available | Needed before read/write behavior can be treated as tested. |

If you do not know the contract methods, binding target, or action stage, stop and ask the contract owner first. Do not ask the Agent to guess.

## Step 1: Install And Open Preview

```bash
yarn
yarn dev
```

Open a built-in example first:

```plain text
http://localhost:3000/action-gallery-example
```

This confirms the template runs before custom logic is introduced.

## Step 2: Create The Package

Factory-scoped UI:

```bash
yarn vault:scaffold my-vault \
  --name "My Vault UI" \
  --chain 56 --factory 0xFactoryAddressRequired \
  --locales en,zh
```

Single-Vault UI without a factory:

```bash
yarn vault:scaffold my-vault \
  --name "My Vault UI" \
  --chain 56 --vault 0xVaultAddressRequired \
  --token 0xTokenAddressIfNeeded \
  --locales en,zh
```

Replace placeholder addresses with real deployment addresses before running scaffold.

`vault:scaffold` creates the four-file package and registers the preview route. Do not add helper files, assets, nested folders, or extra local imports.

## Step 3: Give The Agent A Complete Prompt

If the Agent can read this repository, start with:

```text
Read agent-contract.json, AGENTS.md, docs/ai-agent.md, docs/agent-entrypoints.md, docs/ui-pattern-snippets.md, and docs/from-zero-vault-ui.md before editing.

Build a controlled Flap Vault UI for:
- folder name:
- display name:
- binding target:
- locales:
- action stage:
- risk posture:
- Vault ABI methods:
- primary reads:
- primary writes:
- approval spender:
- native value rules:
- refetch points:
- empty/error states:
- preview URL addresses:

Use only the four files under src/vaults/{folder-name}. Keep visible copy in i18n.json. Use @/src/sdk and @/src/ui. Use `lucide-react` icons from https://lucide.dev/icons/ before ad hoc SVG. Do not rebuild the host token header, do not call private token metadata APIs, do not add external navigation, and do not add undeclared endpoints, external frames, or fixed contract targets. Raw iframe is blocked; reviewed display-only chart embeds must use `manifest.externalFrames` plus `ReviewedFrame`.

After editing, run yarn vault:check {folder-name}, yarn vault:package {folder-name}, and yarn vault:verify-package dist/{folder-name}.zip. Do not call the work done until those pass.
```

If the Agent cannot read local files, generate a context pack:

```bash
yarn --silent vault:ai-context action-gallery-example > vault-ai-context.md
```

Paste `vault-ai-context.md` into the web AI chat, then send the prompt above with your real inputs.

## Step 4: Keep The First UI Boring

For the first version, keep the scaffolded default surface and replace placeholders with real data. The preferred default is a compact embedded business card, not a dashboard full of sample widgets.

- Use one mechanism summary near the top.
- Show two or three Vault-specific metrics, not every possible contract field.
- Keep one primary action area visible. Include input, quote/proof state, warnings, and the approve/write button there.
- Use `context.host?.marketPhase` and `isActionAvailableForPhase(...)` for phase gating.
- Read current risk status from `readTaxVaultHostContext(context.host)`, place it within the first three visible Vault-specific business rows/blocks and before any preview, hero, banner, showcase, media, chart, or large visual block, and render a prominent warning if it is missing.
- Do not add manual `Low risk` / `低风险` labels; low-risk copy is allowed only when selected from host `riskLevel === 1`.
- Use the host token name, symbol, and image from `context.tokenName`, `context.tokenSymbol`, and `context.tokenImageUrl`.
- Use `sdk.wallet.isWrongNetwork` and `sdk.wallet.switchChain()` before writes.
- Use `context.vaultAddress`, `context.tokenAddress`, and `context.factoryAddress` instead of hardcoded transaction targets.

Avoid decorative hero sections, old example-dashboard layout, third-party images, private API calls, custom token metadata fetches, and routes away from the active chain explorer.

## Step 5: Preview With Real Runtime Hints

Open the generated route:

```plain text
http://localhost:3000/my-vault
```

When you have real addresses, pass them as query params:

```plain text
http://localhost:3000/my-vault?chainId=56&factoryAddress=0x...&tokenAddress=0x...&vaultAddress=0x...
```

Check these before packaging:

- The page renders under the host-owned `Vault Information` frame.
- The component does not duplicate the token breadcrumb, token header, close control, or shell summary.
- Risk status is visible within the first three business UI rows/blocks and before any preview, hero, banner, showcase, media, chart, or large visual block.
- Missing risk status shows a warning.
- English and Chinese copy both render if both locales are declared.
- Wrong-network state blocks writes.
- Market phase gating is visible in `Real`, `Internal`, and `Listing` preview modes when relevant.
- Oracle or proof failures show an unavailable state instead of a broken button.
- Every write path has a clear refetch point after success.

## Step 6: Validate And Package

Run the commands in order:

```bash
yarn vault:check my-vault
yarn vault:package my-vault
yarn vault:verify-package dist/my-vault.zip
```

If a command fails, read the JSON fields:

- `code`
- `fixHint`
- `agent.nextActions`

Fix those items before retrying. Do not retry the same command without changing the source.

## Step 7: Handoff

Send only the generated zip and the validation summary:

```plain text
folderName:
sourcePackagePath:
sha256:
commands passed:
openItems:
```

The package is not ready if:

- It was zipped by hand.
- `yarn vault:check` did not pass.
- `yarn vault:verify-package dist/{folder-name}.zip` did not pass.
- The UI was not opened locally.
- The oracle, proof, read, or write path was never tested.
- The UI hides unavailable actions instead of explaining why they are disabled.
- The component does not render host risk status within the first three business UI rows/blocks or places it after a preview, hero, banner, showcase, media, chart, or large visual block.
- The Vault folder contains anything beyond `Component.tsx`, `manifest.json`, `VaultABI.ts`, and `i18n.json`.
