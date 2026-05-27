#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const ROOT = process.cwd();
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const FOLDER_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FOLDER_NAME_MIN_LENGTH = 3;
const FOLDER_NAME_MAX_LENGTH = 64;
const ARTIFACT_ID_RE = /^vaultui_([a-z0-9]+(?:-[a-z0-9]+)*)_([0-9A-HJKMNPQRSTVWXYZ]{26})$/;
const FORBIDDEN_NAMES = new Set(["node_modules", ".git", ".vercel", ".env", ".env.local", "package-lock.json", "pnpm-lock.yaml"]);
const REQUIRED_FILES = ["Component.tsx", "manifest.json", "VaultABI.ts", "i18n.json"];
const ALLOWED_VAULT_FILES = new Set(REQUIRED_FILES);
const ALLOWED_RELATIVE_IMPORTS = new Set(["./VaultABI"]);
const ALLOWED_MANIFEST_KEYS = new Set(["artifactId", "name", "match", "i18n", "endpoints"]);
const ALLOWED_MATCH_KEYS = new Set(["bindings"]);
const ALLOWED_BINDING_ENTRY_KEYS = new Set(["chainId", "factoryAddress", "vaultAddresses", "tokenAddresses"]);
const STANDARD_ERC20_METHODS = ["balanceOf", "allowance", "approve", "decimals", "symbol", "transfer", "transferFrom"];
const ALLOWED_IMPORTS = [
  "react",
  "viem",
  "decimal.js",
  "lucide-react",
  "@/src/sdk",
  "@/src/ui",
];
const FORBIDDEN_IMPORTS = [
  "wagmi",
  "@wagmi/core",
  "@rainbow-me/rainbowkit",
  "ethers",
  "axios",
  "next/image",
  "next/script",
  "framer-motion",
  "recharts",
];
const APPROVED_EXPLORER_ORIGINS = new Set(["https://bscscan.com", "https://testnet.bscscan.com"]);
const DEFAULT_ALLOWED_URL_PREFIXES = [];
const APPROVED_CONTRACT_LABEL_RE = /\b(?:vault|token|nft)\b/i;
const APPROVED_CONTRACT_ADDRESS_KEYWORD_RE =
  /(vaultaddress|tokenaddress|paymenttoken|quotetoken|dividendtoken|rewardtoken|staketoken|taxtoken|targettoken|targetasset|approvedbuybacktoken|proposedtoken|nftaddress|nft|lptoken|assettoken|underlyingtoken|taxtoken|buybacktoken)/i;
const FORBIDDEN_CONTRACT_ADDRESS_KEYWORD_RE = /(router|bridge|factory|oracle|aggregator|pair|amm|treasury|governor)/i;

const BLOCKING = "blocking";
const WARNING = "warning";
const INFO = "info";
const TYPE_BINDING_KEYS = new Set(["vault" + "Type", "vault" + "Types"]);

