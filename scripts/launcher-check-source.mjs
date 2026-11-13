#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { failAgent } from "./agent-error.mjs";

const usage = "yarn launcher:check-source [--local] <source-directory>";
const requiredFiles = ["Component.tsx", "i18n.json", "manifest.json"];
const detailConfigContract = "launcher-detail/v1";
const configPreviewContract = "launcher-config-preview/v1";
const workbenchChainIds = new Set([56, 97]);
// Keep these public deployment profiles and byte limits aligned with Workbench's Launcher upload validator.
const workbenchProfiles = [
  { chainId: 97, configContract: "crowd-native-create/v1", factoryAddress: "0xc574f30e2ee26fe638eece6d9876217015cd0a38" },
  { chainId: 56, configContract: "agent-raise-create/v1", factoryAddress: "0xce18f9de452c63d806a9c273efa09ed1f80b3ba3" },
];
const maxFileBytes = 256_000;
const maxSourceBytes = 512_000;
const functionName = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const reservedNames = new Set(["constructor", "prototype", "__proto__"]);
const detailReturnTypes = new Set(["address", "bool", "uint256"]);
const locales = ["en", "ko", "zh"];

function fail(rule, message, fixHint) {
  failAgent({ code: `launcher-source/${rule}`, message, fixHint });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasKeys(value, keys) {
  return isRecord(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validDetailReads(reads, hasTransactions) {
  if (!isRecord(reads)) return false;
  const entries = Object.entries(reads);
  return entries.length <= (hasTransactions ? 16 : 8) && entries.every(([key, read]) => {
    if (!isRecord(read) || !/^[a-z][a-zA-Z0-9]{0,39}$/.test(key) || reservedNames.has(key)) return false;
    const accountRead = hasTransactions && Object.hasOwn(read, "account");
    return hasKeys(read, accountRead ? ["functionName", "returns", "account"] : ["functionName", "returns"]) &&
      (!accountRead || read.account === true) && typeof read.functionName === "string" &&
      functionName.test(read.functionName) && detailReturnTypes.has(read.returns);
  });
}

function validTransactions(transactions, configPreview) {
  if (!isRecord(transactions)) return false;
  const keys = Object.keys(transactions);
  if (!keys.length || keys.some((key) => key !== "create" && key !== "actions")) return false;
  if (Object.hasOwn(transactions, "create") && (!configPreview || transactions.create !== true)) return false;
  if (!Object.hasOwn(transactions, "actions")) return true;
  if (!isRecord(transactions.actions)) return false;
  const actions = Object.entries(transactions.actions);
  return actions.length >= 1 && actions.length <= 8 && actions.every(([name, mutability]) =>
    functionName.test(name) && !reservedNames.has(name) && (mutability === "payable" || mutability === "nonpayable"));
}

function readJson(directory, filename) {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, filename), "utf8"));
  } catch (error) {
    fail("invalid-json", `${filename}: ${error.message}`, `Provide a readable JSON object in ${filename}.`);
  }
}

function checkWorkbenchSourceSize(directory) {
  let totalBytes = 0;
  for (const filename of requiredFiles) {
    let size;
    try {
      ({ size } = fs.statSync(path.join(directory, filename)));
    } catch (error) {
      fail("unreadable-source", `${filename}: ${error.message}`, `Provide a readable ${filename} and rerun the check.`);
    }
    if (size === 0 || size > maxFileBytes) {
      fail("source-size", `${filename} is ${size} bytes. Workbench requires 1–${maxFileBytes} bytes per Launcher source file.`,
        `Keep ${filename} non-empty and within ${maxFileBytes} bytes before zipping.`);
    }
    totalBytes += size;
  }
  if (totalBytes > maxSourceBytes) {
    fail("source-size", `The three Launcher source files total ${totalBytes} bytes. Workbench allows at most ${maxSourceBytes} bytes.`,
      `Reduce the combined source size to ${maxSourceBytes} bytes or less before zipping.`);
  }
}

function checkWorkbenchProfile({ chainId, configContract, factoryAddress }) {
  if (!workbenchChainIds.has(chainId)) {
    fail("unsupported-chain", `Workbench does not support Launcher chain ID ${chainId}.`,
      "Use the chain ID of your deployed BNB Chain (56) or BSC Testnet (97) Launcher factory.");
  }
  if (configContract === detailConfigContract || configContract === configPreviewContract) return;

  const profiles = workbenchProfiles.filter((profile) =>
    profile.chainId === chainId && profile.configContract === configContract);
  if (profiles.length === 0) {
    fail("unsupported-config-contract", `Workbench has no Launcher adapter for ${JSON.stringify(configContract)} on chain ${chainId}.`,
      "Use launcher-config-preview/v1 for creation and detail, or launcher-detail/v1 for detail only. See the Launcher guide for the testnet wallet bridge.");
  }
  const normalizedFactory = factoryAddress.toLowerCase();
  if (!profiles.some((profile) => profile.factoryAddress === normalizedFactory)) {
    fail("factory", `Workbench does not support factory ${factoryAddress} with ${JSON.stringify(configContract)} on chain ${chainId}.`,
      "Confirm the chain, factory address, and host adapter with Flap before packaging.");
  }
}

