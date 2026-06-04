#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { assertNpmPackageFresh } from "./check-template-fresh.mjs";

const ROOT = process.env.VAULT_CHECK_ROOT ? path.resolve(process.env.VAULT_CHECK_ROOT) : process.cwd();
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const FOLDER_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FOLDER_NAME_MIN_LENGTH = 3;
const FOLDER_NAME_MAX_LENGTH = 64;
const ARTIFACT_ID_RE = /^vaultui_([a-z0-9]+(?:-[a-z0-9]+)*)_([0-9A-HJKMNPQRSTVWXYZ]{26})$/;
const FORBIDDEN_NAMES = new Set(["node_modules", ".git", ".vercel", ".env", ".env.local", "package-lock.json", "pnpm-lock.yaml"]);
const REQUIRED_FILES = ["Component.tsx", "manifest.json", "VaultABI.ts", "i18n.json"];
const ALLOWED_VAULT_FILES = new Set(REQUIRED_FILES);
const ALLOWED_RELATIVE_IMPORTS = new Set(["./VaultABI"]);
const ALLOWED_MANIFEST_KEYS = new Set(["artifactId", "name", "match", "i18n", "endpoints", "externalFrames"]);
const ALLOWED_MATCH_KEYS = new Set(["bindings"]);
const ALLOWED_BINDING_ENTRY_KEYS = new Set(["chainId", "factoryAddress", "vaultAddresses", "tokenAddresses", "externalContracts"]);
const FRAME_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRAME_ID_MIN_LENGTH = 3;
const FRAME_ID_MAX_LENGTH = 64;
const MAX_REVIEWED_FRAMES_PER_VAULT = 1;
const FRAME_PROVIDER_POLICIES = {
  tradingview: {
    label: "TradingView",
    origins: new Set(["https://www.tradingview.com", "https://s.tradingview.com"]),
  },
  dexscreener: {
    label: "DexScreener",
    origins: new Set(["https://dexscreener.com"]),
  },
  "coingecko-terminal": {
    label: "CoinGecko Terminal",
    origins: new Set(["https://www.geckoterminal.com"]),
  },
};
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
  /(paymenttoken|quotetoken|dividendtoken|rewardtoken|staketoken|taxtoken|targettoken|targetasset|approvedbuybacktoken|proposedtoken|nftaddress|nft|lptoken|assettoken|underlyingtoken|buybacktoken|feevaultaddress|feevault|wrappednativetoken|wrappednative|nativetoken|basetoken)/i;
const FORBIDDEN_CONTRACT_ADDRESS_KEYWORD_RE = /(router|bridge|oracle|aggregator|pair|amm|treasury|governor)/i;
const CONTRACT_INTERACTION_METHODS = ["readContract", "simulateContract", "writeContract", "watchContractEvent", "createContractEventFilter", "getLogs", "estimateContractGas"];
const CONTRACT_LABEL_REQUIRED_METHODS = new Set(["readContract", "simulateContract", "writeContract"]);
const CONTRACT_INTERACTION_METHOD_RE = new RegExp(`^(?:${CONTRACT_INTERACTION_METHODS.join("|")})\\b`, "u");

const BLOCKING = "blocking";
const WARNING = "warning";
const INFO = "info";
const TYPE_BINDING_KEYS = new Set(["vault" + "Type", "vault" + "Types"]);
const UNSAFE_RESOURCE_SCHEMES = ["ipfs://", "ar://", "data:", "javascript:"];

