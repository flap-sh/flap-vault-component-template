import fs from "node:fs";
import path from "node:path";

export const REQUIRED_VAULT_FILES = ["Component.tsx", "manifest.json", "VaultABI.ts", "i18n.json"];

export const FOLDER_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const FOLDER_NAME_MIN_LENGTH = 3;
export const FOLDER_NAME_MAX_LENGTH = 64;

export function isValidFolderName(folderName) {
  return (
    typeof folderName === "string" &&
    folderName.length >= FOLDER_NAME_MIN_LENGTH &&
    folderName.length <= FOLDER_NAME_MAX_LENGTH &&
    FOLDER_NAME_RE.test(folderName)
  );
}

function lineEndingFor(content) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

export function vaultModuleEntry(folderName, eol = "\n") {
  return `  ${JSON.stringify(folderName)}: {
    folderName: ${JSON.stringify(folderName)},
    loadComponent: () => import("./${folderName}/Component"),
    loadManifest: () => import("./${folderName}/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./${folderName}/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
`.replaceAll("\n", eol);
}

export function isVaultRegistered(folderName, { root = process.cwd() } = {}) {
  const indexPath = path.join(root, "src", "vaults", "index.ts");
  if (!fs.existsSync(indexPath)) return false;
  const content = fs.readFileSync(indexPath, "utf8");
  return content.includes(`./${folderName}/Component`) && content.includes(`./${folderName}/manifest.json`) && content.includes(`./${folderName}/i18n.json`);
}

export function assertVaultFilesExist(folderName, { root = process.cwd() } = {}) {
  const vaultDir = path.join(root, "src", "vaults", folderName);
  if (!fs.existsSync(vaultDir)) {
    return {
      ok: false,
      error: `Vault folder not found: src/vaults/${folderName}`,
      missingFiles: REQUIRED_VAULT_FILES.map((file) => `src/vaults/${folderName}/${file}`),
    };
  }

  const missingFiles = REQUIRED_VAULT_FILES.filter((file) => !fs.existsSync(path.join(vaultDir, file))).map((file) => `src/vaults/${folderName}/${file}`);
  return missingFiles.length ? { ok: false, error: "Vault folder is missing required files.", missingFiles } : { ok: true, missingFiles: [] };
}

export function registerVault(folderName, { dryRun = false, root = process.cwd() } = {}) {
  const indexPath = path.join(root, "src", "vaults", "index.ts");
  const content = fs.readFileSync(indexPath, "utf8");
  if (isVaultRegistered(folderName, { root })) {
    return { changed: false, file: "src/vaults/index.ts", alreadyRegistered: true };
  }

  const markerRe = /};\r?\n\r?\nexport function getVaultFolderNames\(\)/;
  if (!markerRe.test(content)) {
    throw new Error("Cannot register vault automatically. src/vaults/index.ts has an unexpected shape.");
  }

  const nextContent = content.replace(markerRe, `${vaultModuleEntry(folderName, lineEndingFor(content))}$&`);
  if (!dryRun) fs.writeFileSync(indexPath, nextContent);
  return { changed: true, file: "src/vaults/index.ts", alreadyRegistered: false };
}

export function unregisterVault(folderName, { dryRun = false, root = process.cwd() } = {}) {
  const indexPath = path.join(root, "src", "vaults", "index.ts");
  const content = fs.readFileSync(indexPath, "utf8");
  if (!isVaultRegistered(folderName, { root })) {
    return { changed: false, file: "src/vaults/index.ts", alreadyRegistered: false };
  }

  // Match the full entry block for this folder: `  "name": { ... },\n`.
  const escaped = folderName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entryRe = new RegExp(`[ \\t]*"${escaped}":\\s*\\{[\\s\\S]*?\\r?\\n[ \\t]*\\},\\r?\\n`);
  if (!entryRe.test(content)) {
    throw new Error("Cannot unregister vault automatically. src/vaults/index.ts has an unexpected shape.");
  }

  const nextContent = content.replace(entryRe, "");
  if (!dryRun) fs.writeFileSync(indexPath, nextContent);
  return { changed: true, file: "src/vaults/index.ts", alreadyRegistered: false };
}