const FIX_HINTS = {
  "cli/missing-folder-name": "Run yarn vault:check <folder-name> with a registered Vault folder name.",
  "cli/invalid-folder-name": "Use a 3-64 character lowercase kebab-case folder name, for example my-vault.",
  "package-structure/missing-vault-dir": "Create the package with yarn vault:scaffold <folder-name> --chain 56 --factory 0x... or add src/vaults/<folder-name>.",
  "package-structure/missing-required-file": "Keep exactly Component.tsx, manifest.json, VaultABI.ts, and i18n.json in the Vault folder.",
  "package-structure/disallowed-vault-file": "Move helpers, assets, nested components, docs, and sample data outside src/vaults/<folder-name> or inline small code in Component.tsx.",
  "preview-registration/missing-vault-module": "Register the folder name in src/vaults/index.ts with loadComponent, loadManifest, and loadI18n entries.",
  "forbidden-files/disallowed-entry": "Remove environment, dependency, git, or build output files from the Vault package.",
  "manifest-schema/invalid-json": "Fix JSON syntax in manifest.json.",
  "manifest-schema/disallowed-field": "Remove internal runtime fields. Developer manifest fields are artifactId, name, match, i18n, and optional endpoints. chain IDs are declared inside match.bindings entries.",
  "manifest-schema/missing-field": "Add the required manifest field.",
  "manifest-schema/invalid-artifact-id": "Use artifactId format vaultui_<folder-name>_<26-char ULID>, for example vaultui_my-vault_01HZY7J4S9D0W5XJ8H2Q3K4M5N.",
  "manifest-schema/artifact-id-folder-name-mismatch": "Make the artifactId folder-name segment match the src/vaults/<folder-name> folder name.",
  "manifest-schema/duplicate-artifact-id": "Generate a new artifactId; each Vault package in the repo must have a unique artifactId.",
  "manifest-schema/invalid-name": "Set manifest.name to a human-readable string with at least two characters.",
  "manifest-schema/invalid-match": "Set manifest.match to an object with bindings (array of {chainId, factoryAddress} pairs).",
  "manifest-schema/disallowed-match-field": "Keep match limited to bindings. If a reference token CA list is needed, declare it only as match.bindings[].tokenAddresses.",
  "manifest-binding/missing-bindings": "Add match.bindings as a non-empty array of {chainId, factoryAddress} pairs. Example: [{chainId: 56, factoryAddress: '0x...'}]",
  "manifest-binding/duplicate-binding": "Remove duplicate match.bindings entries with the same chainId + factoryAddress pair. Merge any binding-scoped reference lists into one entry.",
  "manifest-binding/invalid-binding-entry": "Each match.bindings entry must be an object with chainId (positive integer) and factoryAddress (0x address).",
  "manifest-binding/disallowed-binding-field": "Binding entries may only contain chainId, factoryAddress, optional vaultAddresses, and optional tokenAddresses.",
  "manifest-binding/invalid-chain-id": "chainId must be a positive integer, for example 56 for BNB Chain or 97 for BNB Testnet.",
  "manifest-binding/invalid-address": "Use a full 20-byte EVM address matching 0x plus 40 hex characters.",
  "manifest-binding/ca-policy-not-in-manifest": "Remove global CA policy fields. Use match.bindings[].tokenAddresses only when a reference token CA list is needed.",
  "manifest-binding/invalid-vault-address-list": "Use a non-empty array for a binding entry's vaultAddresses reference list, or omit it when no binding-scoped Vault references need to be recorded.",
  "manifest-binding/invalid-token-address-list": "Use a non-empty array of valid EVM addresses for a binding entry's tokenAddresses, or omit it when no reference token CA list is needed.",
  "manifest-binding/no-type-based-binding": "Remove vaultType/vaultTypes from manifest matching. Binding intent must use chain and factory targets.",
  "i18n-policy/manifest-locales": "Declare at least one locale in manifest.i18n.",
  "i18n-policy/duplicate-manifest-locale": "Remove duplicate locale entries from manifest.i18n.",
  "i18n-policy/invalid-json": "Fix JSON syntax in i18n.json.",
  "i18n-policy/missing-locale": "Add the locale object to i18n.json or remove that locale from manifest.i18n.",
  "i18n-policy/missing-locale-key": "Add the missing key to each locale declared by manifest.i18n.",
  "i18n-policy/used-key-missing-locale": "Every key used by t(...) or i18n.t(...) must exist in each declared locale.",
  "endpoint-policy/invalid-endpoints": "Set manifest.endpoints to a single HTTPS URL string, a non-empty array of HTTPS URL strings, or remove it when no endpoint is needed.",
  "endpoint-policy/invalid-endpoint-declaration": "Endpoint declarations must be HTTPS URL strings only.",
  "endpoint-policy/https-required": "Use an HTTPS endpoint URL string, or remove the endpoint.",
  "endpoint-policy/undeclared-url": "Remove the URL or declare a non-oracle https endpoint in manifest.endpoints for review.",
  "endpoint-policy/relative-endpoint": "Do not call host-relative endpoints from Vault source. Use SDK/on-chain reads or declare an approved https endpoint.",
  "manual-review/external-endpoint": "Prefer removing the endpoint. If it is unavoidable, keep the declaration for Flap review.",
  "manual-review/oracle-usage": "Do not add oracle config to manifest. Flap Artifact Workbench/runtime must provision the oracle id.",
  "manual-review/action-stage-gating": "Add context.host?.marketPhase and isActionAvailableForPhase(...) for internal-market vs DEX-listed button gating. Preview both marketPhase=internal-market and marketPhase=dex-listed.",
  "forbidden-api/direct-window-ethereum": "Use sdk.wallet and SDK contract methods instead of direct wallet APIs.",
  "forbidden-api/eval": "Remove eval and implement the logic as normal TypeScript.",
  "forbidden-api/new-function": "Remove new Function and implement the logic as normal TypeScript.",
  "forbidden-api/iframe": "Do not embed iframe UI inside a Vault component.",
  "forbidden-api/script": "Do not inject scripts inside a Vault component.",
  "forbidden-api/dangerously-set-inner-html": "Render structured React content instead of raw HTML.",
  "forbidden-api/remote-import": "Remove runtime remote imports. Use only approved local package imports.",
  "imports-and-dependencies/disallowed-relative-import": "Inline small helpers in Component.tsx or use @/src/sdk and @/src/ui. The only local relative import is ./VaultABI.",
  "imports-and-dependencies/forbidden-import": "Use Flap SDK/UI primitives instead of host wallet, app, or heavy UI dependencies.",
  "imports-and-dependencies/external-sdk-package": "Do not introduce additional SDK packages. Use only the shared @/src/sdk and @/src/ui runtime surfaces.",
  "imports-and-dependencies/unreviewed-import": "Remove the dependency unless Flap explicitly approves it.",
  "imports-and-dependencies/dynamic-import": "Use static imports only.",
  "media-policy/remote-media": "Remove remote media. Media is controlled by Flap Artifact Workbench/runtime policy.",
  "security/hardcoded-address": "Use context.vaultAddress, context.tokenAddress, or approved runtime context instead of hardcoded addresses in source code.",
  "navigation-policy/unapproved-external-navigation": "Do not navigate users to arbitrary external sites. Keep component-owned links on the current chain explorer only, and use host-reviewed allowlists for any exceptional metadata/oracle origin during review.",
  "contract-boundary/missing-contract-label": "Add a human-readable contract label such as vault, token, or nft so review and static checks can classify the call target.",
  "contract-boundary/disallowed-contract-label": "Limit contract labels to vault/token/nft-related targets. Do not interact with routers, bridges, aggregators, or unrelated app contracts from a Vault package.",
  "contract-boundary/disallowed-contract-address-source": "Keep contract targets on context.vaultAddress and token/NFT-related addresses derived from runtime context or Vault reads only.",
  "performance/refetch-too-fast": "Use a refetch interval of at least 5000ms unless Flap approves a faster polling path.",
  "contract-abi/number-bigint": "Keep token amounts as bigint/Decimal and avoid Number(...) for transaction math.",
  "contract-abi/standard-erc20-in-vault-abi": "Use erc20Abi or standardErc20Abi from @/src/sdk for standard ERC20 methods. Add token ABI fragments to VaultABI.ts only for custom token mechanics.",
};

function issue(severity, ruleId, message, extra = {}) {
  return { severity, ruleId, message, fixHint: FIX_HINTS[ruleId], ...extra };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      files.push({ path: full, name, isDirectory: true });
      walk(full, files);
    } else {
      files.push({ path: full, name, isDirectory: false });
    }
  }
  return files;
}