const FIX_HINTS = {
  "cli/missing-folder-name": "Run yarn vault:check <folder-name> with a registered Vault folder name.",
  "cli/missing-slug": "Run yarn vault:check <slug> with a registered Vault slug.",
  "cli/invalid-folder-name": "Use a 3-64 character lowercase kebab-case folder name, for example my-vault.",
  "package-structure/missing-vault-dir": "Create the package with yarn vault:scaffold <folder-name> --chain 56 --factory 0x... or yarn vault:scaffold <folder-name> --chain 56 --vault 0x..., or add src/vaults/<folder-name>.",
  "package-structure/missing-required-file": "Keep exactly Component.tsx, manifest.json, VaultABI.ts, and i18n.json in the Vault folder.",
  "package-structure/disallowed-vault-file": "Move helpers, assets, nested components, docs, and sample data outside src/vaults/<folder-name> or inline small code in Component.tsx.",
  "preview-registration/missing-vault-module": "Register the folder name in src/vaults/index.ts with loadComponent, loadManifest, and loadI18n entries.",
  "forbidden-files/disallowed-entry": "Remove environment, dependency, git, or build output files from the Vault package.",
  "forbidden-files/symlink": "Replace symlinks with real files inside the Vault package. Symlinks are not allowed.",
  "manifest-schema/invalid-json": "Fix JSON syntax in manifest.json.",
  "manifest-schema/disallowed-field": "Remove internal runtime fields. Developer manifest fields are artifactId, name, match, i18n, optional endpoints, and optional reviewed externalFrames. chain IDs are declared inside match.bindings entries.",
  "manifest-schema/missing-field": "Add the required manifest field.",
  "manifest-schema/invalid-artifact-id": "Use artifactId format vaultui_<folder-name>_<26-char ULID>, for example vaultui_my-vault_01HZY7J4S9D0W5XJ8H2Q3K4M5N.",
  "manifest-schema/artifact-id-folder-name-mismatch": "Make the artifactId folder-name segment match the src/vaults/<folder-name> folder name.",
  "manifest-schema/duplicate-artifact-id": "Generate a new artifactId; each Vault package in the repo must have a unique artifactId.",
  "manifest-schema/invalid-name": "Set manifest.name to a human-readable string with at least two characters.",
  "manifest-schema/invalid-match": "Set manifest.match to an object with bindings (array of factory-scoped, single-Vault, or token-scoped binding entries).",
  "manifest-schema/disallowed-match-field": "Keep match limited to bindings. If a reference token CA list is needed, declare it only as match.bindings[].tokenAddresses.",
  "manifest-binding/missing-bindings": "Add match.bindings as a non-empty array. Each entry needs chainId plus a non-zero factoryAddress, exactly one vaultAddresses entry, or one or more tokenAddresses.",
  "manifest-binding/missing-binding-target": "Add a non-zero factoryAddress, exactly one vaultAddresses entry, or one or more tokenAddresses to this binding.",
  "manifest-binding/duplicate-binding": "Remove duplicate match.bindings entries with the same runtime target. Merge any binding-scoped reference lists into one entry.",
  "manifest-binding/invalid-binding-entry": "Each match.bindings entry must be an object with chainId plus factoryAddress, vaultAddresses, or tokenAddresses.",
  "manifest-binding/disallowed-binding-field": "Binding entries may only contain chainId, factoryAddress, optional vaultAddresses, optional tokenAddresses, and optional externalContracts.",
  "manifest-binding/invalid-chain-id": "chainId must be a positive integer, for example 56 for BNB Chain or 97 for BNB Testnet.",
  "manifest-binding/invalid-address": "Use a full 20-byte EVM address matching 0x plus 40 hex characters.",
  "manifest-binding/zero-factory-address": "Omit factoryAddress for no-factory mode, or use the real deployed non-zero factory contract address for factory mode.",
  "manifest-binding/mixed-binding-target": "Use factoryAddress for a factory-scoped UI, or omit factoryAddress for Vault/token-scoped no-factory UI.",
  "manifest-binding/duplicate-address": "Remove duplicate addresses from the binding-scoped reference list.",
  "manifest-binding/ca-policy-not-in-manifest": "Remove global CA policy fields. Use match.bindings[].tokenAddresses only when a reference token CA list is needed.",
  "manifest-binding/invalid-vault-address-list": "Use a non-empty array of valid non-zero EVM addresses. No-factory Vault bindings may contain exactly one Vault address.",
  "manifest-binding/invalid-token-address-list": "Use a non-empty array of valid non-zero EVM addresses, or omit it when no token CA list is needed.",
  "manifest-binding/invalid-external-contract-list": "Use a non-empty externalContracts array only when this binding needs fixed non-token/non-Vault/non-factory contract targets.",
  "manifest-binding/invalid-external-contract-entry": "Each externalContracts entry must be an object with address and label only.",
  "manifest-binding/no-type-based-binding": "Remove vaultType/vaultTypes from manifest matching. Binding intent must use chain and factory targets.",
  "i18n-policy/manifest-locales": "Declare at least one locale in manifest.i18n, using locale strings with at least two characters.",
  "i18n-policy/duplicate-manifest-locale": "Remove duplicate locale entries from manifest.i18n.",
  "i18n-policy/invalid-json": "Fix JSON syntax in i18n.json.",
  "i18n-policy/missing-locale": "Add the locale object to i18n.json or remove that locale from manifest.i18n.",
  "i18n-policy/missing-locale-key": "Add the missing key to each locale declared by manifest.i18n.",
  "i18n-policy/used-key-missing-locale": "Every key used by t(...) or i18n.t(...) must exist in each declared locale.",
  "endpoint-policy/invalid-endpoints": "Set manifest.endpoints to a single HTTPS URL string, a non-empty array of HTTPS URL strings, or remove it when no endpoint is needed.",
  "endpoint-policy/invalid-endpoint-declaration": "Endpoint declarations must be valid absolute HTTPS URL strings only.",
  "endpoint-policy/https-required": "Use an HTTPS endpoint URL string, or remove the endpoint.",
  "endpoint-policy/no-credentials": "Remove username/password credentials from endpoint URLs. Workbench endpoint declarations must be bearerless HTTPS URLs.",
  "endpoint-policy/undeclared-url": "Remove the URL or declare a non-oracle https endpoint in manifest.endpoints for review.",
  "endpoint-policy/relative-endpoint": "Do not call host-relative endpoints from Vault source. Use SDK/on-chain reads or declare an approved https endpoint.",
  "endpoint-policy/direct-fetch": "Use sdk.readOracle for provisioned data, or call only static absolute HTTPS endpoints without credentials and declared in manifest.endpoints.",
  "manual-review/external-endpoint": "Prefer removing the endpoint. If it is unavoidable, keep the declaration for Flap review.",
  "frame-policy/invalid-frames": "Set manifest.externalFrames to a non-empty array of reviewed frame declarations, or remove it.",
  "frame-policy/invalid-frame-declaration": "Each externalFrames entry must include id, provider, src, and title only.",
  "frame-policy/duplicate-frame-id": "Use a unique lowercase kebab-case id for each external frame declaration.",
  "frame-policy/unsupported-provider": "Use provider tradingview, dexscreener, or coingecko-terminal.",
  "frame-policy/unsupported-origin": "Use only the exact reviewed provider origins: TradingView, DexScreener, or GeckoTerminal.",
  "frame-policy/https-required": "Use a static absolute HTTPS frame URL without credentials.",
  "frame-policy/fixed-query-required": "Declare the complete frame URL with a fixed non-empty query string. Do not derive query params at runtime.",
  "frame-policy/invalid-reviewed-frame-usage": "Use ReviewedFrame with static string literal frameId, provider, src, and title props.",
  "frame-policy/dynamic-frame-src": "Use a static string literal src prop on ReviewedFrame. Do not compose frame URLs dynamically.",
  "frame-policy/undeclared-frame-src": "Declare the exact static ReviewedFrame src in manifest.externalFrames with the same provider and frameId.",
  "frame-policy/too-many-reviewed-frames": "Use at most one ReviewedFrame and one manifest.externalFrames entry per Vault UI.",
  "manual-review/external-frame": "External frames are review candidates only. Keep the frame display-only and wait for Flap review approval before publish.",
  "manual-review/oracle-usage": "Do not add oracle config to manifest. Flap Artifact Workbench/runtime must provision the oracle id.",
  "manual-review/action-stage-gating": "Add context.host?.marketPhase and isActionAvailableForPhase(...) for internal-market vs DEX-listed button gating. Preview both marketPhase=internal-market and marketPhase=dex-listed.",
  "risk-status/missing-host-risk-state": "Read the current contract risk level from context.host via readTaxVaultHostContext(context.host), render it prominently, and show a clear danger/warning notice when the host risk level is unavailable.",
  "forbidden-api/direct-window-ethereum": "Use sdk.wallet and SDK contract methods instead of direct wallet APIs.",
  "forbidden-api/eval": "Remove eval and implement the logic as normal TypeScript.",
  "forbidden-api/function-constructor": "Remove Function constructor usage and implement the logic as normal TypeScript.",
  "forbidden-api/iframe": "Do not embed raw iframe UI inside a Vault component. Use ReviewedFrame only for manifest.externalFrames review candidates.",
  "forbidden-api/script": "Do not inject scripts inside a Vault component.",
  "forbidden-api/dangerously-set-inner-html": "Render structured React content instead of raw HTML.",
  "forbidden-api/remote-import": "Remove runtime remote imports. Use only approved local package imports.",
  "forbidden-api/browser-global-escape": "Use explicit Flap SDK/runtime APIs instead of computed browser-global access.",
  "forbidden-api/browser-network": "Use Flap SDK/readOracle, or a static absolute HTTPS fetch target declared in manifest.endpoints.",
  "forbidden-api/browser-storage": "Use local React state or Flap-provided runtime state instead of browser storage APIs.",
  "forbidden-api/browser-navigation": "Do not navigate, open windows, or mutate browser history from a Vault component. The host owns routing.",
  "forbidden-api/browser-worker": "Do not spawn workers or service workers from a Vault component.",
  "forbidden-api/cross-context-messaging": "Do not use cross-context messaging from a Vault component.",
  "forbidden-api/browser-permission": "Do not request browser permissions from a Vault component. The host/runtime owns permissioned browser capabilities.",
  "imports-and-dependencies/disallowed-relative-import": "Inline small helpers in Component.tsx or use @/src/sdk and @/src/ui. The only local relative import is ./VaultABI.",
  "imports-and-dependencies/forbidden-import": "Use Flap SDK/UI primitives instead of host wallet, app, or heavy UI dependencies.",
  "imports-and-dependencies/external-sdk-package": "Do not introduce additional SDK packages. Use only the shared @/src/sdk and @/src/ui runtime surfaces.",
  "imports-and-dependencies/require-call": "Use static ESM imports only. CommonJS require() is not allowed in Vault source.",
  "imports-and-dependencies/unreviewed-import": "Remove the dependency unless Flap explicitly approves it.",
  "imports-and-dependencies/dynamic-import": "Use static imports only.",
  "media/local-asset": "Move local media outside the Vault package. Vault folders must contain only the four allowed files.",
  "media-policy/remote-media": "Remove remote media. Media is controlled by Flap Artifact Workbench/runtime policy.",
  "security/hardcoded-address": "Use context.vaultAddress, context.tokenAddress, context.factoryAddress, or declare intentional fixed external contract targets under match.bindings[].externalContracts.",
  "navigation-policy/unapproved-external-navigation": "Do not navigate users to arbitrary external sites. Keep component-owned links on the current chain explorer only, and use host-reviewed allowlists for any exceptional metadata/oracle origin during review.",
  "contract-boundary/missing-contract-label": "Add a human-readable contract label such as vault, token, or nft so review and static checks can classify the call target.",
  "contract-boundary/disallowed-contract-label": "Limit contract labels to vault/token/nft-related targets. Do not interact with routers, bridges, aggregators, or unrelated app contracts from a Vault package.",
  "contract-boundary/disallowed-contract-address-source": "Keep contract targets on context.vaultAddress, context.tokenAddress, context.factoryAddress, token/NFT-related runtime addresses, or declared externalContracts only.",
  "contract-boundary/undeclared-contract-address": "Use runtime context addresses for Vault/token/factory targets. If this is an intentional fixed external contract, declare it under match.bindings[].externalContracts.",
  "performance/refetch-too-fast": "Use a refetch interval of at least 5000ms unless Flap approves a faster polling path.",
  "contract-abi/number-bigint": "Keep token amounts as bigint/Decimal and avoid Number(...) for transaction math.",
  "contract-abi/human-readable-requires-parse-abi": "Wrap human-readable ABI string arrays with parseAbi([...]) from viem, or use full object ABI fragments. Do not export raw function/event signature strings as the runtime ABI.",
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
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) {
      files.push({ path: full, name, isDirectory: false, isSymlink: true });
      continue;
    }
    if (stat.isDirectory()) {
      files.push({ path: full, name, isDirectory: true, isSymlink: false });
      walk(full, files);
    } else {
      files.push({ path: full, name, isDirectory: false, isSymlink: false });
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

function normalizeManifestExternalFrames(externalFrames) {
  if (externalFrames === undefined) return [];
  if (Array.isArray(externalFrames)) return externalFrames;
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

function collectDeclaredFrames(manifest) {
  const frames = new Map();
  const normalized = normalizeManifestExternalFrames(manifest.externalFrames);
  if (!normalized) return frames;
  for (const frame of normalized) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) continue;
    if (!isNonEmptyString(frame.id) || !isNonEmptyString(frame.provider) || !isNonEmptyString(frame.src)) continue;
    const src = normalizeFrameSrc(frame.src);
    if (!src) continue;
    frames.set(frame.id, {
      id: frame.id,
      provider: frame.provider,
      src,
    });
  }
  return frames;
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function hrefWithoutHash(url) {
  const next = new URL(url.href);
  next.hash = "";
  return next.href;
}

function isSamePathOrChild(candidatePath, declaredPath) {
  if (candidatePath === declaredPath) return true;
  const basePath = declaredPath.endsWith("/") ? declaredPath : `${declaredPath}/`;
  return candidatePath.startsWith(basePath);
}

function isDeclaredUrl(url, declaredUrls) {
  const candidate = parseUrl(url);
  if (!candidate) return false;
  if (candidate.username || candidate.password) return false;

  for (const declared of declaredUrls) {
    const allowed = parseUrl(declared);
    if (!allowed) continue;
    if (allowed.username || allowed.password) continue;
    if (candidate.origin !== allowed.origin) continue;
    if (allowed.search) {
      if (hrefWithoutHash(candidate) === hrefWithoutHash(allowed)) return true;
      continue;
    }
    if (isSamePathOrChild(candidate.pathname, allowed.pathname)) return true;
  }
  return false;
}

function normalizeFrameSrc(value) {
  if (typeof value !== "string") return null;
  const parsed = parseUrl(value);
  if (!parsed) return null;
  return parsed.href;
}

function isDeclaredExternalFrameUrl(url, declaredFrames) {
  const src = normalizeFrameSrc(url);
  if (!src) return false;
  for (const frame of declaredFrames.values()) {
    if (frame.src === src) return true;
  }
  return false;
}

function staticStringLiteral(rawExpression) {
  const trimmed = rawExpression.trim();
  const quote = trimmed[0];
  if (quote !== "\"" && quote !== "'" && quote !== "`") return null;

  let escaped = false;
  let value = "";
  for (let index = 1; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) {
      if (quote === "`" && value.includes("${")) return null;
      return value;
    }
    value += char;
  }

  return null;
}

