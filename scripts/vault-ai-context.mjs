#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { failAgent } from "./agent-error.mjs";
import { REQUIRED_VAULT_FILES, isValidFolderName } from "./vault-registration.mjs";

const ROOT = process.cwd();
const DEFAULT_EXAMPLE = "example";
const REFERENCE_EXAMPLES = [DEFAULT_EXAMPLE, "dex-listed-example", "action-gallery-example", "community-buyback-example", "flapixel-example"];

const BASE_FILES = [
  "README.md",
  "AGENTS.md",
  "agent-contract.json",
  "docs/ai-agent.md",
  "docs/agent-entrypoints.md",
  "docs/agent-intake-template.md",
  "docs/from-zero-vault-ui.md",
  "docs/ui-pattern-snippets.md",
  "skills/flap-vault-ui-generator/SKILL.md",
];

const EXAMPLE_HINTS = {
  example: "default compact scaffold visual reference plus reward/oracle behavior with approve, simulate, write, claim, and refetch",
  "dex-listed-example": "DEX-listed-only action gate with visible disabled states before listing",
  "action-gallery-example": "secondary behavior reference when the user is unsure about action stages; shows internal-market, DEX-listed, both-stage, and read-only states",
  "community-buyback-example": "live governance or buyback-style vault reference",
  "flapixel-example": "live NFT vault reference",
};

function fail(message, { code = "ai-context/error", fixHint = "Read agent.nextActions and rerun the command after fixing the input.", nextActions, ...extra } = {}) {
  failAgent({ code, message, fixHint, nextActions, extra });
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.trim();
    const next = argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith("--") ? next : true);
    if (inlineValue === undefined && value === next) index += 1;
    parsed[key] = value;
  }
  return parsed;
}

function usage() {
  return `Usage:
  yarn --silent vault:ai-context [example-folder] > vault-ai-context.md
  yarn vault:ai-context [example-folder] --out vault-ai-context.md
  yarn vault:ai-context --list-examples

Defaults:
  example-folder: ${DEFAULT_EXAMPLE}
`;
}

function exampleFiles(exampleFolder) {
  return REQUIRED_VAULT_FILES.map((file) => `src/vaults/${exampleFolder}/${file}`);
}

function listExampleFolders() {
  return REFERENCE_EXAMPLES.filter((folderName) => REQUIRED_VAULT_FILES.every((file) => fs.existsSync(path.join(ROOT, "src", "vaults", folderName, file))));
}

function languageFor(filePath) {
  if (filePath.endsWith(".md")) return "markdown";
  if (filePath.endsWith(".json")) return "json";
  if (filePath.endsWith(".tsx")) return "tsx";
  if (filePath.endsWith(".ts")) return "ts";
  if (filePath.endsWith(".mjs") || filePath.endsWith(".js")) return "js";
  return "text";
}

