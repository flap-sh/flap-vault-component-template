#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assertTemplateFresh } from "./check-template-fresh.mjs";
import { createRuntimePackageIdentity, parseRuntimePackageMode } from "./runtime-package-mode.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist", "vault-runtime");
const PACKAGE_NAME = "@flapsdk/vault-runtime";
const RUNTIME_EXTERNALS = ["react", "react-dom", "react/jsx-runtime", "wagmi", "viem", "@tanstack/react-query", "@rainbow-me/rainbowkit"];

function yarnCommand() {
  return process.platform === "win32" ? "yarn.cmd" : "yarn";
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function ensureUseClient(entryFile) {
  const filePath = path.join(OUT_DIR, entryFile);
  const source = await readFile(filePath, "utf8");
  if (source.startsWith('"use client";')) return;
  await writeFile(filePath, `"use client";\n${source}`);
}

function runtimePackageError(code, message, fixHint) {
  const error = new Error(message);
  error.code = code;
  error.fixHint = fixHint;
  return error;
}

function assertCleanCommittedCanarySource() {
  const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  if (status) {
    throw runtimePackageError(
      "runtime-package/canary-dirty",
      "Canary runtime packages require a clean committed worktree so their gitHead provenance is exact.",
      "Commit the intended runtime changes and remove unrelated untracked files, then rerun yarn runtime:pack:canary.",
    );
  }
}

async function main() {
  const mode = parseRuntimePackageMode(process.argv.slice(2));
  if (mode === "release") await assertTemplateFresh();
  else assertCleanCommittedCanarySource();

  execFileSync(yarnCommand(), ["tsup", "--config", "tsup.runtime.config.ts"], {
    cwd: ROOT,
    stdio: "inherit",
  });

  const rootPackage = await readJson(path.join(ROOT, "package.json"));
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const packageIdentity = createRuntimePackageIdentity({ baseVersion: rootPackage.version, gitHead, mode });
  await mkdir(OUT_DIR, { recursive: true });
  await Promise.all([ensureUseClient("sdk.js"), ensureUseClient("ui.js")]);

  const peerVersion = (name) => rootPackage.dependencies?.[name] ?? rootPackage.devDependencies?.[name];
  const packageManifest = {
    name: PACKAGE_NAME,
    version: packageIdentity.version,
    gitHead,
    description: "Shared runtime surface for Flap Vault UI hosts, Workbench preview, and custom Vault components.",
    type: "module",
    sideEffects: false,
    main: "./sdk.js",
    module: "./sdk.js",
    types: "./sdk.d.mts",
    files: ["*.js", "*.d.mts", "*.map", "package.json", "runtime-contract.json", "README.md"],
    exports: {
      "./sdk": {
        types: "./sdk.d.mts",
        import: "./sdk.js",
      },
      "./ui": {
        types: "./ui.d.mts",
        import: "./ui.js",
      },
      "./host": {
        types: "./host.d.mts",
        import: "./host.js",
      },
      "./server": {
        types: "./server.d.mts",
        import: "./server.js",
      },
      "./runtime-contract": "./runtime-contract.json",
      "./package.json": "./package.json",
    },
    peerDependencies: {
      react: peerVersion("react"),
      "react-dom": peerVersion("react-dom"),
      wagmi: peerVersion("wagmi"),
      viem: peerVersion("viem"),
      "@tanstack/react-query": peerVersion("@tanstack/react-query"),
      "@rainbow-me/rainbowkit": peerVersion("@rainbow-me/rainbowkit"),
    },
    ...(packageIdentity.private ? { private: true } : {}),
    ...(packageIdentity.publishConfig ? { publishConfig: packageIdentity.publishConfig } : {}),
    ...(packageIdentity.canary ? { flapCanary: packageIdentity.canary } : {}),
  };

  const runtimeContract = {
    runtimeContractVersion: 1,
    packageName: PACKAGE_NAME,
    packageVersion: packageIdentity.version,
    stableAuthoringAliases: ["@/src/sdk", "@/src/ui"],
    componentFacingEntrypoints: ["./sdk", "./ui"],
    hostFacingEntrypoints: ["./host", "./server"],
    runtimeExternals: RUNTIME_EXTERNALS,
    notes: "Vault source keeps authoring aliases. Workbench/flap.sh should rewrite or externalize those aliases to these package subpaths.",
  };

  const readme = `# ${PACKAGE_NAME}

Generated from \`flap-vault-ui-template\`.

${mode === "canary" ? "This is a private local canary package. It is commit-bound and must not be published to npm.\n" : ""}

This package is the shared runtime surface that local preview, Artifact Workbench, and \`flap.sh\` should agree on.

## Exports

- \`./sdk\`: component-facing SDK hooks, helpers, types, provider, and local oracle reader helper
- \`./ui\`: shared UI primitives
- \`./host\`: host/runtime preflight helpers and the browser-safe same-origin presentation fetcher
- \`./server\`: server-side presentation, runtime oracle-registry helpers, and the controlled Vault V2 NFT metadata/media resolver

See \`runtime-contract.json\` for the machine-readable subpath contract.
`;

  await Promise.all([
    writeFile(path.join(OUT_DIR, "package.json"), `${JSON.stringify(packageManifest, null, 2)}\n`),
    writeFile(path.join(OUT_DIR, "runtime-contract.json"), `${JSON.stringify(runtimeContract, null, 2)}\n`),
    writeFile(path.join(OUT_DIR, "README.md"), readme),
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        packageDir: path.relative(ROOT, OUT_DIR),
        packageAbsolutePath: OUT_DIR,
        packageName: PACKAGE_NAME,
        packageVersion: packageIdentity.version,
        mode,
        publishable: !packageIdentity.private,
        gitHead,
        runtimeContractVersion: runtimeContract.runtimeContractVersion,
        exports: Object.keys(packageManifest.exports).filter((key) => key !== "./package.json"),
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
        code: error?.code ?? "runtime-package/build-failed",
        error: error instanceof Error ? error.message : String(error),
        fixHint: error?.fixHint ?? "Fix the runtime package entrypoints or tsup config, then rerun yarn runtime:package.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