function hasUnparsedHumanReadableAbi(content) {
  if (/\bparseAbi\s*\(/.test(content)) return false;
  return /["'`]\s*(?:function|event|error)\s+[A-Za-z_$][\w$]*\s*\(|["'`]\s*(?:constructor|fallback|receive)\s*\(/.test(content);
}

function hasRiskStatusIntegration(content) {
  const usesHostAccessor = /\breadTaxVaultHostContext\s*\(\s*(?:context|sdk\.context)\.host\s*\)/.test(content);
  const derivesHostRiskLevel =
    /\briskLevel\b\s*=\s*[\s\S]{0,260}(?:vaultInfo\?\.\s*riskLevel|taxInfo\?\.\s*vaultInfo\?\.\s*riskLevel)/.test(content);
  const displaysRiskStatus =
    /<(?:StatusBadge|DetailTile|Metric|DataRow)\b[\s\S]{0,320}\b(?:riskLabel|riskLevel|riskTone)\b/.test(content);
  const displaysMissingRiskWarning =
    /\briskLevel\b\s*(?:===|==)\s*(?:null|undefined)[\s\S]{0,400}<Alert\b/.test(content) ||
    /\briskLevel\b\s*(?:!==|!=)\s*(?:null|undefined)[\s\S]{0,400}[:{(]\s*<Alert\b/.test(content) ||
    /[{(]\s*!\s*riskLevel\b[\s\S]{0,400}<Alert\b/.test(content) ||
    /<Alert\b[\s\S]{0,400}\briskLevel\b[\s\S]{0,100}(?:null|undefined)/.test(content);

  return usesHostAccessor && derivesHostRiskLevel && displaysRiskStatus && displaysMissingRiskWarning;
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

function isAllowlistedExternalUrl(url, declaredUrls, declaredFrames = new Map()) {
  return isDeclaredUrl(url, declaredUrls) || isDeclaredExternalFrameUrl(url, declaredFrames) || matchesAllowlistPrefix(url, DEFAULT_ALLOWED_URL_PREFIXES);
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
  return manifest.i18n.filter((locale) => typeof locale === "string" && locale.trim().length >= 2).map((locale) => locale.trim());
}

function isFolderNameRegistered(folderName) {
  const indexPath = path.join(ROOT, "src", "vaults", "index.ts");
  if (!fs.existsSync(indexPath)) return false;
  const content = fs.readFileSync(indexPath, "utf8");
  return content.includes(`./${folderName}/Component`) && content.includes(`./${folderName}/manifest.json`) && content.includes(`./${folderName}/i18n.json`);
}

function normalizeContractAddressExpression(expressionText) {
  return expressionText.replace(/\s+/g, "").toLowerCase();
}

function skipQuoted(content, index) {
  const quote = content[index];
  let escaped = false;
  for (let cursor = index + 1; cursor < content.length; cursor += 1) {
    const char = content[cursor];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) return cursor + 1;
  }
  return content.length;
}

function skipLineComment(content, index) {
  const end = content.indexOf("\n", index + 2);
  return end < 0 ? content.length : end + 1;
}

function skipBlockComment(content, index) {
  const end = content.indexOf("*/", index + 2);
  return end < 0 ? content.length : end + 2;
}

function blankPreservingNewlines(value) {
  return value.replace(/[^\n]/g, " ");
}

function stripCommentsForScanning(content) {
  let output = "";
  for (let cursor = 0; cursor < content.length; cursor += 1) {
    const char = content[cursor];
    const next = content[cursor + 1];
    if (char === "\"" || char === "'" || char === "`") {
      const end = skipQuoted(content, cursor);
      output += content.slice(cursor, end);
      cursor = end - 1;
      continue;
    }
    if (char === "/" && next === "/") {
      const end = skipLineComment(content, cursor);
      output += blankPreservingNewlines(content.slice(cursor, end));
      cursor = end - 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = skipBlockComment(content, cursor);
      output += blankPreservingNewlines(content.slice(cursor, end));
      cursor = end - 1;
      continue;
    }
    output += char;
  }
  return output;
}

function isIdentifierStart(char) {
  return /[$A-Z_a-z]/.test(char || "");
}

function isIdentifierPart(char) {
  return /[$\w]/.test(char || "");
}

function skipWhitespace(content, index) {
  let cursor = index;
  while (cursor < content.length) {
    const char = content[cursor];
    if (/\s/.test(char)) {
      cursor += 1;
      continue;
    }
    if (char === "/" && content[cursor + 1] === "/") {
      cursor = skipLineComment(content, cursor);
      continue;
    }
    if (char === "/" && content[cursor + 1] === "*") {
      cursor = skipBlockComment(content, cursor);
      continue;
    }
    break;
  }
  return cursor;
}

function findMatchingDelimiter(content, openIndex, openChar, closeChar) {
  let depth = 0;
  for (let cursor = openIndex; cursor < content.length; cursor += 1) {
    const char = content[cursor];
    const next = content[cursor + 1];
    if (char === "\"" || char === "'" || char === "`") {
      cursor = skipQuoted(content, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "/") {
      cursor = skipLineComment(content, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "*") {
      cursor = skipBlockComment(content, cursor) - 1;
      continue;
    }
    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function findExpressionEnd(content, startIndex) {
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  for (let cursor = startIndex; cursor < content.length; cursor += 1) {
    const char = content[cursor];
    const next = content[cursor + 1];
    if (char === "\"" || char === "'" || char === "`") {
      cursor = skipQuoted(content, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "/") {
      cursor = skipLineComment(content, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "*") {
      cursor = skipBlockComment(content, cursor) - 1;
      continue;
    }
    if (char === "(") parenDepth += 1;
    if (char === ")") {
      if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) return cursor;
      parenDepth = Math.max(0, parenDepth - 1);
    }
    if (char === "{") braceDepth += 1;
    if (char === "}") {
      if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) return cursor;
      braceDepth = Math.max(0, braceDepth - 1);
    }
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    if ((char === "," || char === ";") && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) return cursor;
  }
  return content.length;
}

function parseStaticStringLiteral(expressionText) {
  const trimmed = expressionText.trim();
  const quote = trimmed[0];
  if (quote !== "\"" && quote !== "'" && quote !== "`") return null;

  let escaped = false;
  let value = "";
  for (let cursor = 1; cursor < trimmed.length; cursor += 1) {
    const char = trimmed[cursor];
    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) {
      if (quote === "`" && value.includes("${")) return null;
      return value;
    }
    value += char;
  }
  return null;
}

function hasBalancedOuterParens(value) {
  if (!value.startsWith("(") || !value.endsWith(")")) return false;
  return findMatchingDelimiter(value, 0, "(", ")") === value.length - 1;
}

function stripExpressionDecorators(expressionText) {
  let current = expressionText.trim();
  let changed = true;
  while (changed) {
    changed = false;
    if (hasBalancedOuterParens(current)) {
      current = current.slice(1, -1).trim();
      changed = true;
    }
    const withoutNonNull = current.replace(/!\s*$/, "").trim();
    if (withoutNonNull !== current) {
      current = withoutNonNull;
      changed = true;
    }
    const withoutAsConst = current.replace(/\s+as\s+const\s*$/u, "").trim();
    if (withoutAsConst !== current) {
      current = withoutAsConst;
      changed = true;
    }
    const withoutAssertion = current.replace(/\s+(?:as|satisfies)\s+[^,;)}\]]+$/u, "").trim();
    if (withoutAssertion !== current) {
      current = withoutAssertion;
      changed = true;
    }
  }
  return current;
}

function collectAddressConstants(content) {
  const constants = new Map();

  for (let cursor = 0; cursor < content.length; cursor += 1) {
    const char = content[cursor];
    const next = content[cursor + 1];
    if (char === "\"" || char === "'" || char === "`") {
      cursor = skipQuoted(content, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "/") {
      cursor = skipLineComment(content, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "*") {
      cursor = skipBlockComment(content, cursor) - 1;
      continue;
    }
    const declaration = /^(?:const|let|var)\b/u.exec(content.slice(cursor));
    if (!declaration) continue;
    cursor += declaration[0].length;
    cursor = skipWhitespace(content, cursor);
    if (!isIdentifierStart(content[cursor])) continue;
    let nameEnd = cursor + 1;
    while (isIdentifierPart(content[nameEnd])) nameEnd += 1;
    const name = content.slice(cursor, nameEnd);
    cursor = skipWhitespace(content, nameEnd);
    if (content[cursor] === ":") {
      cursor = findExpressionEnd(content, cursor + 1);
      cursor = skipWhitespace(content, cursor);
    }
    if (content[cursor] !== "=") continue;
    const valueStart = skipWhitespace(content, cursor + 1);
    const valueEnd = findExpressionEnd(content, valueStart);
    const literal = parseStaticStringLiteral(stripExpressionDecorators(content.slice(valueStart, valueEnd)));
    const normalized = normalizeAddress(literal);
    if (normalized) constants.set(name, normalized);
    cursor = valueEnd;
  }

  return constants;
}

function resolveAddressExpressionText(expressionText, addressConstants) {
  const expression = stripExpressionDecorators(expressionText);
  const literal = parseStaticStringLiteral(expression);
  if (literal !== null) return normalizeAddress(literal);
  if (/^[$A-Z_a-z][$\w]*$/u.test(expression)) {
    return addressConstants.get(expression) ?? null;
  }
  return null;
}

function readObjectKey(content, index) {
  let cursor = skipWhitespace(content, index);
  const quote = content[cursor];
  if (quote === "\"" || quote === "'" || quote === "`") {
    const end = skipQuoted(content, cursor);
    const key = parseStaticStringLiteral(content.slice(cursor, end));
    return { key, end };
  }
  if (!isIdentifierStart(content[cursor])) return null;
  const start = cursor;
  cursor += 1;
  while (isIdentifierPart(content[cursor])) cursor += 1;
  return { key: content.slice(start, cursor), end: cursor };
}

function extractObjectPropertyExpression(objectText, propertyName) {
  let cursor = objectText[0] === "{" ? 1 : 0;
  const objectEnd = objectText[0] === "{" ? objectText.length - 1 : objectText.length;

  while (cursor < objectEnd) {
    cursor = skipWhitespace(objectText, cursor);
    if (objectText[cursor] === ",") {
      cursor += 1;
      continue;
    }
    const parsedKey = readObjectKey(objectText, cursor);
    if (!parsedKey) {
      cursor += 1;
      continue;
    }
    cursor = skipWhitespace(objectText, parsedKey.end);
    if (objectText[cursor] !== ":") {
      cursor += 1;
      continue;
    }
    const valueStart = skipWhitespace(objectText, cursor + 1);
    const valueEnd = findExpressionEnd(objectText, valueStart);
    if (parsedKey.key === propertyName) {
      return {
        text: objectText.slice(valueStart, valueEnd).trim(),
        index: valueStart,
      };
    }
    cursor = valueEnd;
  }

  return null;
}

function skipTypeArguments(content, index) {
  let cursor = skipWhitespace(content, index);
  if (content[cursor] !== "<") return cursor;
  let depth = 0;
  for (; cursor < content.length; cursor += 1) {
    const char = content[cursor];
    const next = content[cursor + 1];
    if (char === "\"" || char === "'" || char === "`") {
      cursor = skipQuoted(content, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "/") {
      cursor = skipLineComment(content, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "*") {
      cursor = skipBlockComment(content, cursor) - 1;
      continue;
    }
    if (char === "<") depth += 1;
    if (char === ">") {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
  }
  return index;
}

function findSdkContractCalls(content) {
  const calls = [];

  for (let cursor = 0; cursor < content.length; cursor += 1) {
    const char = content[cursor];
    const next = content[cursor + 1];
    if (char === "\"" || char === "'" || char === "`") {
      cursor = skipQuoted(content, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "/") {
      cursor = skipLineComment(content, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "*") {
      cursor = skipBlockComment(content, cursor) - 1;
      continue;
    }

    const methodMatch = CONTRACT_INTERACTION_METHOD_RE.exec(content.slice(cursor));
    if (!methodMatch) continue;
    const before = content[cursor - 1];
    if (isIdentifierPart(before)) continue;

    const methodName = methodMatch[0];
    let callCursor = skipTypeArguments(content, cursor + methodName.length);
    callCursor = skipWhitespace(content, callCursor);
    if (content[callCursor] !== "(") continue;
    const argumentStart = skipWhitespace(content, callCursor + 1);
    if (content[argumentStart] !== "{") continue;
    const objectEnd = findMatchingDelimiter(content, argumentStart, "{", "}");
    if (objectEnd < 0) continue;
    calls.push({
      methodName,
      objectStart: argumentStart,
      objectText: content.slice(argumentStart, objectEnd + 1),
    });
    cursor = objectEnd;
  }

  return calls;
}

function collectDynamicImportIssues(content, file) {
  const issues = [];
  for (let cursor = 0; cursor < content.length; cursor += 1) {
    const char = content[cursor];
    const next = content[cursor + 1];
    if (char === "\"" || char === "'" || char === "`") {
      cursor = skipQuoted(content, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "/") {
      cursor = skipLineComment(content, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "*") {
      cursor = skipBlockComment(content, cursor) - 1;
      continue;
    }
    if (content.startsWith("import", cursor)) {
      const before = content[cursor - 1];
      const after = content[cursor + "import".length];
      if (isIdentifierPart(before) || isIdentifierPart(after)) continue;
      const openParenIndex = skipWhitespace(content, cursor + "import".length);
      if (content[openParenIndex] === "(") {
        const targetStart = skipWhitespace(content, openParenIndex + 1);
        const targetEnd = findExpressionEnd(content, targetStart);
        const specifier = content.slice(targetStart, targetEnd).trim() || "<dynamic>";
        issues.push(
          issue(BLOCKING, "imports-and-dependencies/dynamic-import", `Dynamic import ${specifier} is not allowed inside a Vault package.`, {
            file,
            line: lineForIndex(content, cursor),
          }),
        );
      }
    }
  }

  return issues;
}

function extractStaticJsxStringProp(tagText, propName) {
  const staticPropRegex = new RegExp(
    String.raw`\b${propName}\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\})`,
    "u",
  );
  const match = staticPropRegex.exec(tagText);
  if (match) {
    return {
      value: match.slice(1).find((item) => item !== undefined) ?? "",
      dynamic: false,
      present: true,
    };
  }
  const propRegex = new RegExp(String.raw`\b${propName}\s*=`, "u");
  return propRegex.test(tagText) ? { value: null, dynamic: true, present: true } : { value: null, dynamic: false, present: false };
}

function collectReviewedFrameIssues(content, file, declaredFrames) {
  const issues = [];
  const tagRegex = /<ReviewedFrame\b[\s\S]*?(?:\/>|>)/g;
  const matches = [...content.matchAll(tagRegex)];
  if (matches.length > MAX_REVIEWED_FRAMES_PER_VAULT) {
    issues.push(
      issue(
        BLOCKING,
        "frame-policy/too-many-reviewed-frames",
        "A Vault UI may render at most one ReviewedFrame.",
        { file, line: lineForIndex(content, matches[MAX_REVIEWED_FRAMES_PER_VAULT].index ?? -1) },
      ),
    );
  }
  for (const match of matches) {
    const tagText = match[0];
    const line = lineForIndex(content, match.index ?? -1);
    const frameId = extractStaticJsxStringProp(tagText, "frameId");
    const provider = extractStaticJsxStringProp(tagText, "provider");
    const src = extractStaticJsxStringProp(tagText, "src");
    const title = extractStaticJsxStringProp(tagText, "title");

    if (/\bsrcDoc\s*=/.test(tagText)) {
      issues.push(
        issue(
          BLOCKING,
          "frame-policy/invalid-reviewed-frame-usage",
          "ReviewedFrame must use a reviewed provider src URL and must not use srcDoc.",
          { file, line },
        ),
      );
      continue;
    }
    if (!frameId.present || frameId.dynamic || !provider.present || provider.dynamic || !title.present || title.dynamic) {
      issues.push(
        issue(
          BLOCKING,
          "frame-policy/invalid-reviewed-frame-usage",
          "ReviewedFrame must include static string literal frameId, provider, and title props.",
          { file, line },
        ),
      );
      continue;
    }
    if (!src.present || src.dynamic) {
      issues.push(
        issue(
          BLOCKING,
          "frame-policy/dynamic-frame-src",
          "ReviewedFrame src must be a complete static string literal. Do not compose provider, path, or query params at runtime.",
          { file, line },
        ),
      );
      continue;
    }

    const normalizedSrc = normalizeFrameSrc(src.value);
    const declaredFrame = declaredFrames.get(frameId.value);
    if (!normalizedSrc || !declaredFrame || declaredFrame.provider !== provider.value || declaredFrame.src !== normalizedSrc) {
      issues.push(
        issue(
          BLOCKING,
          "frame-policy/undeclared-frame-src",
          `ReviewedFrame ${frameId.value || "<missing>"} src must exactly match manifest.externalFrames with the same frameId and provider.`,
          { file, line },
        ),
      );
    }
  }
  return issues;
}

function isApprovedContractAddressExpression(expressionText) {
  const normalized = normalizeContractAddressExpression(expressionText);
  if (!normalized) return false;
  if (FORBIDDEN_CONTRACT_ADDRESS_KEYWORD_RE.test(normalized)) return false;
  if (normalized.includes("context.vaultaddress") || normalized.includes("context.tokenaddress") || normalized.includes("context.factoryaddress")) return true;
  if (normalized.includes("sdk.context.vaultaddress") || normalized.includes("sdk.context.tokenaddress") || normalized.includes("sdk.context.factoryaddress")) return true;
  return APPROVED_CONTRACT_ADDRESS_KEYWORD_RE.test(normalized);
}

function collectContractInteractionIssues(content, file, contractPolicy) {
  const issues = [];
  const addressConstants = collectAddressConstants(content);

  for (const call of findSdkContractCalls(content)) {
    const contractProperty = extractObjectPropertyExpression(call.objectText, "contract");
    const addressProperty = extractObjectPropertyExpression(call.objectText, "address");
    const resolvedAddress = addressProperty ? resolveAddressExpressionText(addressProperty.text, addressConstants) : null;
    const isDeclaredExternalAddress = Boolean(resolvedAddress && contractPolicy.external.has(resolvedAddress));

    if (contractProperty) {
      const contractLabel = parseStaticStringLiteral(stripExpressionDecorators(contractProperty.text));
      if (contractLabel === null) {
        issues.push(
          issue(BLOCKING, "contract-boundary/disallowed-contract-label", `${call.methodName} contract label must be a simple string literal classified as vault/token/nft.`, {
            file,
            line: lineForIndex(content, call.objectStart + contractProperty.index),
          }),
        );
      } else if (!isDeclaredExternalAddress && !APPROVED_CONTRACT_LABEL_RE.test(contractLabel)) {
        issues.push(
          issue(BLOCKING, "contract-boundary/disallowed-contract-label", `${call.methodName} target "${contractLabel}" is outside the allowed vault/token/nft boundary.`, {
            file,
            line: lineForIndex(content, call.objectStart + contractProperty.index),
          }),
        );
      }
    } else if (CONTRACT_LABEL_REQUIRED_METHODS.has(call.methodName)) {
      issues.push(
        issue(BLOCKING, "contract-boundary/missing-contract-label", `${call.methodName} call is missing a contract label.`, {
          file,
          line: lineForIndex(content, call.objectStart),
        }),
      );
    }

    if (!addressProperty) continue;
    if (resolvedAddress) {
      if (!contractPolicy.all.has(resolvedAddress)) {
        issues.push(
          issue(
            BLOCKING,
            "contract-boundary/undeclared-contract-address",
            `${call.methodName} uses fixed contract address ${resolvedAddress}, but it is not a runtime Vault/token/factory address and is not declared in manifest match.bindings[].externalContracts.`,
            {
              file,
              line: lineForIndex(content, call.objectStart + addressProperty.index),
            },
          ),
        );
      }
    } else if (!isApprovedContractAddressExpression(addressProperty.text)) {
      issues.push(
        issue(
          BLOCKING,
          "contract-boundary/undeclared-contract-address",
          `${call.methodName} address source ${addressProperty.text} is outside the allowed Vault/token/factory runtime boundary. Fixed external contract targets must be declared in manifest match.bindings[].externalContracts.`,
          {
            file,
            line: lineForIndex(content, call.objectStart + addressProperty.index),
          },
        ),
      );
    }
  }

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
    if (item.isSymlink) {
      issues.push(issue(BLOCKING, "forbidden-files/symlink", `Symlink ${item.name} is not allowed inside a Vault package.`, { file: rel }));
      continue;
    }
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

function checkAddressListDuplicates(addresses, field) {
  const issues = [];
  const seen = new Map();
  for (const [index, addr] of addresses.entries()) {
    if (!ADDRESS_RE.test(addr)) continue;
    const normalized = addr.toLowerCase();
    const firstIndex = seen.get(normalized);
    if (firstIndex !== undefined) {
      issues.push(issue(BLOCKING, "manifest-binding/duplicate-address", `${field}[${index}] duplicates ${field}[${firstIndex}].`, { field: `${field}[${index}]` }));
    } else {
      seen.set(normalized, index);
    }
  }
  return issues;
}

function normalizeAddress(value) {
  if (typeof value !== "string" || !ADDRESS_RE.test(value)) return null;
  return value.toLowerCase();
}

function isZeroAddress(value) {
  return normalizeAddress(value) === ZERO_ADDRESS;
}

function isNonZeroAddress(value) {
  return ADDRESS_RE.test(value || "") && !isZeroAddress(value);
}

function bindingIdentityKeys(bindingEntry) {
  if (!Number.isInteger(bindingEntry?.chainId) || bindingEntry.chainId <= 0) return null;
  if (isNonZeroAddress(bindingEntry.factoryAddress)) {
    return [`factory:${bindingEntry.chainId}:${bindingEntry.factoryAddress.toLowerCase()}`];
  }
  if (!bindingEntry.factoryAddress && Array.isArray(bindingEntry.vaultAddresses) && bindingEntry.vaultAddresses.length === 1 && isNonZeroAddress(bindingEntry.vaultAddresses[0])) {
    const vaultKey = `vault:${bindingEntry.chainId}:${bindingEntry.vaultAddresses[0].toLowerCase()}`;
    if (Array.isArray(bindingEntry.tokenAddresses) && bindingEntry.tokenAddresses.length > 0) {
      return bindingEntry.tokenAddresses
        .filter((address) => isNonZeroAddress(address))
        .map((address) => `${vaultKey}:${address.toLowerCase()}`);
    }
    return [vaultKey];
  }
  if (!bindingEntry.factoryAddress && Array.isArray(bindingEntry.tokenAddresses) && bindingEntry.tokenAddresses.length > 0) {
    return bindingEntry.tokenAddresses
      .filter((address) => isNonZeroAddress(address))
      .map((address) => `token:${bindingEntry.chainId}:${address.toLowerCase()}`);
  }
  return [];
}

function collectManifestContractPolicy(manifest) {
  const builtIn = new Set();
  const external = new Set();
  const all = new Set();
  for (const bindingEntry of manifest?.match?.bindings || []) {
    const factoryAddress = normalizeAddress(bindingEntry?.factoryAddress);
    if (factoryAddress) builtIn.add(factoryAddress);
    for (const address of bindingEntry?.vaultAddresses || []) {
      const normalized = normalizeAddress(address);
      if (normalized) builtIn.add(normalized);
    }
    for (const address of bindingEntry?.tokenAddresses || []) {
      const normalized = normalizeAddress(address);
      if (normalized) builtIn.add(normalized);
    }
    for (const contractEntry of bindingEntry?.externalContracts || []) {
      const normalized = normalizeAddress(contractEntry?.address);
      if (normalized) external.add(normalized);
    }
  }
  for (const address of builtIn) all.add(address);
  for (const address of external) all.add(address);
  return { builtIn, external, all };
}

function checkExternalContracts(value, field, builtInAddresses = new Set()) {
  const issues = [];
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(issue(BLOCKING, "manifest-binding/invalid-external-contract-list", `${field} must be a non-empty array when provided.`, { field }));
    return issues;
  }

  const seen = new Map();
  for (const [index, contractEntry] of value.entries()) {
    const entryField = `${field}[${index}]`;
    if (!contractEntry || typeof contractEntry !== "object" || Array.isArray(contractEntry)) {
      issues.push(issue(BLOCKING, "manifest-binding/invalid-external-contract-entry", `${entryField} must be an object with address and label.`, { field: entryField }));
      continue;
    }
    for (const key of Object.keys(contractEntry)) {
      if (key !== "address" && key !== "label") {
        issues.push(issue(BLOCKING, "manifest-binding/invalid-external-contract-entry", `${entryField}.${key} is not allowed.`, { field: `${entryField}.${key}` }));
      }
    }
    if (!ADDRESS_RE.test(contractEntry.address || "")) {
      issues.push(issue(BLOCKING, "manifest-binding/invalid-address", `${entryField}.address is not a valid 0x address.`, { field: `${entryField}.address` }));
    } else {
      const normalized = contractEntry.address.toLowerCase();
      const firstField = seen.get(normalized);
      if (firstField) {
        issues.push(issue(BLOCKING, "manifest-binding/duplicate-address", `${entryField}.address duplicates ${firstField}.address.`, { field: `${entryField}.address` }));
      } else if (builtInAddresses.has(normalized)) {
        issues.push(issue(BLOCKING, "manifest-binding/duplicate-address", `${entryField}.address is already covered by this binding's factoryAddress, tokenAddresses, or vaultAddresses.`, { field: `${entryField}.address` }));
      } else {
        seen.set(normalized, entryField);
      }
    }
    if (!isNonEmptyString(contractEntry.label) || contractEntry.label.trim().length < 2) {
      issues.push(issue(BLOCKING, "manifest-binding/invalid-external-contract-entry", `${entryField}.label must be a human-readable label.`, { field: `${entryField}.label` }));
    }
  }
  return issues;
}

function isValidFrameId(value) {
  return (
    typeof value === "string" &&
    value.length >= FRAME_ID_MIN_LENGTH &&
    value.length <= FRAME_ID_MAX_LENGTH &&
    FRAME_ID_RE.test(value)
  );
}

function checkExternalFrameDeclaration(frame, field, seenIds, seenSrcs) {
  const issues = [];
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
    issues.push(issue(BLOCKING, "frame-policy/invalid-frame-declaration", `${field} must be an object with id, provider, src, and title.`, { field }));
    return issues;
  }

  const allowedKeys = new Set(["id", "provider", "src", "title"]);
  for (const key of Object.keys(frame)) {
    if (!allowedKeys.has(key)) {
      issues.push(issue(BLOCKING, "frame-policy/invalid-frame-declaration", `${field}.${key} is not allowed.`, { field: `${field}.${key}` }));
    }
  }
  for (const key of ["id", "provider", "src", "title"]) {
    if (frame[key] === undefined) {
      issues.push(issue(BLOCKING, "frame-policy/invalid-frame-declaration", `${field}.${key} is required.`, { field: `${field}.${key}` }));
    }
  }

  if (frame.id !== undefined) {
    if (!isValidFrameId(frame.id)) {
      issues.push(issue(BLOCKING, "frame-policy/invalid-frame-declaration", `${field}.id must be 3-64 characters of lowercase kebab-case.`, { field: `${field}.id` }));
    } else if (seenIds.has(frame.id)) {
      issues.push(issue(BLOCKING, "frame-policy/duplicate-frame-id", `${field}.id duplicates ${seenIds.get(frame.id)}.id.`, { field: `${field}.id` }));
    } else {
      seenIds.set(frame.id, field);
    }
  }

  const policy = typeof frame.provider === "string" ? FRAME_PROVIDER_POLICIES[frame.provider] : undefined;
  if (!policy) {
    issues.push(issue(BLOCKING, "frame-policy/unsupported-provider", `${field}.provider must be tradingview, dexscreener, or coingecko-terminal.`, { field: `${field}.provider` }));
  }

  const parsedSrc = typeof frame.src === "string" ? parseUrl(frame.src) : null;
  if (!isNonEmptyString(frame.src) || !parsedSrc) {
    issues.push(issue(BLOCKING, "frame-policy/https-required", `${field}.src must be a static absolute HTTPS URL.`, { field: `${field}.src` }));
  } else {
    const normalizedSrc = parsedSrc.href;
    if (parsedSrc.protocol !== "https:" || parsedSrc.username || parsedSrc.password || parsedSrc.hash) {
      issues.push(issue(BLOCKING, "frame-policy/https-required", `${field}.src must use https, must not include credentials, and must not include a hash.`, { field: `${field}.src` }));
    }
    if (!parsedSrc.search) {
      issues.push(issue(BLOCKING, "frame-policy/fixed-query-required", `${field}.src must include the complete fixed query string used by the provider embed.`, { field: `${field}.src` }));
    }
    if (policy && !policy.origins.has(parsedSrc.origin)) {
      issues.push(issue(BLOCKING, "frame-policy/unsupported-origin", `${field}.src origin ${parsedSrc.origin} is not allowed for ${policy.label}.`, { field: `${field}.src` }));
    }
    const firstField = seenSrcs.get(normalizedSrc);
    if (firstField) {
      issues.push(issue(BLOCKING, "frame-policy/invalid-frame-declaration", `${field}.src duplicates ${firstField}.src.`, { field: `${field}.src` }));
    } else {
      seenSrcs.set(normalizedSrc, field);
    }
  }

  if (!isNonEmptyString(frame.title) || frame.title.trim().length < 2) {
    issues.push(issue(BLOCKING, "frame-policy/invalid-frame-declaration", `${field}.title must be a human-readable accessibility title.`, { field: `${field}.title` }));
  }

  if (issues.length === 0) {
    issues.push(
      issue(
        WARNING,
        "manual-review/external-frame",
        `Declared ${FRAME_PROVIDER_POLICIES[frame.provider].label} external frame ${frame.id}: ${frame.src}. External frames require Flap review approval before publish.`,
        {
          field,
          frameId: frame.id,
          provider: frame.provider,
          src: frame.src,
          title: frame.title,
        },
      ),
    );
  }
  return issues;
}

function checkExternalFrames(value) {
  const issues = [];
  const normalized = normalizeManifestExternalFrames(value);
  if (normalized === null) {
    issues.push(issue(BLOCKING, "frame-policy/invalid-frames", "manifest.externalFrames must be an array when provided.", { field: "externalFrames" }));
    return issues;
  }
  if (value !== undefined && normalized.length === 0) {
    issues.push(issue(BLOCKING, "frame-policy/invalid-frames", "manifest.externalFrames must contain at least one reviewed frame declaration when provided.", { field: "externalFrames" }));
    return issues;
  }
  if (normalized.length > MAX_REVIEWED_FRAMES_PER_VAULT) {
    issues.push(
      issue(
        BLOCKING,
        "frame-policy/too-many-reviewed-frames",
        "manifest.externalFrames may contain at most one reviewed frame declaration per Vault UI.",
        { field: "externalFrames" },
      ),
    );
  }

  const seenIds = new Map();
  const seenSrcs = new Map();
  for (const [index, frame] of normalized.entries()) {
    issues.push(...checkExternalFrameDeclaration(frame, `externalFrames[${index}]`, seenIds, seenSrcs));
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
          `manifest.json field ${key} is not developer-declared. Keep manifest limited to artifactId, name, match, i18n, endpoints, and externalFrames.`,
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
      issues.push(
        issue(
          BLOCKING,
          "manifest-binding/missing-bindings",
          "manifest.match.bindings must be a non-empty array. Each entry needs chainId plus factoryAddress, exactly one vaultAddresses entry, or tokenAddresses.",
          { field: "match.bindings" },
        ),
      );
    } else {
      const seenBindingKeys = new Map();
      for (const [index, bindingEntry] of manifest.match.bindings.entries()) {
        const field = `match.bindings[${index}]`;
        if (!bindingEntry || typeof bindingEntry !== "object" || Array.isArray(bindingEntry)) {
          issues.push(issue(BLOCKING, "manifest-binding/invalid-binding-entry", `${field} must be an object with chainId plus factoryAddress, vaultAddresses, or tokenAddresses.`, { field }));
          continue;
        }
        for (const key of Object.keys(bindingEntry)) {
          if (!ALLOWED_BINDING_ENTRY_KEYS.has(key)) {
            const ruleId = key === "caPolicy" || key === "restrictTokenAddresses" ? "manifest-binding/ca-policy-not-in-manifest" : "manifest-binding/disallowed-binding-field";
            issues.push(issue(BLOCKING, ruleId, `${field}.${key} is not allowed. Binding entries may only have chainId, factoryAddress, vaultAddresses, tokenAddresses, and externalContracts.`, { field: `${field}.${key}` }));
          }
        }
        if (!Number.isInteger(bindingEntry.chainId) || bindingEntry.chainId <= 0) {
          issues.push(issue(BLOCKING, "manifest-binding/invalid-chain-id", `${field}.chainId must be a positive integer (for example 56 or 97).`, { field: `${field}.chainId` }));
        }
        const hasFactoryField = bindingEntry.factoryAddress !== undefined;
        if (hasFactoryField && !ADDRESS_RE.test(bindingEntry.factoryAddress)) {
          issues.push(issue(BLOCKING, "manifest-binding/invalid-address", `${field}.factoryAddress is not a valid 0x address.`, { field: `${field}.factoryAddress` }));
        } else if (hasFactoryField && isZeroAddress(bindingEntry.factoryAddress)) {
          issues.push(
            issue(
              BLOCKING,
              "manifest-binding/zero-factory-address",
              `${field}.factoryAddress must be omitted for no-factory mode or set to a real non-zero factory contract address for factory mode.`,
              { field: `${field}.factoryAddress` },
            ),
          );
        }
        if (hasFactoryField && bindingEntry.vaultAddresses !== undefined) {
          issues.push(
            issue(
              BLOCKING,
              "manifest-binding/mixed-binding-target",
              `${field} mixes factoryAddress with vaultAddresses. Use factoryAddress for shared factory-scoped UI, or omit factoryAddress for Vault/token-scoped no-factory UI.`,
              { field },
            ),
          );
        }
        if (bindingEntry.vaultAddresses !== undefined) {
          if (!Array.isArray(bindingEntry.vaultAddresses) || bindingEntry.vaultAddresses.length === 0) {
            issues.push(issue(BLOCKING, "manifest-binding/invalid-vault-address-list", `${field}.vaultAddresses must be a non-empty array when provided.`, { field: `${field}.vaultAddresses` }));
          } else {
            for (const addr of bindingEntry.vaultAddresses) {
              if (!ADDRESS_RE.test(addr) || isZeroAddress(addr)) {
                issues.push(issue(BLOCKING, "manifest-binding/invalid-address", `${field}.vaultAddresses contains invalid or zero address: ${addr}.`, { field: `${field}.vaultAddresses` }));
              }
            }
            if (!hasFactoryField && bindingEntry.vaultAddresses.length !== 1) {
              issues.push(issue(BLOCKING, "manifest-binding/invalid-vault-address-list", `${field}.vaultAddresses must contain exactly one Vault address when factoryAddress is omitted.`, { field: `${field}.vaultAddresses` }));
            }
            issues.push(...checkAddressListDuplicates(bindingEntry.vaultAddresses, `${field}.vaultAddresses`));
          }
        } else if (!hasFactoryField && bindingEntry.tokenAddresses === undefined) {
          issues.push(issue(BLOCKING, "manifest-binding/missing-binding-target", `${field} must include factoryAddress, exactly one vaultAddresses entry, or tokenAddresses.`, { field }));
        }
        if (bindingEntry.tokenAddresses !== undefined) {
          if (!Array.isArray(bindingEntry.tokenAddresses) || bindingEntry.tokenAddresses.length === 0) {
            issues.push(issue(BLOCKING, "manifest-binding/invalid-token-address-list", `${field}.tokenAddresses must be a non-empty array when provided.`, { field: `${field}.tokenAddresses` }));
          } else {
            for (const addr of bindingEntry.tokenAddresses) {
              if (!ADDRESS_RE.test(addr) || isZeroAddress(addr)) {
                issues.push(issue(BLOCKING, "manifest-binding/invalid-address", `${field}.tokenAddresses contains invalid or zero address: ${addr}.`, { field: `${field}.tokenAddresses` }));
              }
            }
            issues.push(...checkAddressListDuplicates(bindingEntry.tokenAddresses, `${field}.tokenAddresses`));
          }
        }
        const bindingKeys = bindingIdentityKeys(bindingEntry);
        for (const bindingKey of bindingKeys || []) {
          const firstField = seenBindingKeys.get(bindingKey);
          if (firstField) {
            issues.push(issue(BLOCKING, "manifest-binding/duplicate-binding", `${field} duplicates ${firstField}. Each runtime binding target must appear only once.`, { field }));
          } else {
            seenBindingKeys.set(bindingKey, field);
          }
        }
        if (bindingEntry.externalContracts !== undefined) {
          const builtInAddresses = new Set(
            [
              normalizeAddress(bindingEntry.factoryAddress),
              ...(bindingEntry.tokenAddresses || []).map(normalizeAddress),
              ...(bindingEntry.vaultAddresses || []).map(normalizeAddress),
            ].filter(Boolean),
          );
          issues.push(...checkExternalContracts(bindingEntry.externalContracts, `${field}.externalContracts`, builtInAddresses));
        }
      }
    }
  }
  if (hasTypeBasedBinding(manifest)) {
    issues.push(issue(BLOCKING, "manifest-binding/no-type-based-binding", "Do not use type-based binding for custom UI matching."));
  }
  const manifestLocales = getManifestLocales(manifest);
  const invalidManifestLocales = Array.isArray(manifest.i18n) ? manifest.i18n.filter((locale) => typeof locale !== "string" || locale.trim().length < 2) : [];
  if (!Array.isArray(manifest.i18n) || manifestLocales.length === 0 || invalidManifestLocales.length > 0) {
    issues.push(issue(BLOCKING, "i18n-policy/manifest-locales", "manifest.i18n must declare at least one locale, and every locale must be a string with at least two characters."));
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
      const parsedEndpoint = typeof endpoint === "string" ? parseUrl(endpoint) : null;
      if (!isNonEmptyString(endpoint) || !parsedEndpoint) {
        issues.push(issue(BLOCKING, "endpoint-policy/invalid-endpoint-declaration", `Endpoint declaration at ${field} must be a valid absolute HTTPS URL string.`, { field }));
        continue;
      }
      if (parsedEndpoint.protocol !== "https:") {
        issues.push(issue(BLOCKING, "endpoint-policy/https-required", `Endpoint ${endpoint} must use https.`, { field }));
      } else if (parsedEndpoint.username || parsedEndpoint.password) {
        issues.push(issue(BLOCKING, "endpoint-policy/no-credentials", `Endpoint ${endpoint} must not include username or password credentials.`, { field }));
      } else {
        issues.push(issue(WARNING, "manual-review/external-endpoint", `Declared external endpoint ${endpoint}. External endpoints are discouraged and require Flap review approval before publish.`, { field }));
      }
    }
  }
  issues.push(...checkExternalFrames(manifest.externalFrames));
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
  const declaredFrames = collectDeclaredFrames(manifest);
  const contractPolicy = collectManifestContractPolicy(manifest);
  const sourceFiles = walk(vaultDir).filter((item) => !item.isDirectory && !item.isSymlink && item.name.match(/\.(ts|tsx|js|jsx)$/));
  for (const item of sourceFiles) {
    const rel = path.relative(ROOT, item.path);
    const content = fs.readFileSync(item.path, "utf8");
    const scanContent = stripCommentsForScanning(content);
    const checks = [
      [/window\.ethereum/, "forbidden-api/direct-window-ethereum", "Direct window.ethereum access is not allowed."],
      [/\b(?:window|globalThis|global)\s*\[\s*["'`]ethereum["'`]\s*\]/, "forbidden-api/direct-window-ethereum", "Direct ethereum provider access is not allowed."],
      [/\b(?:globalThis|global)\.ethereum\b/, "forbidden-api/direct-window-ethereum", "Direct ethereum provider access is not allowed."],
      [/\{\s*ethereum\b[^}]*\}\s*=\s*(?:window|globalThis|global|self)\b/, "forbidden-api/direct-window-ethereum", "Destructuring ethereum from browser globals is not allowed."],
      [/\beval\s*\(/, "forbidden-api/eval", "eval() is not allowed."],
      [/\b(?:new\s+)?Function\s*\(/, "forbidden-api/function-constructor", "Function constructor usage is not allowed."],
      [/<iframe\b/i, "forbidden-api/iframe", "raw iframe UI is not allowed. Use ReviewedFrame for reviewed display-only externalFrames."],
      [/document\.createElement\s*\(\s*["'`]iframe["'`]\s*\)/, "forbidden-api/iframe", "raw iframe creation is not allowed. Use ReviewedFrame for reviewed display-only externalFrames."],
      [/<script\b/i, "forbidden-api/script", "script injection is not allowed."],
      [/document\.createElement\s*\(\s*["'`]script["'`]\s*\)/, "forbidden-api/script", "script injection is not allowed."],
      [/\bdocument\.write(?:ln)?\s*\(/, "forbidden-api/script", "document.write/writeln is not allowed inside Vault components."],
      [/dangerouslySetInnerHTML/, "forbidden-api/dangerously-set-inner-html", "dangerouslySetInnerHTML needs explicit review and is blocked by default."],
      [/import\s*\(\s*["'`]https?:\/\//, "forbidden-api/remote-import", "Runtime remote import is not allowed inside Vault components."],
      [/\b(?:window|globalThis|global|self|navigator|document)\s*\[[^\]\n]+\]/, "forbidden-api/browser-global-escape", "Computed browser global access is not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:window|globalThis|global|self|navigator|document)\b(?!\s*[.[\]])/, "forbidden-api/browser-global-escape", "Aliasing browser globals is not allowed inside Vault components."],
      [/\{\s*[^}\n]+\}\s*=\s*(?:window|globalThis|global|self|navigator|document)\b/, "forbidden-api/browser-global-escape", "Destructuring browser globals is not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:(?:window|globalThis|global|self)\.)?fetch\b/, "forbidden-api/browser-network", "Aliasing fetch is not allowed inside Vault components."],
      [/\{\s*fetch\b[^}]*\}\s*=\s*(?:window|globalThis|global|self)\b/, "forbidden-api/browser-network", "Destructuring fetch from browser globals is not allowed inside Vault components."],
      [/\b(?:window|globalThis|global|self)\.fetch\b/, "forbidden-api/browser-network", "Direct browser fetch access is not allowed inside Vault components."],
      [/\bnew\s+XMLHttpRequest\s*\(|\bXMLHttpRequest\s*\(/, "forbidden-api/browser-network", "XMLHttpRequest is not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:(?:window|globalThis|global|self)\.)?XMLHttpRequest\b/, "forbidden-api/browser-network", "Aliasing XMLHttpRequest is not allowed inside Vault components."],
      [/\{\s*XMLHttpRequest\b[^}]*\}\s*=\s*(?:window|globalThis|global|self)\b/, "forbidden-api/browser-network", "Destructuring XMLHttpRequest from browser globals is not allowed inside Vault components."],
      [/\b(?:window|globalThis|global|self)\.XMLHttpRequest\b/, "forbidden-api/browser-network", "XMLHttpRequest is not allowed inside Vault components."],
      [/\bnew\s+WebSocket\s*\(|\bWebSocket\s*\(/, "forbidden-api/browser-network", "WebSocket is not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:(?:window|globalThis|global|self)\.)?WebSocket\b/, "forbidden-api/browser-network", "Aliasing WebSocket is not allowed inside Vault components."],
      [/\{\s*WebSocket\b[^}]*\}\s*=\s*(?:window|globalThis|global|self)\b/, "forbidden-api/browser-network", "Destructuring WebSocket from browser globals is not allowed inside Vault components."],
      [/\b(?:window|globalThis|global|self)\.WebSocket\b/, "forbidden-api/browser-network", "WebSocket is not allowed inside Vault components."],
      [/\bnew\s+EventSource\s*\(|\bEventSource\s*\(/, "forbidden-api/browser-network", "EventSource is not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:(?:window|globalThis|global|self)\.)?EventSource\b/, "forbidden-api/browser-network", "Aliasing EventSource is not allowed inside Vault components."],
      [/\{\s*EventSource\b[^}]*\}\s*=\s*(?:window|globalThis|global|self)\b/, "forbidden-api/browser-network", "Destructuring EventSource from browser globals is not allowed inside Vault components."],
      [/\b(?:window|globalThis|global|self)\.EventSource\b/, "forbidden-api/browser-network", "EventSource is not allowed inside Vault components."],
      [/\bnavigator\.sendBeacon\s*\(/, "forbidden-api/browser-network", "navigator.sendBeacon is not allowed inside Vault components."],
      [/\bnavigator\.sendBeacon\b/, "forbidden-api/browser-network", "navigator.sendBeacon access is not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*navigator\.sendBeacon\b/, "forbidden-api/browser-network", "Aliasing navigator.sendBeacon is not allowed inside Vault components."],
      [/\{\s*sendBeacon\b[^}]*\}\s*=\s*navigator\b/, "forbidden-api/browser-network", "Destructuring sendBeacon from navigator is not allowed inside Vault components."],
      [/\bnew\s+Image\s*\(|\bImage\s*\(/, "forbidden-api/browser-network", "Image network loading is not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:(?:window|globalThis|global|self)\.)?Image\b/, "forbidden-api/browser-network", "Aliasing Image is not allowed inside Vault components."],
      [/\{\s*Image\b[^}]*\}\s*=\s*(?:window|globalThis|global|self)\b/, "forbidden-api/browser-network", "Destructuring Image from browser globals is not allowed inside Vault components."],
      [/\b(?:window|globalThis|global|self)\.Image\b/, "forbidden-api/browser-network", "Image network loading is not allowed inside Vault components."],
      [/document\.createElement\s*\(\s*["'`]img["'`]\s*\)/, "forbidden-api/browser-network", "Dynamic image elements are not allowed inside Vault components."],
      [/\b(?:window\.|globalThis\.|self\.)?(?:localStorage|sessionStorage)\b/, "forbidden-api/browser-storage", "Browser storage APIs are not allowed inside Vault components."],
      [/\b(?:window\.|globalThis\.|self\.)?indexedDB\b/, "forbidden-api/browser-storage", "indexedDB is not allowed inside Vault components."],
      [/\b(?:window\.|globalThis\.|self\.)?caches\b/, "forbidden-api/browser-storage", "Cache Storage is not allowed inside Vault components."],
      [/\bdocument\.cookie\b/, "forbidden-api/browser-storage", "document.cookie is not allowed inside Vault components."],
      [/\b(?:window|globalThis|self)\.open\b/, "forbidden-api/browser-navigation", "Opening new windows is not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:window|globalThis|self)\.open\b/, "forbidden-api/browser-navigation", "Aliasing window.open is not allowed inside Vault components."],
      [/\{\s*open\b[^}]*\}\s*=\s*(?:window|globalThis|self)\b/, "forbidden-api/browser-navigation", "Destructuring open from browser globals is not allowed inside Vault components."],
      [/\b(?:window|globalThis|self)\.location\b|\blocation\.(?:href|assign|replace|reload)\b/, "forbidden-api/browser-navigation", "Browser navigation is not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:window|globalThis|self)\.location\b/, "forbidden-api/browser-navigation", "Aliasing browser location is not allowed inside Vault components."],
      [/\{\s*location\b[^}]*\}\s*=\s*(?:window|globalThis|self)\b/, "forbidden-api/browser-navigation", "Destructuring location from browser globals is not allowed inside Vault components."],
      [/\b(?:window|globalThis|self)\.history\b|\bhistory\.(?:pushState|replaceState|go|back|forward)\b/, "forbidden-api/browser-navigation", "Browser history mutation is not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:window|globalThis|self)\.history\b/, "forbidden-api/browser-navigation", "Aliasing browser history is not allowed inside Vault components."],
      [/\{\s*history\b[^}]*\}\s*=\s*(?:window|globalThis|self)\b/, "forbidden-api/browser-navigation", "Destructuring history from browser globals is not allowed inside Vault components."],
      [/\bnew\s+(?:Worker|SharedWorker)\s*\(|\b(?:Worker|SharedWorker)\s*\(/, "forbidden-api/browser-worker", "Worker APIs are not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:(?:window|globalThis|self)\.)?(?:Worker|SharedWorker)\b/, "forbidden-api/browser-worker", "Aliasing Worker APIs is not allowed inside Vault components."],
      [/\{\s*(?:Worker|SharedWorker)\b[^}]*\}\s*=\s*(?:window|globalThis|self)\b/, "forbidden-api/browser-worker", "Destructuring Worker APIs from browser globals is not allowed inside Vault components."],
      [/\b(?:window|globalThis|self)\.(?:Worker|SharedWorker)\b/, "forbidden-api/browser-worker", "Worker APIs are not allowed inside Vault components."],
      [/\bnavigator\.serviceWorker\b/, "forbidden-api/browser-worker", "Service Worker APIs are not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*navigator\.serviceWorker\b/, "forbidden-api/browser-worker", "Aliasing serviceWorker is not allowed inside Vault components."],
      [/\{\s*serviceWorker\b[^}]*\}\s*=\s*navigator\b/, "forbidden-api/browser-worker", "Destructuring serviceWorker from navigator is not allowed inside Vault components."],
      [/\bnew\s+BroadcastChannel\s*\(|\bBroadcastChannel\s*\(/, "forbidden-api/cross-context-messaging", "BroadcastChannel is not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:(?:window|globalThis|self)\.)?BroadcastChannel\b/, "forbidden-api/cross-context-messaging", "Aliasing BroadcastChannel is not allowed inside Vault components."],
      [/\{\s*BroadcastChannel\b[^}]*\}\s*=\s*(?:window|globalThis|self)\b/, "forbidden-api/cross-context-messaging", "Destructuring BroadcastChannel from browser globals is not allowed inside Vault components."],
      [/\b(?:window|globalThis|self)\.BroadcastChannel\b/, "forbidden-api/cross-context-messaging", "BroadcastChannel is not allowed inside Vault components."],
      [/\b(?:window|globalThis|self)\.postMessage\b/, "forbidden-api/cross-context-messaging", "postMessage is not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:window|globalThis|self)\.postMessage\b/, "forbidden-api/cross-context-messaging", "Aliasing postMessage is not allowed inside Vault components."],
      [/\{\s*postMessage\b[^}]*\}\s*=\s*(?:window|globalThis|self)\b/, "forbidden-api/cross-context-messaging", "Destructuring postMessage from browser globals is not allowed inside Vault components."],
      [/\baddEventListener\s*\(\s*["'`]message["'`]/, "forbidden-api/cross-context-messaging", "Listening to postMessage events is not allowed inside Vault components."],
      [/\b(?:window|globalThis|self)\.onmessage\s*=/, "forbidden-api/cross-context-messaging", "Listening to postMessage events is not allowed inside Vault components."],
      [/\bnavigator\.(?:clipboard|geolocation|mediaDevices|permissions)\b/, "forbidden-api/browser-permission", "Browser permission APIs are not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*navigator\.(?:clipboard|geolocation|mediaDevices|permissions)\b/, "forbidden-api/browser-permission", "Aliasing browser permission APIs is not allowed inside Vault components."],
      [/\{\s*(?:clipboard|geolocation|mediaDevices|permissions)\b[^}]*\}\s*=\s*navigator\b/, "forbidden-api/browser-permission", "Destructuring browser permission APIs from navigator is not allowed inside Vault components."],
      [/\bNotification\.(?:requestPermission|permission)\b|\bnew\s+Notification\s*\(/, "forbidden-api/browser-permission", "Notification APIs are not allowed inside Vault components."],
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:(?:window|globalThis|self)\.)?Notification\b/, "forbidden-api/browser-permission", "Aliasing Notification is not allowed inside Vault components."],
      [/\{\s*Notification\b[^}]*\}\s*=\s*(?:window|globalThis|self)\b/, "forbidden-api/browser-permission", "Destructuring Notification from browser globals is not allowed inside Vault components."],
    ];
    for (const [pattern, ruleId, message] of checks) {
      const match = pattern.exec(scanContent);
      if (match) {
        issues.push(issue(BLOCKING, ruleId, message, { file: rel, line: lineForIndex(scanContent, match.index) }));
      }
    }
    const importRegex = /from\s+["'`]([^"'`]+)["'`]|import\s+["'`]([^"'`]+)["'`]/g;
    for (const match of scanContent.matchAll(importRegex)) {
      const spec = match[1] || match[2];
      if (spec.startsWith("./") || spec.startsWith("../")) {
        if (!ALLOWED_RELATIVE_IMPORTS.has(normalizeRelativeImport(spec))) {
          issues.push(issue(BLOCKING, "imports-and-dependencies/disallowed-relative-import", `Only ./VaultABI may be imported from a Vault package. ${spec} is not allowed because src/vaults/${path.basename(vaultDir)} has a fixed file set.`, { file: rel }));
        }
      } else if (FORBIDDEN_IMPORTS.some((blocked) => spec === blocked || spec.startsWith(`${blocked}/`))) {
        issues.push(issue(BLOCKING, "imports-and-dependencies/forbidden-import", `Forbidden import ${spec}. Use Flap SDK/UI primitives instead.`, { file: rel }));
      } else if (/sdk/i.test(spec) && !ALLOWED_IMPORTS.some((allowed) => spec === allowed || spec.startsWith(`${allowed}/`))) {
        issues.push(issue(BLOCKING, "imports-and-dependencies/external-sdk-package", `External SDK-style import ${spec} is not allowed. Use the shared @/src/sdk and @/src/ui surfaces only.`, { file: rel }));
      } else if (!ALLOWED_IMPORTS.some((allowed) => spec === allowed || spec.startsWith(`${allowed}/`))) {
        issues.push(issue(BLOCKING, "imports-and-dependencies/unreviewed-import", `Import ${spec} is not in the approved allowlist.`, { file: rel }));
      }
    }
    issues.push(...collectDynamicImportIssues(content, rel));
    issues.push(...collectReviewedFrameIssues(scanContent, rel, declaredFrames));
    const requireRegex = /\brequire\s*\(/g;
    for (const match of scanContent.matchAll(requireRegex)) {
      issues.push(issue(BLOCKING, "imports-and-dependencies/require-call", "CommonJS require() is not allowed inside a Vault package.", { file: rel, line: lineForIndex(scanContent, match.index ?? -1) }));
    }
    const oracleIds = new Set();
    const oracleCallRegex = /\breadOracle(?:<[^>]+>)?\(\s*["'`]([^"'`]+)["'`]/g;
    for (const match of scanContent.matchAll(oracleCallRegex)) {
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
    for (const match of scanContent.matchAll(relativeFetchRegex)) {
      issues.push(
        issue(
          BLOCKING,
          "endpoint-policy/relative-endpoint",
          "Host-relative fetch calls are not allowed inside Vault source because they can hide private app endpoints.",
          { file: rel, line: lineForIndex(scanContent, match.index) },
        ),
      );
    }
    const fetchCallRegex = /\bfetch\s*\(\s*([^,\n)]*)/g;
    for (const match of scanContent.matchAll(fetchCallRegex)) {
      const rawTarget = match[1]?.trim() ?? "";
      const staticTarget = staticStringLiteral(rawTarget);
      const parsedTarget = staticTarget ? parseUrl(staticTarget) : null;
      if (!staticTarget || !parsedTarget || parsedTarget.protocol !== "https:" || parsedTarget.username || parsedTarget.password || !isDeclaredUrl(staticTarget, declaredUrls)) {
        issues.push(
          issue(
            BLOCKING,
            "endpoint-policy/direct-fetch",
            "fetch() targets inside Vault source must be static absolute HTTPS URLs without credentials and declared in manifest.endpoints for Flap review.",
            { file: rel, line: lineForIndex(scanContent, match.index ?? -1) },
          ),
        );
      }
    }
    for (const navigationRegex of externalNavigationRegexes) {
      for (const match of scanContent.matchAll(navigationRegex)) {
        const url = sanitizeUrlLiteral(match[1]);
        if (!isApprovedNavigationUrl(url)) {
          issues.push(
            issue(
              BLOCKING,
              "navigation-policy/unapproved-external-navigation",
              `External navigation ${url} is not allowed inside a Vault component. Keep user-facing navigation on the chain explorer only.`,
              { file: rel, line: lineForIndex(scanContent, match.index) },
            ),
          );
        }
      }
    }
    for (const match of scanContent.matchAll(externalUrlRegex)) {
      const url = sanitizeUrlLiteral(match[0]);
      if (!isAllowlistedExternalUrl(url, declaredUrls, declaredFrames)) {
        issues.push(issue(BLOCKING, "endpoint-policy/undeclared-url", `URL ${url} is not declared in manifest endpoints or externalFrames. Undeclared endpoints and external resources are rejected.`, { file: rel, line: lineForIndex(scanContent, match.index) }));
      }
    }
    for (const match of scanContent.matchAll(dataUrlRegex)) {
      issues.push(
        issue(
          BLOCKING,
          "media-policy/remote-media",
          "Embedded data URL media is not allowed inside Vault source. Use Flap-controlled media/runtime policy instead.",
          { file: rel, line: lineForIndex(scanContent, match.index) },
        ),
      );
    }
    for (const scheme of UNSAFE_RESOURCE_SCHEMES) {
      const schemeIndex = scanContent.toLowerCase().indexOf(scheme);
      if (schemeIndex >= 0) {
        issues.push(
          issue(
            BLOCKING,
            "endpoint-policy/undeclared-url",
            `${scheme} resource literals are not allowed inside Vault source. Use Flap-controlled runtime media/oracle provisioning instead.`,
            { file: rel, line: lineForIndex(scanContent, schemeIndex) },
          ),
        );
      }
    }
    if (/url\(\s*["']?(?:https?:\/\/|ipfs:\/\/|ar:\/\/|data:)/i.test(scanContent) || /<img[^>]+src=["'](?:https?:\/\/|ipfs:\/\/|ar:\/\/|data:)/i.test(scanContent)) {
      issues.push(issue(BLOCKING, "media-policy/remote-media", "Remote media is not developer-declared in this template. Use Flap-controlled media/runtime policy instead.", { file: rel }));
    }
    const hardcodedAddressRegex = /["'`]0x[a-fA-F0-9]{40}["'`]/g;
    for (const match of scanContent.matchAll(hardcodedAddressRegex)) {
      const normalizedAddress = normalizeAddress(match[0].slice(1, -1));
      if (!normalizedAddress || !contractPolicy.all.has(normalizedAddress)) {
        issues.push(issue(BLOCKING, "security/hardcoded-address", `Hardcoded address ${match[0]} found in Vault source. Use runtime context addresses or declare intentional external contract addresses in manifest.`, { file: rel, line: lineForIndex(scanContent, match.index) }));
      }
    }
    if (/refetchInterval\s*:\s*([0-4]?\d{1,3})(?!\d)/.test(scanContent)) {
      issues.push(issue(WARNING, "performance/refetch-too-fast", "refetchInterval below 5000ms needs review.", { file: rel }));
    }
    const standardErc20NameRegex = new RegExp(
      String.raw`(?:\bname\s*:\s*["'](?:${STANDARD_ERC20_METHODS.join("|")})["']|\b(?:${STANDARD_ERC20_METHODS.join("|")})\s*\()`,
    );
    if (item.name === "VaultABI.ts" && hasUnparsedHumanReadableAbi(scanContent)) {
      issues.push(
        issue(
          BLOCKING,
          "contract-abi/human-readable-requires-parse-abi",
          "VaultABI.ts exports human-readable ABI signature strings without parseAbi(...). viem runtime calls expect parsed object ABI fragments, so raw signature strings can fail at preview/runtime.",
          { file: rel },
        ),
      );
    }
    if (item.name === "VaultABI.ts" && standardErc20NameRegex.test(scanContent)) {
      issues.push(
        issue(
          WARNING,
          "contract-abi/standard-erc20-in-vault-abi",
          "Standard ERC20 ABI is already provided by @/src/sdk. Keep VaultABI.ts for Vault methods and custom non-standard token mechanics only.",
          { file: rel },
        ),
      );
    }
    const hasUserWritePath = /\b(?:writeContract|simulateContract)\s*\(|<TxButton\b/.test(scanContent);
    const hasMarketPhaseHandling = /\b(?:marketPhase|isActionAvailableForPhase)\b/.test(scanContent);
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
    if (item.name === "Component.tsx" && !hasRiskStatusIntegration(scanContent)) {
      issues.push(
        issue(
          BLOCKING,
          "risk-status/missing-host-risk-state",
          "Every onboarded Vault UI must read and visibly render the current contract risk status from host Vault/TaxInfo context. If the host risk level is unavailable, render a prominent message that this Vault must add risk-status integration.",
          { file: rel },
        ),
      );
    }
    if (/Number\s*\([^)]*(amount|balance|allowance|deposit|claim|reward)/i.test(scanContent)) {
      issues.push(issue(WARNING, "contract-abi/number-bigint", "Avoid Number(...) for token amounts used in transaction logic.", { file: rel }));
    }
    issues.push(...collectContractInteractionIssues(content, rel, contractPolicy));
    const i18nCallRegex = /(?:^|[^\w.])(?:t|i18n\.t)\(\s*["'`]([^"'`]+)["'`]/g;
    for (const match of scanContent.matchAll(i18nCallRegex)) {
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
    frameId: item.frameId,
    provider: item.provider,
    src: item.src,
    locale: item.locale,
    key: item.key,
    fixHint: item.fixHint,
  }));
}

function collectManualReview(issues) {
  const externalFrames = issues
    .filter((item) => item.ruleId === "manual-review/external-frame" && item.src)
    .map((item) => ({
      frameId: item.frameId,
      provider: item.provider,
      src: item.src,
      title: item.title,
      field: item.field,
      severity: item.severity,
      ruleId: item.ruleId,
    }));

  return { externalFrames };
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
    review: collectManualReview(issues),
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
  if (process.env.VAULT_CHECK_SKIP_REGISTRATION !== "1" && !isFolderNameRegistered(folderName)) {
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
  const folderName = process.argv[2];
  if (folderName) await assertNpmPackageFresh({ folderName });
  const result = runVaultCheck(folderName);
  const hasBlocking = result.issues.some((item) => item.severity === BLOCKING);
  process.exit(hasBlocking ? 1 : 0);
}