function lineFor(content, pattern) {
  const index = content.search(pattern);
  if (index < 0) return undefined;
  return content.slice(0, index).split("\n").length;
}

function lineForIndex(content, index) {
  if (typeof index !== "number" || index < 0) return undefined;
  return content.slice(0, index).split("\n").length;
}

function normalizeManifestEndpoints(endpoints) {
  if (endpoints === undefined) return [];
  if (typeof endpoints === "string") return [endpoints];
  if (Array.isArray(endpoints)) return endpoints;
  return null;
}

function collectDeclaredUrls(manifest) {
  const urls = new Set();
  const normalized = normalizeManifestEndpoints(manifest.endpoints);
  if (!normalized) return urls;
  for (const endpoint of normalized) {
    if (typeof endpoint === "string") urls.add(endpoint);
  }
  return urls;
}

function isHttpsUrl(value) {
  return typeof value === "string" && /^https:\/\//.test(value);
}

function isDeclaredUrl(url, declaredUrls) {
  for (const declared of declaredUrls) {
    const normalized = declared.replace(/\/+$/, "");
    if (url === normalized) return true;
    if (url.startsWith(`${normalized}/`) || url.startsWith(`${normalized}?`) || url.startsWith(`${normalized}#`)) return true;
  }
  return false;
}

function hasTypeBasedBinding(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasTypeBasedBinding(item));
  return Object.entries(value).some(([key, item]) => TYPE_BINDING_KEYS.has(key) || hasTypeBasedBinding(item));
}

function normalizeRelativeImport(spec) {
  return spec.replace(/\.(tsx?|jsx?|mjs|cjs)$/, "");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeUrlLiteral(value) {
  return value.replace(/[),.;\]}]+$/, "");
}

function normalizeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function matchesAllowlistPrefix(url, prefixes) {
  for (const prefix of prefixes) {
    const normalized = prefix.replace(/\/+$/, "");
    if (url === normalized) return true;
    if (url.startsWith(`${normalized}/`) || url.startsWith(`${normalized}?`) || url.startsWith(`${normalized}#`)) return true;
  }
  return false;
}

function isApprovedNavigationUrl(url) {
  const origin = normalizeOrigin(url);
  return Boolean(origin && APPROVED_EXPLORER_ORIGINS.has(origin));
}

function isAllowlistedExternalUrl(url, declaredUrls) {
  return isDeclaredUrl(url, declaredUrls) || isApprovedNavigationUrl(url) || matchesAllowlistPrefix(url, DEFAULT_ALLOWED_URL_PREFIXES);
}

function isValidFolderName(folderName) {
  return (
    typeof folderName === "string" &&
    folderName.length >= FOLDER_NAME_MIN_LENGTH &&
    folderName.length <= FOLDER_NAME_MAX_LENGTH &&
    FOLDER_NAME_RE.test(folderName)
  );
}

function getManifestLocales(manifest) {
  if (!Array.isArray(manifest.i18n)) return [];
  return manifest.i18n.filter((locale) => typeof locale === "string" && locale.trim().length > 0).map((locale) => locale.trim());
}

function isFolderNameRegistered(folderName) {
  const indexPath = path.join(ROOT, "src", "vaults", "index.ts");
  if (!fs.existsSync(indexPath)) return false;
  const content = fs.readFileSync(indexPath, "utf8");
  return content.includes(`./${folderName}/Component`) && content.includes(`./${folderName}/manifest.json`) && content.includes(`./${folderName}/i18n.json`);
}

function getNodeText(sourceFile, node) {
  return node?.getText(sourceFile) ?? "";
}

function extractObjectProperty(objectLiteral, propertyName) {
  return objectLiteral.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === propertyName) ||
        (ts.isStringLiteral(property.name) && property.name.text === propertyName)),
  );
}

function normalizeContractAddressExpression(expressionText) {
  return expressionText.replace(/\s+/g, "").toLowerCase();
}

function isApprovedContractAddressExpression(expressionText) {
  const normalized = normalizeContractAddressExpression(expressionText);
  if (!normalized) return false;
  if (FORBIDDEN_CONTRACT_ADDRESS_KEYWORD_RE.test(normalized)) return false;
  if (normalized.includes("context.vaultaddress") || normalized.includes("context.tokenaddress")) return true;
  if (normalized.includes("sdk.context.vaultaddress") || normalized.includes("sdk.context.tokenaddress")) return true;
  return APPROVED_CONTRACT_ADDRESS_KEYWORD_RE.test(normalized);
}

