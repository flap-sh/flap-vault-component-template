#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { failAgent } from "./agent-error.mjs";
import { REQUIRED_VAULT_FILES, isValidFolderName } from "./vault-registration.mjs";

const ROOT = process.cwd();
const DEFAULT_EXAMPLE = "action-gallery-example";
const REFERENCE_EXAMPLES = [DEFAULT_EXAMPLE, "example", "dex-listed-example", "community-buyback-example", "flapixel-example"];

const BASE_FILES = [
  "README.md",
  "AGENTS.md",
  "agent-contract.json",
  "docs/ai-agent.md",
  "docs/agent-entrypoints.md",
  "docs/agent-intake-template.md",
  "docs/ui-pattern-snippets.md",
  "skills/flap-vault-ui-generator/SKILL.md",
];

const EXAMPLE_HINTS = {
  example: "reward/oracle pattern with approve, simulate, write, claim, and refetch",
  "dex-listed-example": "DEX-listed-only action gate with visible disabled states before listing",
  "action-gallery-example": "default choice when the user is unsure; shows internal-market, DEX-listed, both-stage, and read-only states",
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

Before writing code:
1. Summarize the strict Vault folder boundary, manifest rules, safety boundaries, and validation commands you must follow.
2. Use docs/agent-intake-template.md to ask me for any missing required inputs.
3. Confirm which reference example is closest to my use case and why.
4. Confirm actionAvailabilityStage as one of internal-market, dex-listed, both, or read-only.
5. After inputs are complete, generate only the allowed four Vault files: Component.tsx, manifest.json, VaultABI.ts, and i18n.json.
6. Keep all user-facing copy in i18n.json, include every locale declared in manifest.i18n, and do not add helper files, assets, external navigation, undeclared endpoints, direct wallet APIs, or private Flap code.

If anything is missing or unsafe, stop and ask questions instead of guessing. Answer in the language I use.`;
}

function buildContext(exampleFolder) {
  const files = [...BASE_FILES, ...exampleFiles(exampleFolder)];
  return `# Flap Vault UI AI Context Pack

This pack is for web-based AI tools that cannot read this repository directly. Paste the whole document into ChatGPT, Claude, or another coding assistant before asking it to design or generate a Vault UI.

Selected example: \`${exampleFolder}\`
Example purpose: ${EXAMPLE_HINTS[exampleFolder] ?? "custom Vault UI reference package"}

## First Message To Send

\`\`\`text
${promptTemplate(exampleFolder)}
\`\`\`

## Example Selection Guide

- \`action-gallery-example\`: start here when the user is unsure; it shows internal-market, DEX-listed, both-stage, and read-only action states.
- \`example\`: use for reward/oracle flows with approve, simulate, write, claim, and refetch.
- \`dex-listed-example\`: use when writes should be unavailable until \`marketPhase=dex-listed\`.
- \`community-buyback-example\`: use for governance, reserve, or buyback-style vaults.
- \`flapixel-example\`: use for NFT vault flows.

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
