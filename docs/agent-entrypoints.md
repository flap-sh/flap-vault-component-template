# Agent Entrypoints

This repository supports multiple AI coding agents through thin compatibility entry points.

Do not copy the full workflow into every Agent-specific file. Keep the source of truth in:

1. `agent-contract.json`
2. `AGENTS.md`
3. `docs/ai-agent.md`
4. `docs/agent-entrypoints.md`
5. `docs/ui-pattern-snippets.md`
6. `skills/flap-vault-ui-generator/SKILL.md`

## Supported Agents

| Agent | Entry Point | Purpose |
| --- | --- | --- |
| Codex and AGENTS-aware agents | `AGENTS.md` | Root project instructions and strict Vault rules. |
| Claude Code | `CLAUDE.md` | Claude Code project memory that routes to the source-of-truth files. |
| Gemini CLI | `GEMINI.md` | Gemini CLI project instructions that route to the source-of-truth files. |
| Windsurf | `.windsurfrules` | Windsurf IDE rules file applied to the whole project. |
| GitHub Copilot | `.github/copilot-instructions.md` | Copilot workspace instructions applied across the repository. |
| Cursor | `.cursor/rules/flap-vault-ui.mdc` | Versioned project rule that is always applied in Cursor. |
| Legacy Cursor | `.cursorrules` | Minimal fallback for older Cursor setups. |
| Generic coding agents | `README.md` then `docs/ai-agent.md` | Human-readable path when no tool-specific entry point is recognized. |
| Web-based AI without repo access | `docs/ai-copy-pack.md` or `yarn vault:ai-context` | Pasteable context pack for ChatGPT, Claude, and similar tools. |

## Required Startup Sequence

Every Agent should:

1. Read `agent-contract.json` — machine-readable contract, error codes, required inputs schema.
2. Read the tool-specific entry point listed above, if one exists — routing wrapper only.
3. Read `docs/ai-agent.md` — comprehensive implementation guide and workflow.
4. Read `docs/agent-entrypoints.md` — this entrypoint map and maintenance contract.
5. Read `docs/ui-pattern-snippets.md` before implementing `Component.tsx` — public-safe UI patterns.
6. Read `skills/flap-vault-ui-generator/SKILL.md` — generator skill with implementation checklist.

Then act:

7. Collect all required inputs using `docs/agent-intake-template.md` before generating.
8. Use `yarn` as the package manager.
9. Use `yarn vault:scaffold <folder-name> --chain 56 --factory 0x...` for new Vault packages.
10. Use `yarn vault:register <folder-name>` when the four Vault files already exist.
11. Run `yarn vault:check <folder-name>` and fix all blocking issues from `agent.nextActions`.
12. Run `yarn vault:package <folder-name>` only after blocking issues are zero.
13. Run `yarn vault:verify-package dist/<folder-name>.zip` before handoff.
14. Produce a done report using the fields in `agent-contract.json` `doneReport`.

## Reference Docs (Deep Dives)

These docs are not required reading for every task but are available for detail:

- `docs/manifest.md` — manifest field rules and ABI policy
- `docs/sdk.md` — full SDK surface and context fields
- `docs/safety-boundaries.md` — blocking and allowed behavior reference
- `docs/prd.md` — product scope, implemented acceptance criteria, and non-goals
- `docs/versioning.md` — when and how to increment each versioned surface
- `docs/artifact-intake.md` — Flap Artifact Workbench flow and storage contract
- `docs/runtime-module-contract.md` — shared runtime import/build/host contract for component packaging and execution
- `docs/getting-started.md` — human developer quick-start guide. Agents should treat it as supporting context and follow `agent-contract.json` / `docs/ai-agent.md` for required workflow gates.
- `docs/ai-copy-pack.md` — copy/paste context pack guide for web AI tools that cannot read local files.

## Error Recovery Contract

Vault CLI failures are machine-readable JSON:

```json
{
  "ok": false,
  "code": "rule/id",
  "error": "Human-readable failure",
  "fixHint": "Concrete fix direction",
  "agent": {
    "verdict": "fix-blocking",
    "nextActions": []
  }
}
```

Agents must parse `code`, `fixHint`, and `agent.nextActions`. Do not retry the same command until the listed blocking items are fixed.

## Maintenance Rule

When changing the Agent workflow, update the source-of-truth files first. Keep `CLAUDE.md`, `GEMINI.md`, `.windsurfrules`, `.github/copilot-instructions.md`, `.cursor/rules/flap-vault-ui.mdc`, and `.cursorrules` as short routing files only.
