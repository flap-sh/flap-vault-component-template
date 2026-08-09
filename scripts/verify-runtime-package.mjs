#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PACKAGE_DIR = path.join(ROOT, "dist", "vault-runtime");
const EXPECTED_PACKAGE_NAME = "@flapsdk/vault-runtime";
const EXPECTED_EXPORTS = ["./sdk", "./ui", "./host", "./server", "./runtime-contract", "./package.json"];
const EXPECTED_FILES = ["sdk.js", "sdk.d.mts", "host.js", "host.d.mts", "server.js", "server.d.mts", "ui.js", "ui.d.mts", "package.json", "runtime-contract.json", "README.md"];

async function ensureFile(filePath) {
  await access(filePath);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

function collectRelativeJsSpecifiers(source) {
  const specifiers = new Set();
  const importExportPattern = /(?:\bfrom\s*|\bimport\s*)["'](\.\/.+?\.js)["']/g;
  for (const match of source.matchAll(importExportPattern)) {
    specifiers.add(match[1]);
  }
  return specifiers;
}

async function verifySharedRuntimeContext(packageDir, sdkSource, uiSource) {
  const sdkSpecifiers = collectRelativeJsSpecifiers(sdkSource);
  const uiSpecifiers = collectRelativeJsSpecifiers(uiSource);
  const sharedSpecifiers = [...sdkSpecifiers].filter((specifier) => uiSpecifiers.has(specifier));
  const contextChunks = [];

  for (const specifier of sharedSpecifiers) {
    const source = await readText(path.resolve(packageDir, specifier));
    const ownsRuntimeContext = /\bRuntimeContext\s*=\s*(?:React\.)?createContext\s*\(/.test(source);
    const ownsSdkHook = /\bfunction\s+useFlapSdk\s*\(/.test(source);
    const ownsNftMetadataImage = /\bfunction\s+NftMetadataImage\s*\(/.test(source);
    if (ownsRuntimeContext && ownsSdkHook && ownsNftMetadataImage) {
      contextChunks.push(specifier);
    }
  }

  if (contextChunks.length !== 1) {
    throw new Error(
      `sdk.js and ui.js must reference exactly one shared runtime chunk that owns RuntimeContext, useFlapSdk, and NftMetadataImage; found ${contextChunks.length}: ${contextChunks.join(", ") || "none"}.`,
    );
  }

  return contextChunks[0];
}

async function expectRejection(task, messagePattern, label) {
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (messagePattern.test(message)) return;
    throw new Error(`${label} rejected with an unexpected error: ${message}`);
  }
  throw new Error(`${label} unexpectedly succeeded.`);
}

async function main() {
  const packageDir = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : DEFAULT_PACKAGE_DIR;

  for (const file of EXPECTED_FILES) {
    await ensureFile(path.join(packageDir, file));
  }

  const [manifest, runtimeContract, sdkSource, uiSource] = await Promise.all([
    readJson(path.join(packageDir, "package.json")),
    readJson(path.join(packageDir, "runtime-contract.json")),
    readText(path.join(packageDir, "sdk.js")),
    readText(path.join(packageDir, "ui.js")),
  ]);

  for (const key of EXPECTED_EXPORTS) {
    if (!(key in manifest.exports)) {
      throw new Error(`Missing package export ${key}.`);
    }
  }

  if (manifest.name !== EXPECTED_PACKAGE_NAME) {
    throw new Error(`Expected package name ${EXPECTED_PACKAGE_NAME}, received ${manifest.name}.`);
  }

  if (runtimeContract.packageName !== EXPECTED_PACKAGE_NAME) {
    throw new Error(`Expected runtime contract package name ${EXPECTED_PACKAGE_NAME}, received ${runtimeContract.packageName}.`);
  }

  if (runtimeContract.runtimeContractVersion !== 1) {
    throw new Error(`Expected runtimeContractVersion 1, received ${runtimeContract.runtimeContractVersion}.`);
  }

  if (!sdkSource.startsWith('"use client";')) {
    throw new Error("sdk.js must keep the use client directive.");
  }

  if (!uiSource.startsWith('"use client";')) {
    throw new Error("ui.js must keep the use client directive.");
  }

  const sharedRuntimeContextChunk = await verifySharedRuntimeContext(packageDir, sdkSource, uiSource);

  const hostModule = await import(`${pathToFileURL(path.join(packageDir, "host.js")).href}?verify=${Date.now()}`);
  const robinhoodTestnet = hostModule.getTaxVaultHostChainConfig?.(46630);
  const expectedRobinhoodTestnet = {
    portal: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09",
    taxTokenHelperAddress: "0xb10bD2672aE63735d677164A54B573a016f0203C",
    vaultPortal: "0xe9F7AB7DE8FB8756acbB6a1cd13316a43308197B",
    wrappedNativeTokenAddress: "0x7943e237c7F95DA44E0301572D358911207852Fa",
    hostChainSlug: "robinhood-testnet",
    ipfsGateway: "https://flap.mypinata.cloud",
  };

  if (JSON.stringify(robinhoodTestnet) !== JSON.stringify(expectedRobinhoodTestnet)) {
    throw new Error(`Robinhood Testnet runtime config mismatch: ${JSON.stringify(robinhoodTestnet)}.`);
  }
  if (hostModule.explorerForChain?.(46630) !== "https://explorer.testnet.chain.robinhood.com") {
    throw new Error("Robinhood Testnet explorer mapping is missing from the runtime host export.");
  }
  if (hostModule.chainLabelForChain?.(46630) !== "Robinhood Chain Testnet") {
    throw new Error("Robinhood Testnet chain label is missing from the runtime host export.");
  }

  const serverModule = await import(`${pathToFileURL(path.join(packageDir, "server.js")).href}?verify=${Date.now()}`);
  if (typeof serverModule.loadNftMetadata !== "function") {
    throw new Error("Vault V2 NFT metadata resolver is missing from the runtime server export.");
  }

  const safeSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="2" height="2" fill="#123456"/></svg>';
  const safeMetadata = {
    name: "Runtime NFT",
    image: `data:image/svg+xml;base64,${Buffer.from(safeSvg).toString("base64")}`,
  };
  const safeSnapshot = await serverModule.loadNftMetadata({
    chainId: 56,
    tokenUri: `data:application/json;base64,${Buffer.from(JSON.stringify(safeMetadata)).toString("base64")}`,
  });
  if (safeSnapshot?.name !== "Runtime NFT" || safeSnapshot?.imageMediaType !== "image/svg+xml" || !safeSnapshot?.imageDataUrl?.startsWith("data:image/svg+xml;base64,")) {
    throw new Error("Vault V2 NFT metadata resolver did not normalize safe inline JSON/SVG metadata.");
  }

  const dangerousMetadata = {
    image: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64")}`,
  };
  await expectRejection(
    () => serverModule.loadNftMetadata({
      chainId: 56,
      tokenUri: `data:application/json;base64,${Buffer.from(JSON.stringify(dangerousMetadata)).toString("base64")}`,
    }),
    /unsupported active or external content/i,
    "Dangerous inline NFT SVG",
  );

  let privateFetchCalled = false;
  await expectRejection(
    () => serverModule.loadNftMetadata({
      chainId: 56,
      tokenUri: "https://127.0.0.1/metadata.json",
      fetchImpl: async () => {
        privateFetchCalled = true;
        throw new Error("private fetch should not run");
      },
    }),
    /host is not public/i,
    "Private-network NFT metadata URL",
  );
  if (privateFetchCalled) throw new Error("Vault V2 NFT metadata resolver fetched a blocked private-network URL.");

  const packPreview = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--dry-run"], {
      cwd: packageDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );

  for (const previewEntry of packPreview) {
    if (previewEntry?.name !== EXPECTED_PACKAGE_NAME) {
      throw new Error(`npm pack preview returned unexpected package name ${previewEntry?.name}.`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        packageDir: path.relative(ROOT, packageDir),
        packageAbsolutePath: packageDir,
        packageName: manifest.name,
        runtimeContractVersion: runtimeContract.runtimeContractVersion,
        sharedRuntimeContextChunk,
        exports: EXPECTED_EXPORTS,
        packPreview,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "runtime-package/verify-failed",
        error: error instanceof Error ? error.message : String(error),
        fixHint: "Build the runtime package first, then verify the generated exports, metadata, and npm pack preview.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
