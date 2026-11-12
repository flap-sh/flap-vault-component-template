#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { failAgent } from "./agent-error.mjs";

const usage = "yarn launcher:check-source [--local] <source-directory>";
const requiredFiles = ["Component.tsx", "i18n.json", "manifest.json"];
const detailConfigContract = "launcher-detail/v1";
const detailChainIds = new Set([56, 97]);
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

function validDetailReads(reads) {
  if (!isRecord(reads)) return false;
  const entries = Object.entries(reads);
  return entries.length <= 8 && entries.every(([key, read]) =>
    /^[a-z][a-zA-Z0-9]{0,39}$/.test(key) && key !== "constructor" && key !== "prototype" &&
    hasKeys(read, ["functionName", "returns"]) &&
    typeof read.functionName === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(read.functionName) &&
    detailReturnTypes.has(read.returns));
}

function readJson(directory, filename) {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, filename), "utf8"));
  } catch (error) {
    fail("invalid-json", `${filename}: ${error.message}`, `Provide a readable JSON object in ${filename}.`);
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

  const manifest = readJson(directory, "manifest.json");
  const detailOnly = !localOnly && manifest?.configContract === detailConfigContract;
  const hasReads = detailOnly && Object.hasOwn(manifest, "reads");
  const surfaces = detailOnly ? ["launcher-ui"] : ["launcher-config", "launcher-ui"];
  const componentNames = detailOnly ? ["Launcher"] : ["Launcher", "LauncherConfig"];
  const manifestKeys = ["schemaVersion", "kind", "artifactId", "name", "chainId", "factoryAddress", "surfaces", "entry"];
  if (!localOnly) manifestKeys.push("configContract");
  if (hasReads) manifestKeys.push("reads");
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
  if (detailOnly && !detailChainIds.has(manifest.chainId)) {
    fail("unsupported-chain", "launcher-detail/v1 supports chain IDs 56 and 97.",
      "Use the chain ID of your deployed BNB Chain or BSC Testnet Launcher factory.");
  }
  if (hasReads && !validDetailReads(manifest.reads)) {
    fail("reads", "The Launcher detail read declarations are invalid.",
      "Declare up to eight zero-argument reads as { functionName, returns } with address, bool, or uint256 returns.");
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
