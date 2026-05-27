#!/usr/bin/env node
import process from "node:process";
import { failAgent } from "./agent-error.mjs";
import { assertVaultFilesExist, isValidFolderName, registerVault, unregisterVault } from "./vault-registration.mjs";

const ROOT = process.cwd();

function fail(message, { code = "cli/register-error", fixHint = "Read agent.nextActions and rerun the command after fixing the input.", nextActions, ...extra } = {}) {
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

function readBoolean(parsed, key, fallback) {
  const value = parsed[key];
  if (value === undefined) return fallback;
  if (value === true) return true;
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  fail(`--${key} must be true or false.`, {
    code: "cli/invalid-boolean",
    fixHint: `Pass --${key} true, --${key} false, or omit the flag.`,
    flag: key,
  });
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const folderName = parsed._[0];
  const dryRun = readBoolean(parsed, "dry-run", false);
  const remove = readBoolean(parsed, "remove", false);

  if (!folderName) {
    fail("Usage: yarn vault:register <folder-name> [--dry-run] [--remove]", {
      code: "cli/missing-folder-name",
      fixHint: "Provide the Vault folder name to register, for example yarn vault:register my-vault. Pass --remove to deregister.",
    });
  }
  if (!isValidFolderName(folderName)) {
    fail("Folder name must be 3-64 characters of lowercase kebab-case, for example my-vault.", {
      code: "cli/invalid-folder-name",
      fixHint: "Use lowercase letters and numbers separated by single hyphens; do not use spaces, underscores, uppercase letters, leading/trailing hyphens, or nested folders.",
      folderName,
    });
  }

  if (remove) {
    let removal;
    try {
      removal = unregisterVault(folderName, { dryRun, root: ROOT });
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error), {
        code: "preview-registration/unregister-failed",
        fixHint: "Fix src/vaults/index.ts so it matches the expected vaultModules shape, then rerun yarn vault:register <folder-name> --remove.",
        nextActions: [
          {
            ruleId: "preview-registration/unregister-failed",
            severity: "blocking",
            file: "src/vaults/index.ts",
            fixHint: "Restore the expected vaultModules object and getVaultFolderNames export, or remove the folder entry by hand.",
          },
        ],
      });
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun,
          folderName,
          registered: false,
          removed: removal.changed,
          wasRegistered: removal.changed,
          updatedFiles: removal.changed ? [removal.file] : [],
          note: "Deregistered local preview wiring only. The src/vaults/<folder-name> files were not deleted.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const fileCheck = assertVaultFilesExist(folderName, { root: ROOT });
  if (!fileCheck.ok) {
    fail(fileCheck.error, {
      code: "package-structure/missing-required-file",
      fixHint: "Create the strict four files first: Component.tsx, manifest.json, VaultABI.ts, and i18n.json under src/vaults/<folder-name>.",
      folderName,
      missingFiles: fileCheck.missingFiles,
      nextActions: [
        {
          ruleId: "package-structure/missing-required-file",
          severity: "blocking",
          file: `src/vaults/${folderName}`,
          fixHint: "Create missing Vault files or run yarn vault:scaffold <folder-name> --factory 0x... to generate the package.",
        },
      ],
    });
  }

  let registration;
  try {
    registration = registerVault(folderName, { dryRun, root: ROOT });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), {
      code: "preview-registration/register-failed",
      fixHint: "Fix src/vaults/index.ts so it matches the expected vaultModules shape, then rerun yarn vault:register <folder-name>.",
      nextActions: [
        {
          ruleId: "preview-registration/register-failed",
          severity: "blocking",
          file: "src/vaults/index.ts",
          fixHint: "Restore the expected vaultModules object and getVaultFolderNames export. Only hand-edit registration if the script still cannot parse the index file.",
        },
      ],
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        folderName,
        registered: true,
        alreadyRegistered: registration.alreadyRegistered,
        updatedFiles: registration.changed ? [registration.file] : [],
        previewPath: `/${folderName}`,
        nextCommands: [`yarn vault:check ${folderName}`, `yarn dev`, `open http://localhost:3000/${folderName}`],
      },
      null,
      2,
    ),
  );
}

main();