function collectContractInteractionIssues(content, file) {
  const issues = [];
  const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind);

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;
      if (methodName === "readContract" || methodName === "simulateContract" || methodName === "writeContract") {
        const request = node.arguments[0];
        if (methodName === "writeContract" && ts.isPropertyAccessExpression(request) && request.name.text === "request") {
          return ts.forEachChild(node, visit);
        }
        if (request && ts.isObjectLiteralExpression(request)) {
          const contractProperty = extractObjectProperty(request, "contract");
          const addressProperty = extractObjectProperty(request, "address");
          if (!contractProperty) {
            issues.push(
              issue(BLOCKING, "contract-boundary/missing-contract-label", `${methodName} call is missing a contract label.`, {
                file,
                line: lineForIndex(content, request.getStart(sourceFile)),
              }),
            );
          } else if (
            !ts.isStringLiteral(contractProperty.initializer) &&
            !ts.isNoSubstitutionTemplateLiteral(contractProperty.initializer)
          ) {
            issues.push(
              issue(BLOCKING, "contract-boundary/disallowed-contract-label", `${methodName} contract label must be a simple string literal classified as vault/token/nft.`, {
                file,
                line: lineForIndex(content, contractProperty.initializer.getStart(sourceFile)),
              }),
            );
          } else {
            const contractLabel = contractProperty.initializer.text;
            if (!APPROVED_CONTRACT_LABEL_RE.test(contractLabel)) {
              issues.push(
                issue(BLOCKING, "contract-boundary/disallowed-contract-label", `${methodName} target "${contractLabel}" is outside the allowed vault/token/nft boundary.`, {
                  file,
                  line: lineForIndex(content, contractProperty.initializer.getStart(sourceFile)),
                }),
              );
            }
          }

          if (addressProperty) {
            const addressText = getNodeText(sourceFile, addressProperty.initializer);
            if (!isApprovedContractAddressExpression(addressText)) {
              issues.push(
                issue(
                  BLOCKING,
                  "contract-boundary/disallowed-contract-address-source",
                  `${methodName} address source ${addressText} is outside the allowed Vault/token/NFT runtime boundary.`,
                  {
                    file,
                    line: lineForIndex(content, addressProperty.initializer.getStart(sourceFile)),
                  },
                ),
              );
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return issues;
}

function collectDynamicImportIssues(content, file) {
  const issues = [];
  const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind);

  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = node.arguments[0] ? getNodeText(sourceFile, node.arguments[0]) : "<dynamic>";
      issues.push(
        issue(BLOCKING, "imports-and-dependencies/dynamic-import", `Dynamic import ${specifier} is not allowed inside a Vault package.`, {
          file,
          line: lineForIndex(content, node.getStart(sourceFile)),
        }),
      );
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return issues;
}

function checkStructure(vaultDir) {
  const issues = [];
  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(vaultDir, file))) {
      issues.push(issue(BLOCKING, "package-structure/missing-required-file", `Missing ${file}.`, { file }));
    }
  }
  for (const item of walk(vaultDir)) {
    const rel = path.relative(ROOT, item.path);
    const relToVault = path.relative(vaultDir, item.path);
    if (item.isDirectory || relToVault.includes(path.sep) || !ALLOWED_VAULT_FILES.has(item.name)) {
      issues.push(issue(BLOCKING, "package-structure/disallowed-vault-file", `Vault folder may contain only ${REQUIRED_FILES.join(", ")}. Move ${item.name} outside src/vaults/${path.basename(vaultDir)}.`, { file: rel }));
      continue;
    }
    if (FORBIDDEN_NAMES.has(item.name)) {
      issues.push(issue(BLOCKING, "forbidden-files/disallowed-entry", `Forbidden entry ${item.name} found.`, { file: rel }));
    }
    if (!item.isDirectory && item.name.match(/\.(png|jpe?g|gif|webp|svg)$/i)) {
      issues.push(issue(WARNING, "media/local-asset", `Local media asset ${item.name} is not part of the Vault package. Keep media controlled by Flap Artifact Workbench/runtime policy.`, { file: rel }));
    }
  }
  return issues;
}

function checkArtifactIdUniqueness(folderName, artifactId) {
  const issues = [];
  if (!artifactId || typeof artifactId !== "string") return issues;
  const vaultsDir = path.join(ROOT, "src", "vaults");
  if (!fs.existsSync(vaultsDir)) return issues;
  for (const entry of fs.readdirSync(vaultsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === folderName) continue;
    const manifestPath = path.join(vaultsDir, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const otherManifest = readJson(manifestPath);
      if (otherManifest.artifactId === artifactId) {
        issues.push(
          issue(
            BLOCKING,
            "manifest-schema/duplicate-artifact-id",
            `artifactId ${artifactId} is already used by src/vaults/${entry.name}/manifest.json.`,
            { field: "artifactId", file: `src/vaults/${entry.name}/manifest.json` },
          ),
        );
      }
    } catch {
      // The checked folder should report JSON errors for itself. Ignore broken sibling manifests here.
    }
  }
  return issues;
}

