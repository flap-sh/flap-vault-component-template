#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import ts from "typescript";
import { failAgent } from "./agent-error.mjs";
import { checkLauncherComponentPolicy } from "./launcher-component-policy.mjs";

const usage = "yarn launcher:check-source [--local] <source-directory>";
const packageUsage = "yarn launcher:package <source-directory> [output.zip]";
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

function fail(rule, message, fixHint, file) {
  failAgent({ code: `launcher-source/${rule}`, message, fixHint, extra: file ? { file } : {} });
}

function failIssues(issues) {
  const first = issues[0];
  failAgent({
    code: first.ruleId,
    message: `${first.file}:${first.line}:${first.column}: ${first.message}`,
    fixHint: first.fixHint,
    nextActions: issues,
    extra: { issues },
  });
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

function readJson(files, filename) {
  try {
    return JSON.parse(files[filename]);
  } catch (error) {
    fail("invalid-json", `${filename}: ${error.message}`, `Provide a readable JSON object in ${filename}.`, filename);
  }
}

function readSourceFiles(directory, localOnly) {
  const files = {};
  const text = {};
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  for (const filename of requiredFiles) {
    const file = path.join(directory, filename);
    try {
      if (!localOnly) assertFileSize(filename, fs.statSync(file).size);
      files[filename] = fs.readFileSync(file);
    } catch (error) {
      fail("unreadable-source", `${filename}: ${error.message}`, `Provide a readable ${filename} and rerun the check.`, filename);
    }
    if (!localOnly) assertFileSize(filename, files[filename].length);
    totalBytes += files[filename].length;
  }
  if (!localOnly && totalBytes > maxSourceBytes) {
    fail("source-size", `The three Launcher source files total ${totalBytes} bytes. Workbench allows at most ${maxSourceBytes} bytes.`,
      `Reduce the combined source size to ${maxSourceBytes} bytes or less before packaging.`);
  }
  for (const filename of requiredFiles) {
    try {
      text[filename] = localOnly ? files[filename].toString("utf8") : decoder.decode(files[filename]);
    } catch {
      fail("encoding", `${filename} is not valid UTF-8.`, "Save the file as UTF-8.", filename);
    }
  }
  return { files, text };
}

function assertFileSize(filename, size) {
  if (size === 0 || size > maxFileBytes) {
    fail("source-size", `${filename} is ${size} bytes. Workbench requires 1–${maxFileBytes} bytes per Launcher source file.`,
      `Keep ${filename} non-empty and within ${maxFileBytes} bytes before packaging.`, filename);
  }
}

function checkWorkbenchProfile({ chainId, configContract, factoryAddress }) {
  if (!workbenchChainIds.has(chainId)) {
    fail("unsupported-chain", `Workbench does not support Launcher chain ID ${chainId}.`,
      "Use the chain ID of your deployed BNB Chain (56) or BSC Testnet (97) Launcher factory.", "manifest.json");
  }
  if (configContract === detailConfigContract || configContract === configPreviewContract) return;

  const profiles = workbenchProfiles.filter((profile) =>
    profile.chainId === chainId && profile.configContract === configContract);
  if (profiles.length === 0) {
    fail("unsupported-config-contract", `Workbench has no Launcher adapter for ${JSON.stringify(configContract)} on chain ${chainId}.`,
      "Use launcher-config-preview/v1 for creation and detail, or launcher-detail/v1 for detail only. See the Launcher guide for the testnet wallet bridge.", "manifest.json");
  }
  const normalizedFactory = factoryAddress.toLowerCase();
  if (!profiles.some((profile) => profile.factoryAddress === normalizedFactory)) {
    fail("factory", `Workbench does not support factory ${factoryAddress} with ${JSON.stringify(configContract)} on chain ${chainId}.`,
      "Confirm the chain, factory address, and host adapter with Flap before packaging.", "manifest.json");
  }
}

async function writeSourcePackage(files, destination) {
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, ".launcher-package-"));
  const archivePath = path.join(staging, "launcher.zip");
  try {
    const zip = archiver("zip", { zlib: { level: 9 } });
    const chunks = [];
    const output = new Promise((resolve, reject) => {
      zip.on("data", chunk => chunks.push(chunk));
      zip.once("end", () => resolve(Buffer.concat(chunks)));
      zip.once("error", reject);
      zip.once("warning", reject);
    });
    const entryDate = new Date("2000-01-01T00:00:00Z");
    for (const name of requiredFiles) {
      zip.append(files[name], { name, mode: 0o644, date: entryDate });
    }
    const [bytes] = await Promise.all([output, zip.finalize()]);
    fs.writeFileSync(archivePath, bytes, { mode: 0o600 });
    fs.linkSync(archivePath, destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

async function main(args) {
  const packaging = args[0] === "--package";
  const localOnly = args[0] === "--local";
  const directoryArgs = packaging || localOnly ? args.slice(1) : args;
  const commandUsage = packaging ? packageUsage : usage;
  if (directoryArgs.length === 1 && directoryArgs[0] === "--help") {
    console.log(commandUsage);
    return;
  }
  if (!directoryArgs.length || directoryArgs.length > (packaging ? 2 : 1)
    || directoryArgs.some(arg => !arg.trim() || arg.startsWith("-"))) {
    fail("missing-directory", "Supply one Launcher source directory.", `Run ${commandUsage}.`);
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
  const { files, text } = readSourceFiles(directory, localOnly);
  const manifest = readJson(text, "manifest.json");
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
        : "Use kind launcher-ui, entry Component.tsx, and the project's artifact ID, name, chain ID, factory address, and configuration contract. Use launcher-ui alone for launcher-detail/v1, or launcher-config and launcher-ui for a creation adapter.", "manifest.json");
  }
  if (!localOnly) checkWorkbenchProfile(manifest);
  if (hasTransactions && !validTransactions(manifest.transactions, configPreview)) {
    fail("transactions", "The Launcher transaction declarations are invalid.",
      "Use create: true only on launcher-config-preview/v1, or declare one to eight zero-argument actions using payable or nonpayable.", "manifest.json");
  }
  if (hasReads && !validDetailReads(manifest.reads, hasTransactions)) {
    fail("reads", "The Launcher detail read declarations are invalid.",
      "Use up to eight zero-argument reads with address, bool, or uint256 returns. With transactions declared, use up to sixteen reads and account: true for a getter that takes one address.", "manifest.json");
  }

  const translations = readJson(text, "i18n.json");
  const keys = Object.keys(translations?.en ?? {});
  if (!hasKeys(translations, locales) || !keys.length || !locales.every((locale) =>
    hasKeys(translations[locale], keys) && Object.values(translations[locale]).every((message) =>
      typeof message === "string" && message.trim().length > 0))) {
    fail("translations", "Launcher translations must have the same message keys in en, ko, and zh.",
      "Supply a non-empty string for each key in all three locales.", "i18n.json");
  }
  if (!localOnly && (keys.length > 256 || keys.some(key => !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(key))
    || locales.some(locale => Object.values(translations[locale]).some(message => message.length > 2000)))) {
    fail("translations", "Launcher translations exceed the Workbench limits for keys or messages.",
      "Use up to 256 keys. Start each key with an ASCII letter and use up to 80 letters, digits, underscores, periods or hyphens. Limit each message to 2,000 characters.", "i18n.json");
  }

  const source = ts.createSourceFile("Component.tsx", text["Component.tsx"], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (source.parseDiagnostics.length) {
    failIssues(source.parseDiagnostics.map(diagnostic => {
      const { line, character } = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      return { ruleId: "launcher-source/syntax", severity: "blocking", file: "Component.tsx",
        line: line + 1, column: character + 1, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        fixHint: "Fix the TSX syntax in Component.tsx." };
    }));
  }
  const exported = source.statements.filter((statement) =>
    ts.isExportDeclaration(statement) || ts.isExportAssignment(statement) ||
    (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)));
  if (exported.length !== componentNames.length || !componentNames.every((name) => exported.some((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name && statement.body &&
    !ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)))) {
    fail("exports", `Component.tsx must export exactly these named functions: ${componentNames.join(", ")}.`,
      "Declare the required components with export function and keep other declarations private to the file.", "Component.tsx");
  }
  if (!localOnly) {
    const issues = checkLauncherComponentPolicy(source, manifest);
    if (issues.length) failIssues(issues);
  }

  const { artifactId, chainId, factoryAddress, configContract } = manifest;
  const result = { ok: true, directory, artifactId, chainId, factoryAddress, ...(localOnly ? { localOnly } : { configContract }) };
  if (packaging) {
    const destination = path.resolve(directoryArgs[1] ?? path.join("dist", `${artifactId}-launcher.zip`));
    const relative = path.relative(directory, destination);
    if (path.extname(destination).toLowerCase() !== ".zip"
      || !(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) {
      fail("output-path", "Launcher ZIP output must be a .zip file outside the source directory.",
        "Choose a new .zip output path outside the three-file Launcher directory.");
    }
    try {
      await writeSourcePackage(files, destination);
    } catch (error) {
      if (error.code === "EEXIST" && error.syscall === "link") {
        fail("output-exists", `Launcher ZIP already exists at ${destination}.`, "Choose a new output path or remove the existing ZIP.");
      }
      fail("package-write", `Could not create the Launcher ZIP: ${error.message}`, "Choose a writable output path and rerun packaging.");
    }
    result.sourcePackageAbsolutePath = destination;
  }
  console.log(JSON.stringify(result, null, 2));
}

await main(process.argv.slice(2));
