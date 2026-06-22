# Web AI Copy Pack

Use this guide when the AI assistant does not have direct repository access, such as web-based ChatGPT or Claude. The goal is to give the AI enough local context before it designs or generates a Vault UI.

## Fast Path

From this repository, generate one Markdown context pack:

```bash
yarn --silent vault:ai-context > vault-ai-context.md
```

Then paste `vault-ai-context.md` into the web AI chat.

If you want the script to write the file directly:

```bash
yarn vault:ai-context --out vault-ai-context.md
```

The generated pack may include `action-gallery-example` when no example is specified, but that file is only a secondary behavior reference for action states. The visual default is always the scaffold default surface in `docs/ui-pattern-snippets.md`.

List available examples:

```bash
yarn vault:ai-context --list-examples
```

## Manual File Checklist

If you cannot run the script, paste these files into the AI chat in one batch:

```plain text
README.md
AGENTS.md
agent-contract.json
docs/ai-agent.md
docs/agent-entrypoints.md
docs/agent-intake-template.md
docs/from-zero-vault-ui.md
docs/ui-pattern-snippets.md
skills/flap-vault-ui-generator/SKILL.md
```

Then paste exactly one reference package:

```plain text
src/vaults/{example-folder}/Component.tsx
src/vaults/{example-folder}/manifest.json
src/vaults/{example-folder}/VaultABI.ts
src/vaults/{example-folder}/i18n.json
```

## Which Example To Choose

- `action-gallery-example`: secondary behavior reference for unclear action-stage requirements; shows internal-market, DEX-listed, both-stage, and read-only action states.
- `example`: reward/oracle pattern with approve, simulate, write, claim, and refetch.
- `dex-listed-example`: DEX-listed-only stage gate with visible disabled state before listing.
- `community-buyback-example`: live governance, reserve, or buyback-style reference.
- `flapixel-example`: live NFT vault reference.

Do not treat example addresses as endorsements or production binding instructions. For a real Vault UI, collect the actual chain/factory bindings and preview addresses from the user.
Do not copy the built-in examples' visual layout as the default. They are state-flow references; new UIs must start from the scaffold default surface and the snippets in `docs/ui-pattern-snippets.md`.

Hard visual rule: the first screen should be one compact business card with a mechanism/status header, at most one small metric strip, one primary action panel, and runtime details pushed lower. Do not generate row-heavy dashboard stacks such as overview cards plus dividend cards plus staking cards before the action.

If the user gives an external visual reference such as 涅槃, translate it into section hierarchy, density, spacing, and interaction emphasis only. Rebuild with this template's SDK/UI primitives and do not copy private code, constants, addresses, endpoints, or assets.

## First Prompt

Send this after the context pack:

```text
You are a Flap Vault UI generation agent. I pasted a local context pack from flap-vault-ui-template, including the core docs and one selected reference example.

Before writing code:
1. Summarize the strict Vault folder boundary, manifest rules, safety boundaries, and validation commands you must follow.
2. Use docs/agent-intake-template.md to ask me for missing inputs and docs/from-zero-vault-ui.md as the from-zero validation flow.
3. Confirm which reference example is closest to my use case and why.
4. Use the scaffold default surface / docs/ui-pattern-snippets.md as the visual default; it wins over any selected example. Use examples for behavior only, not for visual styling.
5. Confirm actionAvailabilityStage as one of internal-market, dex-listed, both, or read-only.
6. After inputs are complete, generate only the allowed four Vault files: Component.tsx, manifest.json, VaultABI.ts, and i18n.json.
7. Keep the first screen to one compact business card, at most one small metric strip, one primary action panel, and lower compact runtime details. Do not generate row-heavy overview/dividend/staking dashboard stacks.
8. If the user provides an external visual reference such as 涅槃, extract section hierarchy, density, spacing, and interaction emphasis only; do not copy private code, constants, addresses, endpoints, or assets.
9. Keep all user-facing copy in i18n.json, include every locale declared in manifest.i18n, use `lucide-react` icons from `https://lucide.dev/icons/` before ad hoc SVG, and do not add helper files, assets, external navigation, undeclared endpoints/frames, direct wallet APIs, or private Flap code. Raw iframe is blocked; the only reviewed frame path is one `manifest.externalFrames` entry plus one `ReviewedFrame` for a static display-only TradingView, DexScreener, or CoinGecko Terminal chart URL.
10. Do not call the package ready until yarn vault:check, yarn vault:e2e, yarn vault:package, and yarn vault:verify-package pass for the target folder. `vault:e2e` is deterministic Playwright DOM/layout/state checking bound to a manifest-declared test token, not AI image judgment; first-time local or Windows machines may need `yarn playwright install chromium` if the JSON error code is `vault-e2e/playwright-browser-missing`.

If anything is missing or unsafe, stop and ask questions instead of guessing. Answer in the language I use.
```

## Follow-Up Instruction

After the AI asks intake questions, answer with concrete inputs:

- Folder name
- Display name
- Binding mode and target for each deployment: chain + factory, or chain + Vault without factory
- Locales
- Action availability stage
- Minimal Vault ABI methods
- Primary reads and writes
- Approval spender
- Empty/error states
- Risk posture
- Preview token, Vault, and factory addresses when available; omit factory for no-factory mode

Never paste private `flap.sh` business code, secrets, private endpoints, or project-specific private configuration into a web AI chat.