function checkManifest(manifest, folderName) {
  const issues = [];
  for (const key of Object.keys(manifest || {})) {
    if (!ALLOWED_MANIFEST_KEYS.has(key)) {
      const ruleId = key === "restrictTokenAddresses" || key === "tokenAddresses" || key === "caPolicy" ? "manifest-binding/ca-policy-not-in-manifest" : "manifest-schema/disallowed-field";
      issues.push(
        issue(
          BLOCKING,
          ruleId,
          `manifest.json field ${key} is not developer-declared. Keep manifest limited to artifactId, name, match, i18n, and endpoints.`,
          { field: key },
        ),
      );
    }
  }
  const required = ["artifactId", "name", "match", "i18n"];
  for (const key of required) {
    if (manifest[key] === undefined) issues.push(issue(BLOCKING, "manifest-schema/missing-field", `manifest.json missing ${key}.`, { field: key }));
  }
  if (manifest.artifactId !== undefined) {
    const artifactMatch = typeof manifest.artifactId === "string" ? ARTIFACT_ID_RE.exec(manifest.artifactId) : null;
    if (!artifactMatch) {
      issues.push(issue(BLOCKING, "manifest-schema/invalid-artifact-id", "manifest.artifactId must match vaultui_<folder-name>_<26-char ULID>.", { field: "artifactId" }));
    } else if (artifactMatch[1] !== folderName) {
      issues.push(
        issue(
          BLOCKING,
          "manifest-schema/artifact-id-folder-name-mismatch",
          `manifest.artifactId folder-name segment ${artifactMatch[1]} must match Vault folder name ${folderName}.`,
          { field: "artifactId" },
        ),
      );
    }
  }
  if (manifest.name !== undefined && (!isNonEmptyString(manifest.name) || manifest.name.trim().length < 2)) {
    issues.push(issue(BLOCKING, "manifest-schema/invalid-name", "manifest.name must be a human-readable string with at least two characters.", { field: "name" }));
  }
  // Detect old chainIds top-level field and report it as disallowed
  if (Object.prototype.hasOwnProperty.call(manifest, "chainIds")) {
    issues.push(
      issue(
        BLOCKING,
        "manifest-schema/disallowed-field",
        "manifest.chainIds is no longer supported. Declare chain IDs inside match.bindings entries: [{chainId: 56, factoryAddress: '0x...'}].",
        { field: "chainIds" },
      ),
    );
  }
  if (manifest.match && (typeof manifest.match !== "object" || Array.isArray(manifest.match))) {
    issues.push(issue(BLOCKING, "manifest-schema/invalid-match", "manifest.match must be an object with bindings (array).", { field: "match" }));
  } else if (manifest.match) {
    for (const key of Object.keys(manifest.match)) {
      if (!ALLOWED_MATCH_KEYS.has(key)) {
        const ruleId = key === "restrictTokenAddresses" || key === "tokenAddresses" || key === "caPolicy" ? "manifest-binding/ca-policy-not-in-manifest" : "manifest-schema/disallowed-match-field";
        issues.push(issue(BLOCKING, ruleId, `manifest.match.${key} is not allowed. Use match.bindings only; token CA reference lists belong inside individual binding entries.`, { field: `match.${key}` }));
      }
    }
    if (manifest.match.chains !== undefined) {
      issues.push(
        issue(
          BLOCKING,
          "manifest-schema/disallowed-match-field",
          "manifest.match.chains is no longer supported. Use match.bindings for chain/factory targets.",
          { field: "match.chains" },
        ),
      );
    }
    if (!Array.isArray(manifest.match.bindings) || manifest.match.bindings.length === 0) {
      issues.push(issue(BLOCKING, "manifest-binding/missing-bindings", "manifest.match.bindings must be a non-empty array of {chainId, factoryAddress} pairs.", { field: "match.bindings" }));
    } else {
      const seenBindingKeys = new Map();
      for (const [index, bindingEntry] of manifest.match.bindings.entries()) {
        const field = `match.bindings[${index}]`;
        if (!bindingEntry || typeof bindingEntry !== "object" || Array.isArray(bindingEntry)) {
          issues.push(issue(BLOCKING, "manifest-binding/invalid-binding-entry", `${field} must be an object with chainId and factoryAddress.`, { field }));
          continue;
        }
        for (const key of Object.keys(bindingEntry)) {
          if (!ALLOWED_BINDING_ENTRY_KEYS.has(key)) {
            const ruleId = key === "caPolicy" || key === "restrictTokenAddresses" ? "manifest-binding/ca-policy-not-in-manifest" : "manifest-binding/disallowed-binding-field";
            issues.push(issue(BLOCKING, ruleId, `${field}.${key} is not allowed. Binding entries may only have chainId, factoryAddress, vaultAddresses, and optional tokenAddresses.`, { field: `${field}.${key}` }));
          }
        }
        if (!Number.isInteger(bindingEntry.chainId) || bindingEntry.chainId <= 0) {
          issues.push(issue(BLOCKING, "manifest-binding/invalid-chain-id", `${field}.chainId must be a positive integer (for example 56 or 97).`, { field: `${field}.chainId` }));
        }
        if (!ADDRESS_RE.test(bindingEntry.factoryAddress)) {
          issues.push(issue(BLOCKING, "manifest-binding/invalid-address", `${field}.factoryAddress is not a valid 0x address.`, { field: `${field}.factoryAddress` }));
        }
        if (Number.isInteger(bindingEntry.chainId) && ADDRESS_RE.test(bindingEntry.factoryAddress)) {
          const bindingKey = `${bindingEntry.chainId}:${bindingEntry.factoryAddress.toLowerCase()}`;
          const firstField = seenBindingKeys.get(bindingKey);
          if (firstField) {
            issues.push(
              issue(
                BLOCKING,
                "manifest-binding/duplicate-binding",
                `${field} duplicates ${firstField}. Each chainId + factoryAddress pair must appear only once.`,
                { field },
              ),
            );
          } else {
            seenBindingKeys.set(bindingKey, field);
          }
        }
        if (bindingEntry.vaultAddresses !== undefined) {
          if (!Array.isArray(bindingEntry.vaultAddresses) || bindingEntry.vaultAddresses.length === 0) {
            issues.push(issue(BLOCKING, "manifest-binding/invalid-vault-address-list", `${field}.vaultAddresses must be a non-empty array when provided.`, { field: `${field}.vaultAddresses` }));
          } else {
            for (const addr of bindingEntry.vaultAddresses) {
              if (!ADDRESS_RE.test(addr)) {
                issues.push(issue(BLOCKING, "manifest-binding/invalid-address", `${field}.vaultAddresses contains invalid address: ${addr}.`, { field: `${field}.vaultAddresses` }));
              }
            }
          }
        }
        if (bindingEntry.tokenAddresses !== undefined) {
          if (!Array.isArray(bindingEntry.tokenAddresses) || bindingEntry.tokenAddresses.length === 0) {
            issues.push(issue(BLOCKING, "manifest-binding/invalid-token-address-list", `${field}.tokenAddresses must be a non-empty array when provided.`, { field: `${field}.tokenAddresses` }));
          } else {
            for (const addr of bindingEntry.tokenAddresses) {
              if (!ADDRESS_RE.test(addr)) {
                issues.push(issue(BLOCKING, "manifest-binding/invalid-address", `${field}.tokenAddresses contains invalid address: ${addr}.`, { field: `${field}.tokenAddresses` }));
              }
            }
          }
        }
      }
    }
  }
  if (hasTypeBasedBinding(manifest)) {
    issues.push(issue(BLOCKING, "manifest-binding/no-type-based-binding", "Do not use type-based binding for custom UI matching."));
  }
  const manifestLocales = getManifestLocales(manifest);
  if (!Array.isArray(manifest.i18n) || manifestLocales.length === 0) {
    issues.push(issue(BLOCKING, "i18n-policy/manifest-locales", "manifest.i18n must declare at least one locale."));
  } else if (new Set(manifestLocales).size !== manifestLocales.length) {
    issues.push(issue(BLOCKING, "i18n-policy/duplicate-manifest-locale", "manifest.i18n must not contain duplicate locales."));
  }
  const manifestEndpoints = normalizeManifestEndpoints(manifest.endpoints);
  if (manifestEndpoints === null) {
    issues.push(issue(BLOCKING, "endpoint-policy/invalid-endpoints", "manifest.endpoints must be a string or array of strings when provided.", { field: "endpoints" }));
  } else {
    if (manifest.endpoints !== undefined && manifestEndpoints.length === 0) {
      issues.push(issue(BLOCKING, "endpoint-policy/invalid-endpoints", "manifest.endpoints must contain at least one HTTPS URL when provided.", { field: "endpoints" }));
    }
    for (const [index, endpoint] of manifestEndpoints.entries()) {
      const field = Array.isArray(manifest.endpoints) ? `endpoints.${index}` : "endpoints";
      if (!isNonEmptyString(endpoint)) {
        issues.push(issue(BLOCKING, "endpoint-policy/invalid-endpoint-declaration", `Endpoint declaration at ${field} must be a non-empty HTTPS URL string.`, { field }));
        continue;
      }
      if (!isHttpsUrl(endpoint)) {
        issues.push(issue(BLOCKING, "endpoint-policy/https-required", `Endpoint ${endpoint} must use https.`, { field }));
      } else {
        issues.push(issue(WARNING, "manual-review/external-endpoint", `Declared external endpoint ${endpoint}. External endpoints are discouraged and require Flap review approval before publish.`, { field }));
      }
    }
  }
  return issues;
}