function fenceFor(content) {
  const matches = content.match(/`+/g) ?? [];
  const maxTicks = matches.reduce((max, ticks) => Math.max(max, ticks.length), 0);
  return "`".repeat(Math.max(4, maxTicks + 1));
}

function fileSection(filePath) {
  const absolutePath = path.join(ROOT, filePath);
  const content = fs.readFileSync(absolutePath, "utf8").trimEnd();
  const fence = fenceFor(content);
  return `### ${filePath}

${fence}${languageFor(filePath)}
${content}
${fence}
`;
}

function promptTemplate(exampleFolder) {
  return `You are a Flap Vault UI generation agent. I pasted a local context pack from flap-vault-ui-template, including the core docs and the selected reference example: ${exampleFolder}.

The selected example is a secondary behavior reference only. When the developer does not explicitly request a visual style, the only visual default is the scaffold default surface / NiePan-style abstract template in docs/ui-pattern-snippets.md; it wins over any example component.

Before writing code:
1. Summarize the strict Vault folder boundary, manifest rules, safety boundaries, and validation commands you must follow.
2. Use docs/agent-intake-template.md to ask me for missing inputs and docs/from-zero-vault-ui.md as the from-zero validation flow.
3. Confirm which reference example is closest to my use case and why.
4. Use the scaffold default surface / NiePan-style abstract template from docs/ui-pattern-snippets.md as the visual default whenever I did not specify a UI style; use examples for behavior, not for visual styling.
5. Confirm actionAvailabilityStage as one of internal-market, dex-listed, both, or read-only.
6. Confirm testTokenAddresses separately from caRestrictionMode. Any manifest match.bindings[].tokenAddresses, including factory binding entries, must be real deployed ERC20 addresses ending in 7777; factory-mode tokenAddresses are package proof tokens, not production CA restrictions.
7. After inputs are complete, generate only the allowed four Vault files: Component.tsx, manifest.json, VaultABI.ts, and i18n.json.
8. Keep the first screen to one compact business card, at most one small metric strip, one primary action panel, and lower compact runtime details. Do not generate row-heavy overview/dividend/staking dashboard stacks.
9. If the user provides an external visual reference such as 涅槃, extract section hierarchy, density, spacing, and interaction emphasis only; do not copy private code, constants, addresses, endpoints, or assets.
10. Keep all user-facing copy in i18n.json, include every locale declared in manifest.i18n, and do not add helper files, assets, external navigation, undeclared endpoints, direct wallet APIs, or private Flap code.
11. Do not call the package ready until yarn vault:check, yarn vault:e2e, yarn vault:package, and yarn vault:verify-package pass for the target folder.

If anything is missing or unsafe, stop and ask questions instead of guessing. Answer in the language I use.`;
}

function buildContext(exampleFolder) {
  const files = [...BASE_FILES, ...exampleFiles(exampleFolder)];
  return `# Flap Vault UI AI Context Pack

This pack is for web-based AI tools that cannot read this repository directly. Paste the whole document into ChatGPT, Claude, or another coding assistant before asking it to design or generate a Vault UI.

Selected example: \`${exampleFolder}\`
Example purpose: ${EXAMPLE_HINTS[exampleFolder] ?? "custom Vault UI reference package"}
Visual default: scaffold default surface / NiePan-style abstract template from \`docs/ui-pattern-snippets.md\`. The selected example is behavior-only and must not override the default visual structure.

## First Message To Send

\`\`\`text
${promptTemplate(exampleFolder)}
\`\`\`

## Example Selection Guide

- \`example\`: default compact visual reference plus reward/oracle flows with approve, simulate, write, claim, and refetch.
- \`action-gallery-example\`: secondary behavior reference when the user is unsure about action stages; it shows internal-market, DEX-listed, both-stage, and read-only action states.
- \`dex-listed-example\`: use when writes should be unavailable until \`marketPhase=dex-listed\`.
- \`community-buyback-example\`: use for governance, reserve, or buyback-style vaults.
- \`flapixel-example\`: use for NFT vault flows.

Examples are behavior references, not the default visual style. If the developer does not explicitly request a UI style, start visual structure from the scaffold default surface / NiePan-style abstract template and the Default Scaffold Surface section in \`docs/ui-pattern-snippets.md\`. The first screen should be one compact business card with a small metric strip, one primary action panel, and lower runtime details, not a row-heavy dashboard stack.

## Files

${files.map(fileSection).join("\n")}
`;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help || parsed.h) {
    process.stdout.write(usage());
    return;
  }

  if (parsed["list-examples"]) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          defaultExample: DEFAULT_EXAMPLE,
          examples: listExampleFolders().map((folderName) => ({
            folderName,
            hint: EXAMPLE_HINTS[folderName] ?? "custom Vault UI reference package",
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  const exampleFolder = parsed._[0] ?? DEFAULT_EXAMPLE;
  if (!isValidFolderName(exampleFolder)) {
    fail("Example folder name must be lowercase kebab-case.", {
      code: "ai-context/invalid-example-folder",
      fixHint: "Pass a registered Vault example folder such as action-gallery-example, example, dex-listed-example, community-buyback-example, or flapixel-example.",
      exampleFolder,
    });
  }

  const files = [...BASE_FILES, ...exampleFiles(exampleFolder)];
  const missingFiles = files.filter((file) => !fs.existsSync(path.join(ROOT, file)));
  if (missingFiles.length) {
    fail("Cannot build AI context pack because required files are missing.", {
      code: "ai-context/missing-file",
      fixHint: "Run the command from the flap-vault-ui-template repository root and choose an example folder that contains the strict four Vault files.",
      exampleFolder,
      missingFiles,
      nextActions: missingFiles.map((file) => ({
        ruleId: "ai-context/missing-file",
        severity: "blocking",
        file,
        fixHint: "Restore this file or choose a different example folder.",
      })),
    });
  }

  const output = buildContext(exampleFolder);
  const outPath = parsed.out;
  if (outPath !== undefined) {
    if (outPath === true || !String(outPath).trim()) {
      fail("--out requires a file path.", {
        code: "ai-context/missing-output-path",
        fixHint: "Pass --out vault-ai-context.md or redirect stdout instead.",
      });
    }
    const absoluteOutPath = path.resolve(ROOT, String(outPath));
    if (fs.existsSync(absoluteOutPath) && !parsed.force) {
      fail(`Output file already exists: ${path.relative(ROOT, absoluteOutPath)}`, {
        code: "ai-context/output-exists",
        fixHint: "Pass a different --out path, delete the old file, or rerun with --force.",
        outputPath: absoluteOutPath,
      });
    }
    fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
    fs.writeFileSync(absoluteOutPath, output);
    console.log(
      JSON.stringify(
        {
          ok: true,
          exampleFolder,
          outputPath: absoluteOutPath,
          filesIncluded: files,
          nextAction: "Paste the generated Markdown into the web-based AI chat, then send the First Message To Send prompt.",
        },
        null,
        2,
      ),
    );
    return;
  }

  process.stdout.write(output);
}

main();
