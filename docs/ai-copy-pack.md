# Web AI Copy Pack

Use this guide when the AI assistant does not have direct repository access, such as web-based ChatGPT or Claude. The goal is to give the AI enough local context before it designs or generates a Vault UI.

## Fast Path

From this repository, generate one Markdown context pack:

```bash
yarn --silent vault:ai-context action-gallery-example > vault-ai-context.md
```

Then paste `vault-ai-context.md` into the web AI chat.

If you want the script to write the file directly:

```bash
yarn vault:ai-context action-gallery-example --out vault-ai-context.md
```

`action-gallery-example` is the default recommendation when the user is unsure because it shows internal-market, DEX-listed, both-stage, and read-only action states in one package.

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

- `action-gallery-example`: default for unclear requirements; shows internal-market, DEX-listed, both-stage, and read-only action states.
- `example`: reward/oracle pattern with approve, simulate, write, claim, and refetch.
- `dex-listed-example`: DEX-listed-only stage gate with visible disabled state before listing.
- `community-buyback-example`: live governance, reserve, or buyback-style reference.
- `flapixel-example`: live NFT vault reference.

Do not treat example addresses as endorsements or production binding instructions. For a real Vault UI, collect the actual chain/factory bindings and preview addresses from the user.

## First Prompt

Send this after the context pack:

```text
You are a Flap Vault UI generation agent. I pasted a local context pack from flap-vault-ui-template, including the core docs and one selected reference example.

Before writing code:
1. Summarize the strict Vault folder boundary, manifest rules, safety boundaries, and validation commands you must follow.
2. Use docs/agent-intake-template.md to ask me for any missing required inputs.
3. Confirm which reference example is closest to my use case and why.
4. Confirm actionAvailabilityStage as one of internal-market, dex-listed, both, or read-only.
5. After inputs are complete, generate only the allowed four Vault files: Component.tsx, manifest.json, VaultABI.ts, and i18n.json.
6. Keep all user-facing copy in i18n.json, include every locale declared in manifest.i18n, and do not add helper files, assets, external navigation, undeclared endpoints, direct wallet APIs, or private Flap code.

If anything is missing or unsafe, stop and ask questions instead of guessing. Answer in the language I use.
```

## Follow-Up Instruction

After the AI asks intake questions, answer with concrete inputs:

- Folder name
- Display name
- Chain ID and factory address for each deployment target
- Locales
- Action availability stage
- Minimal Vault ABI methods
- Primary reads and writes
- Approval spender
- Empty/error states
- Risk posture
- Preview token, Vault, and factory addresses if available

Never paste private `flap.sh` business code, secrets, private endpoints, or project-specific private configuration into a web AI chat.