function checkI18n(i18n, manifestLocales) {
  const issues = [];
  if (!manifestLocales.length) return issues;
  const presentLocales = [];
  for (const locale of manifestLocales) {
    if (!i18n[locale] || typeof i18n[locale] !== "object" || Array.isArray(i18n[locale])) {
      issues.push(issue(BLOCKING, "i18n-policy/missing-locale", `i18n.json must include manifest locale ${locale}.`, { locale }));
    } else {
      presentLocales.push(locale);
    }
  }
  if (presentLocales.length < 2) return issues;

  const allKeys = new Set();
  for (const locale of presentLocales) {
    for (const key of Object.keys(i18n[locale])) allKeys.add(key);
  }
  for (const key of allKeys) {
    for (const locale of presentLocales) {
      if (!Object.prototype.hasOwnProperty.call(i18n[locale], key)) {
        issues.push(issue(BLOCKING, "i18n-policy/missing-locale-key", `${locale} is missing key ${key}.`, { locale, key }));
      }
    }
  }
  return issues;
}

function checkCode(vaultDir, manifest, i18n, manifestLocales) {
  const issues = [];
  const declaredUrls = collectDeclaredUrls(manifest);
  const sourceFiles = walk(vaultDir).filter((item) => !item.isDirectory && item.name.match(/\.(ts|tsx|js|jsx)$/));
  for (const item of sourceFiles) {
    const rel = path.relative(ROOT, item.path);
    const content = fs.readFileSync(item.path, "utf8");
    const checks = [
      [/window\.ethereum/, "forbidden-api/direct-window-ethereum", "Direct window.ethereum access is not allowed."],
      [/\beval\s*\(/, "forbidden-api/eval", "eval() is not allowed."],
      [/new\s+Function\s*\(/, "forbidden-api/new-function", "new Function() is not allowed."],
      [/<iframe\b/i, "forbidden-api/iframe", "iframe UI is not allowed."],
      [/<script\b/i, "forbidden-api/script", "script injection is not allowed."],
      [/dangerouslySetInnerHTML/, "forbidden-api/dangerously-set-inner-html", "dangerouslySetInnerHTML needs explicit review and is blocked by default."],
      [/import\s*\(\s*["'`]https?:\/\//, "forbidden-api/remote-import", "Runtime remote import is not allowed inside Vault components."],
    ];
    for (const [pattern, ruleId, message] of checks) {
      if (pattern.test(content)) {
        issues.push(issue(BLOCKING, ruleId, message, { file: rel, line: lineFor(content, pattern) }));
      }
    }
    const importRegex = /from\s+["'`]([^"'`]+)["'`]|import\s+["'`]([^"'`]+)["'`]/g;
    for (const match of content.matchAll(importRegex)) {
      const spec = match[1] || match[2];
      if (spec.startsWith("./") || spec.startsWith("../")) {
        if (!ALLOWED_RELATIVE_IMPORTS.has(normalizeRelativeImport(spec))) {
          issues.push(issue(BLOCKING, "imports-and-dependencies/disallowed-relative-import", `Only ./VaultABI may be imported from a Vault package. ${spec} is not allowed because src/vaults/${path.basename(vaultDir)} has a fixed file set.`, { file: rel }));
        }
      } else if (FORBIDDEN_IMPORTS.some((blocked) => spec === blocked || spec.startsWith(`${blocked}/`))) {
        issues.push(issue(BLOCKING, "imports-and-dependencies/forbidden-import", `Forbidden import ${spec}. Use Flap SDK/UI primitives instead.`, { file: rel }));
      } else if (/sdk/i.test(spec) && !ALLOWED_IMPORTS.some((allowed) => spec === allowed || spec.startsWith(allowed))) {
        issues.push(issue(BLOCKING, "imports-and-dependencies/external-sdk-package", `External SDK-style import ${spec} is not allowed. Use the shared @/src/sdk and @/src/ui surfaces only.`, { file: rel }));
      } else if (!ALLOWED_IMPORTS.some((allowed) => spec === allowed || spec.startsWith(allowed))) {
        issues.push(issue(WARNING, "imports-and-dependencies/unreviewed-import", `Import ${spec} is not in the default allowlist.`, { file: rel }));
      }
    }
    issues.push(...collectDynamicImportIssues(content, rel));
    const oracleIds = new Set();
    const oracleCallRegex = /\breadOracle(?:<[^>]+>)?\(\s*["'`]([^"'`]+)["'`]/g;
    for (const match of content.matchAll(oracleCallRegex)) {
      oracleIds.add(match[1]);
    }
    for (const oracleId of oracleIds) {
      issues.push(
        issue(
          INFO,
          "manual-review/oracle-usage",
          `Oracle ${oracleId} is used by code. Do not declare oracle config in manifest.json; Flap Artifact Workbench/runtime must review and provision it.`,
          { file: rel },
        ),
      );
    }
    const externalUrlRegex = /\b(?:https?:\/\/|wss?:\/\/|ipfs:\/\/|ar:\/\/)[^\s"'`<>)]+/g;
    const dataUrlRegex = /\bdata:(?:image|video|audio|text\/html)[^\s"'`)]+/gi;
    const relativeFetchRegex = /\bfetch\s*\(\s*["'`]\/(?!\/)[^"'`)]*["'`]/g;
    const externalNavigationRegexes = [
      /\bhref\s*=\s*(?:\{)?["'`](https?:\/\/[^"'`\s}]+)["'`]/g,
      /\bwindow\.open\s*\(\s*["'`](https?:\/\/[^"'`\s]+)["'`]/g,
      /\blocation(?:\.href)?\s*=\s*["'`](https?:\/\/[^"'`\s]+)["'`]/g,
      /\blocation\.(?:assign|replace)\s*\(\s*["'`](https?:\/\/[^"'`\s]+)["'`]/g,
      /\brouter\.(?:push|replace)\s*\(\s*["'`](https?:\/\/[^"'`\s]+)["'`]/g,
    ];
    for (const match of content.matchAll(relativeFetchRegex)) {
      issues.push(
        issue(
          BLOCKING,
          "endpoint-policy/relative-endpoint",
          "Host-relative fetch calls are not allowed inside Vault source because they can hide private app endpoints.",
          { file: rel, line: lineForIndex(content, match.index) },
        ),
      );
    }
    for (const navigationRegex of externalNavigationRegexes) {
      for (const match of content.matchAll(navigationRegex)) {
        const url = sanitizeUrlLiteral(match[1]);
        if (!isApprovedNavigationUrl(url)) {
          issues.push(
            issue(
              BLOCKING,
              "navigation-policy/unapproved-external-navigation",
              `External navigation ${url} is not allowed inside a Vault component. Keep user-facing navigation on the chain explorer only.`,
              { file: rel, line: lineForIndex(content, match.index) },
            ),
          );
        }
      }
    }
    for (const match of content.matchAll(externalUrlRegex)) {
      const url = sanitizeUrlLiteral(match[0]);
      if (!isAllowlistedExternalUrl(url, declaredUrls)) {
        issues.push(issue(BLOCKING, "endpoint-policy/undeclared-url", `URL ${url} is not declared in manifest endpoints. Undeclared endpoints and external resources are rejected.`, { file: rel, line: lineForIndex(content, match.index) }));
      }
    }
    for (const match of content.matchAll(dataUrlRegex)) {
      issues.push(
        issue(
          BLOCKING,
          "media-policy/remote-media",
          "Embedded data URL media is not allowed inside Vault source. Use Flap-controlled media/runtime policy instead.",
          { file: rel, line: lineForIndex(content, match.index) },
        ),
      );
    }
    if (/url\(\s*["']?(?:https?:\/\/|ipfs:\/\/|ar:\/\/|data:)/i.test(content) || /<img[^>]+src=["'](?:https?:\/\/|ipfs:\/\/|ar:\/\/|data:)/i.test(content)) {
      issues.push(issue(BLOCKING, "media-policy/remote-media", "Remote media is not developer-declared in this template. Use Flap-controlled media/runtime policy instead.", { file: rel }));
    }
    const hardcodedAddressRegex = /["'`]0x[a-fA-F0-9]{40}["'`]/g;
    for (const match of content.matchAll(hardcodedAddressRegex)) {
      issues.push(issue(BLOCKING, "security/hardcoded-address", `Hardcoded address ${match[0]} found in Vault source. Use runtime context addresses instead.`, { file: rel, line: lineForIndex(content, match.index) }));
    }
    if (/refetchInterval\s*:\s*([0-4]?\d{1,3})/.test(content)) {
      issues.push(issue(WARNING, "performance/refetch-too-fast", "refetchInterval below 5000ms needs review.", { file: rel }));
    }
    const standardErc20NameRegex = new RegExp(
      String.raw`(?:\bname\s*:\s*["'](?:${STANDARD_ERC20_METHODS.join("|")})["']|\b(?:${STANDARD_ERC20_METHODS.join("|")})\s*\()`,
    );
    if (item.name === "VaultABI.ts" && standardErc20NameRegex.test(content)) {
      issues.push(
        issue(
          WARNING,
          "contract-abi/standard-erc20-in-vault-abi",
          "Standard ERC20 ABI is already provided by @/src/sdk. Keep VaultABI.ts for Vault methods and custom non-standard token mechanics only.",
          { file: rel },
        ),
      );
    }
    const hasUserWritePath = /\b(?:writeContract|simulateContract)\s*\(|<TxButton\b/.test(content);
    const hasMarketPhaseHandling = /\b(?:marketPhase|isActionAvailableForPhase)\b/.test(content);
    if (item.name === "Component.tsx" && hasUserWritePath && !hasMarketPhaseHandling) {
      issues.push(
        issue(
          WARNING,
          "manual-review/action-stage-gating",
          "Component has a user write path but does not reference marketPhase or isActionAvailableForPhase. Stage-gated actions must state whether they run in internal-market, DEX-listed, both, or read-only mode.",
          { file: rel },
        ),
      );
    }
    if (/Number\s*\([^)]*(amount|balance|allowance|deposit|claim|reward)/i.test(content)) {
      issues.push(issue(WARNING, "contract-abi/number-bigint", "Avoid Number(...) for token amounts used in transaction logic.", { file: rel }));
    }
    issues.push(...collectContractInteractionIssues(content, rel));
    const i18nCallRegex = /(?:^|[^\w.])(?:t|i18n\.t)\(\s*["'`]([^"'`]+)["'`]/g;
    for (const match of content.matchAll(i18nCallRegex)) {
      const key = match[1];
      for (const locale of manifestLocales) {
        if (!i18n[locale]?.[key]) {
          issues.push(issue(BLOCKING, "i18n-policy/used-key-missing-locale", `Code uses i18n key ${key}, but ${locale} is missing it.`, { file: rel, locale, key }));
        }
      }
    }
  }
  return issues;
}

function buildAgentNextActions(issues) {
  const blocking = issues.filter((item) => item.severity === BLOCKING);
  const warnings = issues.filter((item) => item.severity === WARNING);
  const source = blocking.length ? blocking : warnings;
  if (!source.length) return ["Run yarn vault:package <folder-name> and preview the registered route."];
  return source.slice(0, 8).map((item) => ({
    ruleId: item.ruleId,
    severity: item.severity,
    file: item.file,
    field: item.field,
    locale: item.locale,
    key: item.key,
    fixHint: item.fixHint,
  }));
}

function buildCheckReport(folderName, issues) {
  const blocking = issues.filter((item) => item.severity === BLOCKING).length;
  const warning = issues.filter((item) => item.severity === WARNING).length;
  const info = issues.filter((item) => item.severity === INFO).length;
  const firstBlocking = issues.find((item) => item.severity === BLOCKING);
  const failureFields = firstBlocking
    ? {
        code: firstBlocking.ruleId,
        error: firstBlocking.message,
        fixHint: firstBlocking.fixHint,
      }
    : {};
  return {
    ok: blocking === 0,
    ...failureFields,
    folderName,
    summary: { blocking, warning, info },
    agent: {
      verdict: blocking > 0 ? "fix-blocking" : warning > 0 ? "review-warnings" : "package-ready",
      nextActions: buildAgentNextActions(issues),
      allowedVaultFiles: REQUIRED_FILES,
      allowedLocalRelativeImports: [...ALLOWED_RELATIVE_IMPORTS],
      packageCommand: folderName ? `yarn vault:package ${folderName}` : "yarn vault:package <folder-name>",
    },
    issues,
  };
}

function finish(folderName, issues, options) {
  const report = buildCheckReport(folderName, issues);
  if (!options.silent) {
    console.log(JSON.stringify(report, null, 2));
  }
  return report;
}

export function runVaultCheck(folderName, options = {}) {
  const issues = [];
  if (!folderName) {
    issues.push(issue(BLOCKING, "cli/missing-folder-name", "Usage: yarn vault:check <folder-name>"));
    return finish(folderName, issues, options);
  }
  if (!isValidFolderName(folderName)) {
    issues.push(issue(BLOCKING, "cli/invalid-folder-name", `Invalid folder name ${folderName}. Use 3-64 character lowercase kebab-case.`));
    return finish(folderName, issues, options);
  }
  const vaultDir = path.join(ROOT, "src", "vaults", folderName);
  if (!fs.existsSync(vaultDir)) {
    issues.push(issue(BLOCKING, "package-structure/missing-vault-dir", `Vault directory not found: src/vaults/${folderName}`));
    return finish(folderName, issues, options);
  }
  if (!isFolderNameRegistered(folderName)) {
    issues.push(issue(BLOCKING, "preview-registration/missing-vault-module", `Vault folder name ${folderName} is not registered in src/vaults/index.ts.`, { file: "src/vaults/index.ts" }));
  }
  issues.push(...checkStructure(vaultDir));
  const manifestPath = path.join(vaultDir, "manifest.json");
  const i18nPath = path.join(vaultDir, "i18n.json");
  let manifest = {};
  let i18n = {};
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    issues.push(issue(BLOCKING, "manifest-schema/invalid-json", `Cannot parse manifest.json: ${error.message}`));
  }
  try {
    i18n = readJson(i18nPath);
  } catch (error) {
    issues.push(issue(BLOCKING, "i18n-policy/invalid-json", `Cannot parse i18n.json: ${error.message}`));
  }
  const manifestLocales = getManifestLocales(manifest);
  issues.push(...checkManifest(manifest, folderName));
  issues.push(...checkArtifactIdUniqueness(folderName, manifest.artifactId));
  issues.push(...checkI18n(i18n, manifestLocales));
  issues.push(...checkCode(vaultDir, manifest, i18n, manifestLocales));

  return finish(folderName, issues, options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runVaultCheck(process.argv[2]);
  const hasBlocking = result.issues.some((item) => item.severity === BLOCKING);
  process.exit(hasBlocking ? 1 : 0);
}