function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(usage);
    return;
  }
  const localOnly = args[0] === "--local";
  const directoryArgs = localOnly ? args.slice(1) : args;
  if (directoryArgs.length !== 1 || !directoryArgs[0].trim() || directoryArgs[0].startsWith("-")) {
    fail("missing-directory", "Supply one Launcher source directory.", `Run ${usage} with your project directory.`);
  }

  const directory = path.resolve(directoryArgs[0]);
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    fail("unreadable-directory", error.message, "Pass the path to a readable Launcher source directory.");
  }
  if (entries.length !== requiredFiles.length ||
    !requiredFiles.every((filename) => entries.some((entry) => entry.name === filename && entry.isFile()))) {
    fail("source-files", "A Launcher source directory requires three regular files.", `Keep exactly ${requiredFiles.join(", ")} in the source directory.`);
  }
  if (!localOnly) checkWorkbenchSourceSize(directory);

  const manifest = readJson(directory, "manifest.json");
  const detailOnly = !localOnly && manifest?.configContract === detailConfigContract;
  const configPreview = !localOnly && manifest?.configContract === configPreviewContract;
  const hasReads = (detailOnly || configPreview) && Object.hasOwn(manifest, "reads");
  const hasTransactions = (detailOnly || configPreview) && Object.hasOwn(manifest, "transactions");
  const surfaces = detailOnly ? ["launcher-ui"] : ["launcher-config", "launcher-ui"];
  const componentNames = detailOnly ? ["Launcher"] : ["Launcher", "LauncherConfig"];
  const manifestKeys = ["schemaVersion", "kind", "artifactId", "name", "chainId", "factoryAddress", "surfaces", "entry"];
  if (!localOnly) manifestKeys.push("configContract");
  if (hasReads) manifestKeys.push("reads");
  if (hasTransactions) manifestKeys.push("transactions");
  const schemaVersion = localOnly ? 1 : 2;
  const kind = localOnly ? "launcher-local" : "launcher-ui";
  if (!hasKeys(manifest, manifestKeys) ||
    manifest.schemaVersion !== schemaVersion || manifest.kind !== kind || manifest.entry !== "Component.tsx" ||
    !Array.isArray(manifest.surfaces) || manifest.surfaces.length !== surfaces.length ||
    !surfaces.every((surface) => manifest.surfaces.includes(surface)) ||
    typeof manifest.artifactId !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(manifest.artifactId) ||
    typeof manifest.name !== "string" || manifest.name.trim().length < 2 || manifest.name.length > 100 ||
    !Number.isSafeInteger(manifest.chainId) || manifest.chainId <= 0 ||
    typeof manifest.factoryAddress !== "string" || !/^0x(?!0{40}$)[0-9a-f]{40}$/i.test(manifest.factoryAddress) ||
    (!localOnly && (typeof manifest.configContract !== "string" || !manifest.configContract.trim()))) {
    fail("manifest", `The Launcher manifest does not match the schema ${schemaVersion} source format.`,
      localOnly
        ? "Use kind launcher-local, the launcher-config and launcher-ui surfaces, entry Component.tsx, and the project's artifact ID, name, chain ID, and factory address."
        : "Use kind launcher-ui, entry Component.tsx, and the project's artifact ID, name, chain ID, factory address, and configuration contract. Use launcher-ui alone for launcher-detail/v1, or launcher-config and launcher-ui for a creation adapter.");
  }
  if (!localOnly) checkWorkbenchProfile(manifest);
  if (hasTransactions && !validTransactions(manifest.transactions, configPreview)) {
    fail("transactions", "The Launcher transaction declarations are invalid.",
      "Use create: true only on launcher-config-preview/v1, or declare one to eight zero-argument actions using payable or nonpayable.");
  }
  if (hasReads && !validDetailReads(manifest.reads, hasTransactions)) {
    fail("reads", "The Launcher detail read declarations are invalid.",
      "Use up to eight zero-argument reads with address, bool, or uint256 returns. With transactions declared, use up to sixteen reads and account: true for a getter that takes one address.");
  }

  const translations = readJson(directory, "i18n.json");
  const keys = Object.keys(translations?.en ?? {});
  if (!hasKeys(translations, locales) || !keys.length || !locales.every((locale) =>
    hasKeys(translations[locale], keys) && Object.values(translations[locale]).every((message) =>
      typeof message === "string" && message.trim().length > 0))) {
    fail("translations", "Launcher translations must have the same message keys in en, ko, and zh.", "Supply a non-empty string for each key in all three locales.");
  }

  let component;
  try {
    component = fs.readFileSync(path.join(directory, "Component.tsx"), "utf8");
  } catch (error) {
    fail("unreadable-component", error.message, "Make Component.tsx readable and rerun the command.");
  }
  const source = ts.createSourceFile("Component.tsx", component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (source.parseDiagnostics.length) {
    const message = ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, "\n");
    fail("syntax", message, "Fix the TSX syntax in Component.tsx.");
  }
  const exported = source.statements.filter((statement) =>
    ts.isExportDeclaration(statement) || ts.isExportAssignment(statement) ||
    (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)));
  if (exported.length !== componentNames.length || !componentNames.every((name) => exported.some((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name && statement.body &&
    !ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)))) {
    fail("exports", `Component.tsx must export exactly these named functions: ${componentNames.join(", ")}.`,
      "Declare the required components with export function and keep other declarations private to the file.");
  }

  const { artifactId, chainId, factoryAddress, configContract } = manifest;
  console.log(JSON.stringify({ ok: true, directory, artifactId, chainId, factoryAddress, ...(localOnly ? { localOnly } : { configContract }) }, null, 2));
}

main(process.argv.slice(2));
