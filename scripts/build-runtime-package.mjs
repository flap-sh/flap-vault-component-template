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
  await Promise.all([ensureUseClient("sdk.js"), ensureUseClient("ui.js"), ensureUseClient("host-client.js")]);
  // Preserve Next.js client boundaries without turning host preflight helpers into client references.
  const hostReexport = '\nexport { VaultRuntimeProvider } from "./host-client.js";\n';
  await writeFile(path.join(OUT_DIR, "host.js"), (await readFile(path.join(OUT_DIR, "host.js"), "utf8")) + hostReexport);
  await writeFile(path.join(OUT_DIR, "host.d.mts"), (await readFile(path.join(OUT_DIR, "host.d.mts"), "utf8")) + '\nexport { VaultRuntimeProvider, type RuntimeProviderProps, type IpfsImageOptimizer } from "./host-client.mjs";\n');

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
    sdkFeatures: { nftAccountWithdrawal: 1, resolvedContracts: 1, strictContractTargets: 1, hostOnlyProvider: 1, ipfsContent: 1 },
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

Package version: \`${packageIdentity.version}\`. Source commit: \`${gitHead}\`.

## Exports

- \`./sdk\`: component-facing SDK hooks, helpers, types, and local oracle reader helper
- \`./ui\`: shared UI primitives
- \`./host\`: host-only provider, runtime preflight helpers and the browser-safe same-origin presentation fetcher
- \`./server\`: server-side presentation, runtime oracle-registry helpers, controlled image/text upload handler, and the Vault V2 NFT metadata/media resolver

See \`runtime-contract.json\` for the machine-readable subpath contract.

## Optional host image optimization

Hosts can pass an \`imageOptimizer\` to \`VaultRuntimeProvider\` from
\`@flapsdk/vault-runtime/host\`. Import the \`IpfsImageOptimizer\` type from the
same host-only entrypoint. The callback receives an already validated gateway
\`src\`, plus optional legacy \`width\` and \`sizes\`, and returns only
\`{ src, srcSet?, sizes? }\`; it does not replace the image element or its layout.
Next.js remains a host dependency, not a runtime peer dependency.

For example, a Next.js client host can use its existing provider props:

\`\`\`tsx
"use client";

import { getImageProps } from "next/image";
import {
  VaultRuntimeProvider,
  type IpfsImageOptimizer,
  type RuntimeProviderProps,
} from "@flapsdk/vault-runtime/host";

const imageOptimizer: IpfsImageOptimizer = ({ src, width, sizes }) => {
  const pixels = Number(width);
  const knownWidth = Number.isFinite(pixels) && pixels > 0;
  const { props } = getImageProps({
    src,
    alt: "",
    fill: true,
    sizes: sizes || (knownWidth ? String(pixels) + "px" : "100vw"),
  });
  // Keep unknown legacy dimensions intrinsic; do not add layout styles.
  if (!sizes && !knownWidth) return { src: props.src };
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
};

export function ImageOptimizedVaultHost(props: RuntimeProviderProps) {
  return <VaultRuntimeProvider {...props} imageOptimizer={imageOptimizer} />;
}
\`\`\`

Retain the existing manifest, runtime context, host result and children passed to
the provider. Configure the Next.js host's image allowlist for the approved runtime
gateway origins; never widen it to arbitrary remote images. Do not import this
host API or \`next/image\` from a controlled Vault component.

Existing artifacts using shared \`IpfsImage\` or \`IpfsBackground\` need no new
required props or rebuilt component bytes when both host and runtime are upgraded.
The runtime preserves CID/path validation, the native image element and existing
CSS. Adapter errors retain direct loading; an optimized request failure retries
the same gateway directly before moving to the next gateway. CID/path changes
reset fallback state. Omitting the adapter preserves direct gateway rendering.
Custom native images, CSS URLs, bundled image implementations and
\`NftMetadataImage\` data URLs do not gain this optimization automatically.

Published \`0.1.37\` does not implement this additive provider option. Host wiring
alone cannot activate it on that release. Before production activation, obtain a
separately authorized official runtime release, then update both consumer exact
dependency pins and lockfiles to its verified published version and gitHead.
Pre-merge package testing uses a clean, committed private canary and the same
tarball in both consumers; never publish that canary or use it as release/ZIP
provenance. Measure a real unchanged artifact and cold/warm image requests before
claiming acceleration: cold requests still depend on the source gateway, and
actual edge caching depends on the host deployment.

## Dynamic IPFS content

Stable runtime \`0.1.37\` introduces \`sdk.readIpfsText(cid, path?)\`, which returns
UTF-8 text or JSON as a string, and \`IpfsText\` for escaped plain-text display.
\`IpfsImage\` accepts dynamic bare CIDs from FSI, contract state, or SDK uploads.
The SDK exports \`IPFS_CONTENT_VERSION = 1\`; the runtime contract advertises
\`sdkFeatures.ipfsContent = 1\`. Stable \`0.1.36\` lacks the text API/component.

Vault source keeps the \`@/src/sdk\` and \`@/src/ui\` authoring aliases. Obtain
\`sdk\` with \`useFlapSdk()\`, then call the reader from an async effect or event
handler. Import \`IpfsText\` and \`IpfsImage\` from the UI alias for rendering:

\`\`\`tsx
const body = await sdk.readIpfsText(textCid);
// Parse JSON only if the application expects JSON content.
const post = JSON.parse(await sdk.readIpfsText(jsonCid));
\`\`\`

\`\`\`tsx
<IpfsText cid={item.textCid} fallback={i18n.t("contentLoading")} />
<IpfsImage cid={item.imageCid} alt={i18n.t("postImageAlt")} />
\`\`\`

Use safe relative \`path\` values for directory CIDs, never a gateway URL or
\`ipfs://\` URI. The runtime controls gateways and validates every CID/path.
Text reads omit credentials/referrers, reject redirects and HTML responses,
enforce UTF-8 and a 256 KiB limit, and have an 8-second network/body deadline
after acquiring an active slot. Reads are deduplicated, cached and concurrency
limited. \`IpfsText\` does not interpret HTML or Markdown. Localize loading/error
and alt text, and paginate feeds. \`IpfsBackground\` remains static CID-only.

Dynamic content sources require human review. Upgrade Workbench and Flap hosts
to the published runtime and deploy Workbench's matching static checker before
accepting new components. Reads use platform gateways without a new host route;
uploads continue through the existing host-owned upload service. Automated
upload fixtures are mocked and do not verify live gateway availability.

Source documentation:

- [API guide](https://github.com/flap-sh/flap-vault-component-template/blob/main/docs/ipfs-content.md)
- [API 说明](https://github.com/flap-sh/flap-vault-component-template/blob/main/docs/ipfs-content.zh-CN.md)
- [Release and upgrade notes](https://github.com/flap-sh/flap-vault-component-template/blob/main/docs/releases/0.1.37.md)
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
