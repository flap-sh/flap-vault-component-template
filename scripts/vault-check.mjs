#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";
import { assertTemplateFresh } from "./check-template-fresh.mjs";
import { collectManifestErc20TokenIssues, hasRequiredTestTokenSuffix, REQUIRED_TEST_TOKEN_SUFFIX } from "./erc20-token-validation.mjs";

const ROOT = process.env.VAULT_CHECK_ROOT ? path.resolve(process.env.VAULT_CHECK_ROOT) : process.cwd();
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const RESERVED_PLACEHOLDER_ADDRESSES = new Map([
  ["0x1000000000000000000000000000000000000001", "template factory placeholder"],
  ["0x2000000000000000000000000000000000000002", "template token placeholder"],
  ["0x2000000000000000000000000000000000000005", "template token placeholder"],
]);
const FOLDER_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FOLDER_NAME_MIN_LENGTH = 3;
const FOLDER_NAME_MAX_LENGTH = 64;
const ARTIFACT_ID_RE = /^vaultui_([a-z0-9]+(?:-[a-z0-9]+)*)_([0-9A-HJKMNPQRSTVWXYZ]{26})$/;
const FORBIDDEN_NAMES = new Set(["node_modules", ".git", ".vercel", ".env", ".env.local", "package-lock.json", "pnpm-lock.yaml"]);
const REQUIRED_FILES = ["Component.tsx", "manifest.json", "VaultABI.ts", "i18n.json"];
const ALLOWED_VAULT_FILES = new Set(REQUIRED_FILES);
const ALLOWED_RELATIVE_IMPORTS = new Set(["./VaultABI"]);
const ALLOWED_MANIFEST_KEYS = new Set(["artifactId", "name", "match", "i18n", "layout", "endpoints", "externalFrames"]);
const ALLOWED_MATCH_KEYS = new Set(["bindings"]);
const ALLOWED_BINDING_ENTRY_KEYS = new Set(["chainId", "factoryAddress", "vaultAddresses", "tokenAddresses", "externalContracts"]);
const FULLSCREEN_LAYOUT = "fullscreen";
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
const TX_BUTTON_STATES = new Set(["idle", "validating", "approving", "approval_confirming", "simulating", "writing", "confirming", "success", "failed"]);
const TX_BUTTON_STATE_LIST = [...TX_BUTTON_STATES].join(", ");
const ALLOWED_IMPORTS = [
  "react",
  "viem",
  "decimal.js",
  "lucide-react",
  "@/src/sdk",
  "@/src/ui",
];
const SHARED_RUNTIME_IMPORTS = new Set(["@/src/sdk", "@/src/ui"]);
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
  "viem/accounts",
];
const APPROVED_EXPLORER_ORIGINS = new Set(["https://bscscan.com", "https://testnet.bscscan.com"]);
const DEFAULT_ALLOWED_URL_PREFIXES = [];
const APPROVED_CONTRACT_LABEL_RE = /\b(?:vault|token|nft)\b/i;
const APPROVED_CONTRACT_ADDRESS_KEYWORD_RE =
  /(paymenttoken|quotetoken|dividendtoken|rewardtoken|staketoken|taxtoken|targettoken|targetasset|approvedbuybacktoken|proposedtoken|nftaddress|nft|lptoken|assettoken|underlyingtoken|buybacktoken|feevaultaddress|feevault|wrappednativetoken|wrappednative|nativetoken|basetoken)/i;
const FORBIDDEN_CONTRACT_ADDRESS_KEYWORD_RE = /(router|bridge|oracle|aggregator|pair|amm|treasury|governor)/i;
const CONTRACT_INTERACTION_METHODS = ["readContract", "simulateContract", "writeContract", "watchContractEvent", "createContractEventFilter", "getLogs", "estimateContractGas"];
const CONTRACT_LABEL_REQUIRED_METHODS = new Set(["readContract", "simulateContract", "writeContract"]);
const FORBIDDEN_UI_OPERATOR_FUNCTION_NAMES = new Set(["setConfig", "setSwapPath", "setSplit"]);
const CONTRACT_INTERACTION_METHOD_RE = new RegExp(`^(?:${CONTRACT_INTERACTION_METHODS.join("|")})\\b`, "u");
const RUNTIME_ORACLE_REGISTRY_ENV = "FLAP_RUNTIME_ORACLE_REGISTRY";
const ORACLE_ID_RE = /^[a-zA-Z0-9._:-]{1,96}$/;
const BUILTIN_RUNTIME_ORACLE_PROVISIONS = new Map([
  [
    "example-reward-oracle",
    {
      source: "built-in",
      endpoints: [],
      allowedParams: [],
      fixedParams: {},
    },
  ],
  [
    "bnb-usd-price",
    {
      source: "built-in",
      endpoints: [
        "https://api.binance.com/api/v3/avgPrice?symbol=BNBUSDT",
        "https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f&encoding=base64&parsed=true",
      ],
      allowedParams: [],
      fixedParams: {},
    },
  ],
  [
    "v2-pool-reserves",
    {
      source: "built-in",
      endpoints: ["https://oracle.taxed.fun/v2-pool-reserves", "https://oracle-testnet.taxed.fun/v2-pool-reserves"],
      allowedParams: ["pool"],
      fixedParams: {},
    },
  ],
]);
const RISK_STATUS_DISPLAY_RE = /<(?:StatusBadge|DetailTile|Metric|DataRow|InfoRow)\b(?=[^>]*\b(?:riskLabel|riskLevel|riskTone)\b)|<StatusBadge\b[^>]*>\s*{?\s*(?:riskLabel|riskLevel|riskTone)\b/;
const RISK_STATUS_TOP_OFFSET_LIMIT = 1400;
const RISK_STATUS_MAX_BUSINESS_ROWS_BEFORE = 2;
const RISK_STATUS_PRECEDING_BUSINESS_ROW_RE = /<(?:StatusBadge|DetailTile|Metric|DataRow|InfoRow|TxButton)\b/g;
const RISK_STATUS_PRECEDING_LARGE_VISUAL_RE = /<(?:img|video|canvas)\b|<ReviewedFrame\b|<[A-Z][A-Za-z0-9]*(?:Preview|Hero|Banner|Showcase|Media|Visual|Artwork|Illustration|Gallery)\b/;
const VISUAL_REFERENCE_EXAMPLE_FOLDERS = new Set([
  "example",
  "dex-listed-example",
  "action-gallery-example",
  "community-buyback-example",
  "flapixel-example",
]);
const VISUAL_BUSINESS_TILE_RE = /<(?:Metric|DetailTile|DataRow)\b/g;
const VISUAL_CARD_RE = /<Card\b/g;
const VISUAL_ACTION_RE = /<(?:TxButton|Button)\b/g;
const ALLOWED_BROWSER_GLOBAL_MEMBERS = new Map([
  ["window", new Set(["setTimeout", "clearTimeout", "setInterval", "clearInterval", "open"])],
]);
const CJK_VISIBLE_COPY_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;

const BLOCKING = "blocking";
const WARNING = "warning";
const INFO = "info";
const TYPE_BINDING_KEYS = new Set(["vault" + "Type", "vault" + "Types"]);
const UNSAFE_RESOURCE_SCHEMES = ["ipfs://", "ar://", "data:", "javascript:"];
const ALLOWED_IPFS_IMAGE_GATEWAY_ORIGINS = new Set([
  "https://flap.mypinata.cloud",
  "https://magenta-naval-penguin-822.mypinata.cloud",
]);
const IPFS_IMAGE_CID_RE = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/;
const ALLOWED_INLINE_SVG_TAGS = new Set([
  "svg",
  "g",
  "defs",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "title",
  "desc",
]);
const INLINE_SVG_LOCAL_REF_RE = /^#[A-Za-z0-9_.:-]+$/;

const FIX_HINTS = {
  "cli/missing-folder-name": "Run yarn vault:check <folder-name> with a registered Vault folder name.",
  "cli/missing-slug": "Run yarn vault:check <slug> with a registered Vault slug.",
  "cli/invalid-folder-name": "Use a 3-64 character lowercase kebab-case folder name, for example my-vault.",
  "package-structure/missing-vault-dir": "Create the package with yarn vault:scaffold <folder-name> --chain 97 --factory 0xTestnetFactory --token 0xReal7777TestToken --chain 56 --factory 0xMainnetFactory or yarn vault:scaffold <folder-name> --chain 56 --vault 0x... --token 0x..., or add src/vaults/<folder-name>.",
  "package-structure/missing-required-file": "Keep exactly Component.tsx, manifest.json, VaultABI.ts, and i18n.json in the Vault folder.",
  "package-structure/disallowed-vault-file": "Move helpers, assets, nested components, docs, and sample data outside src/vaults/<folder-name> or inline small code in Component.tsx.",
  "preview-registration/missing-vault-module": "Register the folder name in src/vaults/index.ts with loadComponent, loadManifest, and loadI18n entries.",
  "forbidden-files/disallowed-entry": "Remove environment, dependency, git, or build output files from the Vault package.",
  "forbidden-files/symlink": "Replace symlinks with real files inside the Vault package. Symlinks are not allowed.",
  "manifest-schema/invalid-json": "Fix JSON syntax in manifest.json.",
  "manifest-schema/disallowed-field": "Remove internal runtime fields. Developer manifest fields are artifactId, name, match, i18n, optional layout, endpoints, and optional reviewed externalFrames. chain IDs are declared inside match.bindings entries.",
  "manifest-schema/invalid-layout": "Remove manifest.layout, or set it exactly to fullscreen when Flap explicitly asks for a full-screen Vault body.",
  "manifest-schema/missing-field": "Add the required manifest field.",
  "manifest-schema/invalid-artifact-id": "Use artifactId format vaultui_<folder-name>_<26-char ULID>, for example vaultui_my-vault_01HZY7J4S9D0W5XJ8H2Q3K4M5N.",
  "manifest-schema/artifact-id-folder-name-mismatch": "Make the artifactId folder-name segment match the src/vaults/<folder-name> folder name.",
  "manifest-schema/duplicate-artifact-id": "Generate a new artifactId; each Vault package in the repo must have a unique artifactId.",
  "manifest-schema/invalid-name": "Set manifest.name to a human-readable string with at least two characters.",
  "manifest-schema/invalid-match": "Set manifest.match to an object with bindings (array of factory-scoped, single-Vault, or token-scoped binding entries).",
  "manifest-schema/disallowed-match-field": "Keep match limited to bindings. Use match.bindings[].tokenAddresses for test tokens or no-factory token-scoped bindings only; production CA restriction belongs in Workbench/registry configuration.",
  "manifest-binding/missing-bindings": "Add match.bindings as a non-empty array. Each entry needs chainId plus a non-zero factoryAddress, exactly one vaultAddresses entry, or one or more tokenAddresses.",
  "manifest-binding/missing-binding-target": "Add a non-zero factoryAddress, exactly one vaultAddresses entry, or one or more tokenAddresses to this binding.",
  "manifest-binding/duplicate-binding": "Remove duplicate match.bindings entries with the same runtime target. Merge any binding-scoped reference lists into one entry.",
  "manifest-binding/invalid-binding-entry": "Each match.bindings entry must be an object with chainId plus factoryAddress, vaultAddresses, or tokenAddresses.",
  "manifest-binding/disallowed-binding-field": "Binding entries may only contain chainId, factoryAddress, optional vaultAddresses, optional tokenAddresses, and optional externalContracts.",
  "manifest-binding/invalid-chain-id": "chainId must be a positive integer, for example 56 for BNB Chain or 97 for BNB Testnet.",
  "manifest-binding/invalid-address": "Use a full 20-byte EVM address matching 0x plus 40 hex characters.",
  "manifest-binding/placeholder-address": "Replace the template placeholder with a real deployment address. If the factory or Vault is not deployed yet, leave the package unpublished and do not use a placeholder binding.",
  "manifest-binding/zero-factory-address": "Omit factoryAddress for no-factory mode, or use the real deployed non-zero factory contract address for factory mode.",
  "manifest-binding/mixed-binding-target": "Use factoryAddress for a factory-scoped UI, or omit factoryAddress for Vault/token-scoped no-factory UI.",
  "manifest-binding/mixed-chain-scope": "Do not split one chain into factory and no-factory bindings. Put tokenAddresses on the factory binding, or remove the factory binding for no-factory mode.",
  "manifest-binding/duplicate-address": "Remove duplicate addresses from the binding-scoped reference list.",
  "manifest-binding/ca-policy-not-in-manifest": "Remove global CA policy fields. Use match.bindings[].tokenAddresses only for test tokens or no-factory token-scoped bindings; production CA restriction belongs in Workbench/registry caRestrictionMode configuration.",
  "manifest-binding/missing-test-token": "Declare at least one real deployed ERC20 test token ending in 7777 or 8888 in match.bindings[].tokenAddresses. Workbench vault:check does not accept local-only vault:e2e --token overrides as package proof. Keep the final real mainnet factoryAddress in its own production binding.",
  "manifest-binding/invalid-test-token-suffix": "Use a real deployed ERC20 test token address ending in 7777 or 8888. Non-7777/8888 tokenAddresses are not accepted as package proof.",
  "manifest-binding/invalid-erc20-token": "Use a real deployed ERC20 token contract on the declared chain. The checker must read bytecode plus standard ERC20 metadata before packaging.",
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
  "i18n-policy/hardcoded-visible-copy": "Move user-facing copy out of Component.tsx and into i18n.json, then render it with t(...) or i18n.t(...).",
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
  "manual-review/fullscreen-layout": "Fullscreen layout is an internal-review candidate. Keep host-owned token/header constraints in flap.sh and complete the extra fullscreen review before publish.",
  "manual-review/oracle-usage": `Do not add oracle config to manifest. Source packages may use only built-in runtime oracle ids before packaging; ${RUNTIME_ORACLE_REGISTRY_ENV} is for host/runtime preview diagnostics and does not make a custom oracle id packageable. Built-in oracle ids still require review.oracles[] endpoint and params review before publish.`,
  "manual-review/action-stage-gating": "Add context.host?.marketPhase and isActionAvailableForPhase(...) for internal-market vs DEX-listed button gating. Preview both marketPhase=internal-market and marketPhase=dex-listed.",
  "visual-policy/row-heavy-dashboard": "Use the scaffold default surface / NiePan-style compact template: one primary business card, a small metric strip, one visible primary action panel, and compact runtime facts lower in the card.",
  "risk-status/missing-host-risk-state": "Read the current contract risk level from context.host via readTaxVaultHostContext(context.host), render it prominently, and show a clear danger/warning notice when the host risk level is unavailable.",
  "risk-status/manual-low-risk-label": "Do not hardcode or unconditionally render Low risk / 低风险 labels. A low-risk label is allowed only when selected from the host-derived riskLevel === 1 branch.",
  "risk-status/not-prominent-placement": "Place the contract risk status within the first three Vault business rows, before any preview, hero, banner, showcase, media, chart, or large visual block.",
  "forbidden-api/direct-window-ethereum": "Use sdk.wallet and SDK contract methods instead of direct wallet/provider APIs. Do not call injected provider request, send, signing, or transaction methods.",
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
  "svg-policy/unsafe-inline-svg": "Prefer CSS/HTML card shapes or lucide-react icons. If inline SVG JSX is necessary, keep it to static pure graphic nodes, local fragment refs such as url(#gradient), and no script/event/image/use/foreignObject/external URL/style url()/@import.",
  "imports-and-dependencies/disallowed-relative-import": "Inline small helpers in Component.tsx or use @/src/sdk and @/src/ui. The only local relative import is ./VaultABI.",
  "imports-and-dependencies/deep-shared-runtime-import": "Import shared runtime helpers from the @/src/sdk or @/src/ui barrel. Do not import @/src/sdk/* or @/src/ui/* deep paths.",
  "imports-and-dependencies/forbidden-import": "Use Flap SDK/UI primitives instead of host wallet, app, or heavy UI dependencies.",
  "imports-and-dependencies/external-sdk-package": "Do not introduce additional SDK packages. Use only the shared @/src/sdk and @/src/ui runtime surfaces.",
  "imports-and-dependencies/require-call": "Use static ESM imports only. CommonJS require() is not allowed in Vault source.",
  "imports-and-dependencies/unreviewed-import": "Remove the dependency unless Flap explicitly approves it.",
  "imports-and-dependencies/dynamic-import": "Use static imports only.",
  "media/local-asset": "Move local media outside the Vault package. Vault folders must contain only the four allowed files.",
  "media-policy/remote-media": "Remove remote media URLs. Use host-provided media for token images, or IpfsImage/IpfsBackground with a static image CID for immutable Vault-specific images.",
  "media-policy/invalid-ipfs-image-cid": "Pass only a static image CID to IpfsImage/IpfsBackground. Do not pass metadata CIDs, URLs, ipfs:// values, or dynamic expressions.",
  "media-policy/ipfs-image-unavailable": "Use a static image CID that resolves through an allowed Flap IPFS gateway to an image/* response.",
  "security/hardcoded-address": "Use context.vaultAddress, context.tokenAddress, context.factoryAddress, or declare intentional fixed external contract targets under match.bindings[].externalContracts.",
  "navigation-policy/unapproved-external-navigation": "Do not navigate users to arbitrary external sites. Keep component-owned links on the current chain explorer only, and use host-reviewed allowlists for any exceptional metadata/oracle origin during review.",
  "contract-boundary/missing-contract-label": "Add a human-readable contract label such as vault, token, or nft so review and static checks can classify the call target.",
  "contract-boundary/disallowed-contract-label": "Limit contract labels to vault/token/nft-related targets. Do not interact with routers, bridges, aggregators, or unrelated app contracts from a Vault package.",
  "contract-boundary/disallowed-contract-address-source": "Keep contract targets on context.vaultAddress, context.tokenAddress, context.factoryAddress, token/NFT-related runtime addresses, or declared externalContracts only.",
  "contract-boundary/undeclared-contract-address": "Use runtime context addresses for Vault/token/factory targets. If this is an intentional fixed external contract, declare it under match.bindings[].externalContracts.",
  "contract-boundary/operator-method-exposed": "Do not expose operator/admin configuration methods from Component.tsx. Keep public UI actions on Vault user-facing methods such as resolve/claim/deposit flows, and leave config changes to reviewed operator tooling.",
  "performance/refetch-too-fast": "Use a refetch interval of at least 5000ms unless Flap approves a faster polling path.",
  "contract-abi/number-bigint": "Keep token amounts as bigint/Decimal and avoid Number(...) for transaction math.",
  "contract-abi/human-readable-requires-parse-abi": "Wrap human-readable ABI string arrays with parseAbi([...]) from viem, or use full object ABI fragments. Do not export raw function/event signature strings as the runtime ABI.",
  "contract-abi/multiple-outputs-require-tuple-read": "Read ABI methods with multiple return values as tuple/array results, then map indexes into object-shaped UI state. Do not type sdk.readContract for multi-output methods as an object.",
  "contract-abi/standard-erc20-in-vault-abi": "Use erc20Abi or standardErc20Abi from @/src/sdk for standard ERC20 methods. Add token ABI fragments to VaultABI.ts only for custom token mechanics.",
  "ui/invalid-tx-button-state": `Use a valid TxButtonState: ${TX_BUTTON_STATE_LIST}. Replace legacy pending with writing or confirming, and error with failed.`,
};

function issue(severity, ruleId, message, extra = {}) {
  return { severity, ruleId, message, fixHint: FIX_HINTS[ruleId], ...extra };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sharedRuntimeImportRoot(spec) {
  for (const allowed of SHARED_RUNTIME_IMPORTS) {
    if (spec.startsWith(`${allowed}/`)) return allowed;
  }
  return null;
}

function isAllowedPackageImport(spec) {
  if (SHARED_RUNTIME_IMPORTS.has(spec)) return true;
  if (sharedRuntimeImportRoot(spec)) return false;
  return ALLOWED_IMPORTS.some((allowed) => spec === allowed || spec.startsWith(`${allowed}/`));
}

function isRuntimeOracleProvision(value) {
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !Object.prototype.hasOwnProperty.call(value, "headers") &&
      typeof value.endpoint === "string" &&
      value.endpoint.trim(),
  );
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function normalizeStringRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string")
      .map(([key, item]) => [key.trim(), item.trim()])
      .filter(([key]) => key.length > 0),
  );
}

function normalizeRuntimeOracleProvisionDetails(value) {
  if (typeof value === "string") {
    const endpoint = value.trim();
    return endpoint
      ? {
          source: "runtime-registry",
          endpoints: [endpoint],
          allowedParams: [],
          fixedParams: {},
        }
      : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const endpoint = typeof value.endpoint === "string" ? value.endpoint.trim() : "";
  if (!endpoint) return null;
  return {
    source: "runtime-registry",
    endpoints: [endpoint],
    allowedParams: normalizeStringArray(value.allowedParams),
    fixedParams: normalizeStringRecord(value.fixedParams),
  };
}

function readRuntimeOracleRegistryDetails(raw = process.env[RUNTIME_ORACLE_REGISTRY_ENV]) {
  if (!raw?.trim()) return new Map();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    return new Map(
      Object.entries(parsed)
        .filter(([oracleId, provision]) => ORACLE_ID_RE.test(oracleId) && isRuntimeOracleProvision(provision))
        .map(([oracleId, provision]) => [oracleId, normalizeRuntimeOracleProvisionDetails(provision)])
        .filter((entry) => Boolean(entry[1])),
    );
  } catch {
    return new Map();
  }
}

function getRuntimeOracleProvisionDetails() {
  return new Map([...BUILTIN_RUNTIME_ORACLE_PROVISIONS, ...readRuntimeOracleRegistryDetails()]);
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

function queryParamsForUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) return {};
  return Object.fromEntries(parsed.searchParams.entries());
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

function splitTopLevelArgs(argsText) {
  const args = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < argsText.length; index += 1) {
    const char = argsText[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "{" || char === "[") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "}" || char === "]") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === "," && depth === 0) {
      args.push(argsText.slice(start, index).trim());
      start = index + 1;
    }
  }
  const last = argsText.slice(start).trim();
  if (last) args.push(last);
  return args;
}

function staticObjectStringParams(expression) {
  const trimmed = expression?.trim();
  if (!trimmed?.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  const body = trimmed.slice(1, -1);
  const params = {};
  const propertyRegex = /(?:^|,)\s*(?:(["'`])([^"'`]+)\1|([A-Za-z_$][\w$]*))\s*:\s*(["'`])((?:\\.|(?!\4)[\s\S])*?)\4/g;
  for (const match of body.matchAll(propertyRegex)) {
    const key = match[2] || match[3];
    if (!key) continue;
    params[key] = match[5];
  }
  return Object.keys(params).length ? params : undefined;
}

function collectReadOracleUsages(content, file) {
  const usages = [];
  const oracleCallRegex = /\breadOracle(?:<[^>]+>)?\s*\(/g;
  for (const match of content.matchAll(oracleCallRegex)) {
    const openParenIndex = content.indexOf("(", match.index ?? 0);
    if (openParenIndex < 0) continue;
    const closeParenIndex = findMatchingDelimiter(content, openParenIndex, "(", ")");
    if (closeParenIndex < 0) continue;
    const args = splitTopLevelArgs(content.slice(openParenIndex + 1, closeParenIndex));
    const oracleId = staticStringLiteral(stripExpressionDecorators(args[0] ?? ""));
    if (!oracleId) continue;
    const paramsExpression = args[1]?.trim();
    usages.push({
      oracleId,
      file,
      line: lineForIndex(content, match.index ?? -1),
      params: staticObjectStringParams(paramsExpression),
      paramsExpression,
    });
  }
  return usages;
}

function hasUnparsedHumanReadableAbi(content) {
  if (/\bparseAbi\s*\(/.test(content)) return false;
  return /["'`]\s*(?:function|event|error)\s+[A-Za-z_$][\w$]*\s*\(|["'`]\s*(?:constructor|fallback|receive)\s*\(/.test(content);
}

function hasRiskStatusIntegration(content) {
  const usesHostAccessor = /\breadTaxVaultHostContext\s*\(\s*(?:context|sdk\.context)\.host\s*\)/.test(content);
  const derivesHostRiskLevel =
    /\briskLevel\b\s*=\s*[\s\S]{0,260}(?:vaultInfo\?\.\s*riskLevel|taxInfo\?\.\s*vaultInfo\?\.\s*riskLevel)/.test(content);
  const displaysRiskStatus = RISK_STATUS_DISPLAY_RE.test(content);
  const displaysMissingRiskWarning =
    /\briskLevel\b\s*(?:===|==)\s*(?:null|undefined)[\s\S]{0,400}<Alert\b/.test(content) ||
    /\briskLevel\b\s*(?:!==|!=)\s*(?:null|undefined)[\s\S]{0,400}[:{(]\s*<Alert\b/.test(content) ||
    /[{(]\s*!\s*riskLevel\b[\s\S]{0,400}<Alert\b/.test(content) ||
    /<Alert\b[\s\S]{0,400}\briskLevel\b[\s\S]{0,100}(?:null|undefined)/.test(content);

  return usesHostAccessor && derivesHostRiskLevel && displaysRiskStatus && displaysMissingRiskWarning;
}

function lastReturnIndexBefore(content, index) {
  let lastIndex = -1;
  for (const match of content.slice(0, index).matchAll(/\breturn\s*(?:\(|<)/g)) {
    lastIndex = match.index ?? lastIndex;
  }
  return lastIndex;
}

function hasProminentRiskStatusPlacement(content) {
  const displayRegex = new RegExp(RISK_STATUS_DISPLAY_RE.source, "g");
  for (const match of content.matchAll(displayRegex)) {
    const index = match.index ?? 0;
    const returnIndex = lastReturnIndexBefore(content, index);
    if (returnIndex < 0 || index - returnIndex > RISK_STATUS_TOP_OFFSET_LIMIT) continue;

    const leadingSegment = content.slice(returnIndex, index);
    if (RISK_STATUS_PRECEDING_LARGE_VISUAL_RE.test(leadingSegment)) continue;

    const precedingBusinessRows = [...leadingSegment.matchAll(RISK_STATUS_PRECEDING_BUSINESS_ROW_RE)].length;
    if (precedingBusinessRows <= RISK_STATUS_MAX_BUSINESS_ROWS_BEFORE) return true;
  }
  return false;
}

function countMatches(content, regex) {
  return [...content.matchAll(regex)].length;
}

function collectRowHeavyDashboardIssues(content, rel, folderName) {
  if (VISUAL_REFERENCE_EXAMPLE_FOLDERS.has(folderName)) return [];

  const cardCount = countMatches(content, new RegExp(VISUAL_CARD_RE.source, "g"));
  const tileCount = countMatches(content, new RegExp(VISUAL_BUSINESS_TILE_RE.source, "g"));
  const firstAction = content.search(VISUAL_ACTION_RE);
  const tilesBeforeAction = firstAction >= 0 ? countMatches(content.slice(0, firstAction), new RegExp(VISUAL_BUSINESS_TILE_RE.source, "g")) : tileCount;
  const looksRowHeavy = (cardCount >= 3 && tileCount >= 6) || (tileCount >= 10 && tilesBeforeAction >= 8) || (cardCount >= 2 && tilesBeforeAction >= 6);

  if (!looksRowHeavy) return [];
  return [
    issue(
      BLOCKING,
      "visual-policy/row-heavy-dashboard",
      "Component has a row-heavy dashboard shape. New Vault UIs must use the scaffold default surface / NiePan-style compact template instead of stacked sample cards.",
      { file: rel, cardCount, tileCount, tilesBeforeAction },
    ),
  ];
}

function hasManualLowRiskCopy(value) {
  if (typeof value !== "string") return false;
  return /\blow\s*risk\b/i.test(value) || value.replaceAll("中低风险", "").includes("低风险");
}

function collectLowRiskI18nKeys(i18n, manifestLocales) {
  const keys = new Set();
  for (const locale of manifestLocales) {
    const dictionary = i18n?.[locale];
    if (!dictionary || typeof dictionary !== "object" || Array.isArray(dictionary)) continue;
    for (const [key, value] of Object.entries(dictionary)) {
      if (hasManualLowRiskCopy(value)) keys.add(key);
    }
  }
  return keys;
}

function isRiskLevelOneGuarded(content, index) {
  const before = content.slice(Math.max(0, index - 520), index);
  const after = content.slice(index, Math.min(content.length, index + 260));
  const around = `${before}${after}`;
  if (/\briskLevel\b\s*={2,3}\s*1\b|\b1\b\s*={2,3}\s*\briskLevel\b/.test(around)) return true;
  return /\bswitch\s*\(\s*riskLevel\s*\)/.test(before) && /\bcase\s+1\s*:/.test(around);
}

function collectManualLowRiskLabelIssues(content, i18n, manifestLocales, rel) {
  const issues = [];
  const stringLiteralRegex = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  for (const match of content.matchAll(stringLiteralRegex)) {
    if (!hasManualLowRiskCopy(match[2])) continue;
    const index = match.index ?? 0;
    if (isRiskLevelOneGuarded(content, index)) continue;
    issues.push(
      issue(
        BLOCKING,
        "risk-status/manual-low-risk-label",
        "Component contains Low risk / 低风险 copy that is not selected from the host-derived riskLevel === 1 branch.",
        { file: rel, line: lineForIndex(content, index) },
      ),
    );
  }

  const lowRiskI18nKeys = collectLowRiskI18nKeys(i18n, manifestLocales);
  if (!lowRiskI18nKeys.size) return issues;
  const i18nCallRegex = /(?:^|[^\w.])(?:t|i18n\.t)\(\s*["'`]([^"'`]+)["'`]/g;
  for (const match of content.matchAll(i18nCallRegex)) {
    const key = match[1];
    if (!lowRiskI18nKeys.has(key)) continue;
    const index = match.index ?? 0;
    if (isRiskLevelOneGuarded(content, index)) continue;
    issues.push(
      issue(
        BLOCKING,
        "risk-status/manual-low-risk-label",
        `Component renders low-risk i18n key ${key} without deriving it from host riskLevel === 1.`,
        { file: rel, line: lineForIndex(content, index), key },
      ),
    );
  }
  return issues;
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

function isAllowedBrowserGlobalMember(globalName, memberName) {
  return ALLOWED_BROWSER_GLOBAL_MEMBERS.get(globalName)?.has(memberName) ?? false;
}

function collectBrowserGlobalMemberIssues(content, file) {
  const issues = [];
  const memberRegex = /\b(window|globalThis|global|self|navigator|document)\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/g;
  for (const match of content.matchAll(memberRegex)) {
    const globalName = match[1];
    const memberName = match[2];
    if (isAllowedBrowserGlobalMember(globalName, memberName)) continue;
    issues.push(
      issue(
        BLOCKING,
        "forbidden-api/browser-global-escape",
        `${globalName}.${memberName} access is not allowed inside Vault components. Use Flap SDK/runtime APIs instead.`,
        { file, line: lineForIndex(content, match.index ?? -1) },
      ),
    );
  }
  return issues;
}

function isExplorerBaseUrlExpression(expressionText) {
  const compact = expressionText.replace(/\s+/g, "");
  return (
    /(?:^|[^.\w$])(?:context|sdk\.context)\.explorerBaseUrl\b/.test(compact) &&
    /\/(?:address|tx)\//.test(expressionText)
  );
}

function hasNoOpenerFeature(callText) {
  return /["'`][^"'`]*(?:noopener|noreferrer)[^"'`]*["'`]/i.test(callText);
}

function isApprovedWindowOpenTarget(expressionText) {
  const expression = stripExpressionDecorators(expressionText);
  const staticTarget = staticStringLiteral(expression);
  if (staticTarget !== null) return isApprovedNavigationUrl(staticTarget);
  return isExplorerBaseUrlExpression(expression);
}

function collectWindowOpenIssues(content, file) {
  const issues = [];
  const openRegex = /\bwindow\s*(?:\?\.|\.)\s*open\s*\(/g;
  for (const match of content.matchAll(openRegex)) {
    const openParenIndex = content.indexOf("(", match.index ?? 0);
    if (openParenIndex < 0) continue;
    const callEnd = findMatchingDelimiter(content, openParenIndex, "(", ")");
    if (callEnd < 0) continue;
    const targetStart = skipWhitespace(content, openParenIndex + 1);
    const targetEnd = findExpressionEnd(content, targetStart);
    const targetExpression = content.slice(targetStart, targetEnd).trim();
    const callText = content.slice(openParenIndex, callEnd + 1);
    if (isApprovedWindowOpenTarget(targetExpression) && hasNoOpenerFeature(callText)) continue;
    issues.push(
      issue(
        BLOCKING,
        "forbidden-api/browser-navigation",
        "window.open is allowed only for current-chain explorer address/tx URLs and must include noopener or noreferrer.",
        { file, line: lineForIndex(content, match.index ?? -1) },
      ),
    );
  }
  return issues;
}

function jsxTagNameText(tagName) {
  if (ts.isIdentifier(tagName)) return tagName.text;
  if (ts.isJsxNamespacedName(tagName)) return `${tagName.namespace.text}:${tagName.name.text}`;
  return null;
}

function jsxAttributeNameText(attributeName) {
  if (ts.isIdentifier(attributeName)) return attributeName.text;
  if (ts.isJsxNamespacedName(attributeName)) return `${attributeName.namespace.text}:${attributeName.name.text}`;
  return null;
}

function jsxAttributeStaticStringValue(attribute) {
  const initializer = attribute.initializer;
  if (!initializer) return "";
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return null;
  return tsStaticStringValue(initializer.expression);
}

function isLocalSvgRef(value) {
  return INLINE_SVG_LOCAL_REF_RE.test(value.trim());
}

function hasUnsafeSvgUrlFunction(value) {
  if (!/\burl\s*\(/i.test(value)) return false;
  const urlRegex = /\burl\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
  let found = false;
  for (const match of value.matchAll(urlRegex)) {
    found = true;
    const target = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!isLocalSvgRef(target)) return true;
  }
  return !found;
}

function hasUnsafeSvgLiteral(value, { allowLocalUrlRefs = true, blockAnyCssUrl = false } = {}) {
  if (!value) return false;
  if (/@import/i.test(value)) return true;
  if (/(?:https?:|wss?:|ipfs:|ar:|data:|javascript:|vbscript:)/i.test(value)) return true;
  if (/(?:^|[\s"'(])\/\//.test(value)) return true;
  if (/\burl\s*\(/i.test(value)) {
    if (blockAnyCssUrl) return true;
    return !allowLocalUrlRefs || hasUnsafeSvgUrlFunction(value);
  }
  return false;
}

function collectInlineSvgAttributeIssues(attributes, tagName, content, sourceFile, file) {
  const issues = [];
  for (const property of attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      issues.push(
        issue(
          BLOCKING,
          "svg-policy/unsafe-inline-svg",
          "Inline SVG JSX cannot use spread attributes because they can smuggle event handlers, hrefs, or external resources.",
          { file, line: lineForIndex(content, property.getStart(sourceFile)) },
        ),
      );
      continue;
    }

    const attributeName = jsxAttributeNameText(property.name);
    if (!attributeName) {
      issues.push(
        issue(
          BLOCKING,
          "svg-policy/unsafe-inline-svg",
          "Inline SVG JSX uses an unsupported attribute name. Keep inline SVG attributes explicit and static.",
          { file, line: lineForIndex(content, property.getStart(sourceFile)) },
        ),
      );
      continue;
    }

    const normalizedName = attributeName.toLowerCase();
    if (normalizedName.startsWith("on")) {
      issues.push(
        issue(
          BLOCKING,
          "svg-policy/unsafe-inline-svg",
          `Inline SVG event attribute ${attributeName} is not allowed.`,
          { file, line: lineForIndex(content, property.getStart(sourceFile)), tag: tagName, attribute: attributeName },
        ),
      );
    }

    if (normalizedName === "dangerouslysetinnerhtml") {
      issues.push(
        issue(
          BLOCKING,
          "svg-policy/unsafe-inline-svg",
          "Inline SVG cannot use dangerouslySetInnerHTML.",
          { file, line: lineForIndex(content, property.getStart(sourceFile)), tag: tagName, attribute: attributeName },
        ),
      );
    }

    if (normalizedName === "style") {
      const styleText = property.initializer?.getText(sourceFile) ?? "";
      if (hasUnsafeSvgLiteral(styleText, { blockAnyCssUrl: true })) {
        issues.push(
          issue(
            BLOCKING,
            "svg-policy/unsafe-inline-svg",
            "Inline SVG style attributes cannot contain url(...) or @import.",
            { file, line: lineForIndex(content, property.getStart(sourceFile)), tag: tagName, attribute: attributeName },
          ),
        );
      }
    }

    if (normalizedName === "href" || normalizedName === "xlinkhref" || normalizedName === "xlink:href" || normalizedName === "src") {
      const staticValue = jsxAttributeStaticStringValue(property);
      if (!staticValue || !isLocalSvgRef(staticValue)) {
        issues.push(
          issue(
            BLOCKING,
            "svg-policy/unsafe-inline-svg",
            `Inline SVG attribute ${attributeName} may only reference a local fragment such as #gradient.`,
            { file, line: lineForIndex(content, property.getStart(sourceFile)), tag: tagName, attribute: attributeName },
          ),
        );
      }
    }

    const attributeText = property.initializer?.getText(sourceFile) ?? "";
    if (hasUnsafeSvgLiteral(attributeText, { allowLocalUrlRefs: true })) {
      issues.push(
        issue(
          BLOCKING,
          "svg-policy/unsafe-inline-svg",
          `Inline SVG attribute ${attributeName} contains an external URL, unsafe scheme, @import, or non-local url(...).`,
          { file, line: lineForIndex(content, property.getStart(sourceFile)), tag: tagName, attribute: attributeName },
        ),
      );
    }
  }
  return issues;
}

function collectInlineSvgIssues(content, file) {
  const issues = [];
  const sourceFile = createTsSourceFile(file, content);

  function checkSvgElement(tagName, attributes, node) {
    if (!tagName || !ALLOWED_INLINE_SVG_TAGS.has(tagName)) {
      issues.push(
        issue(
          BLOCKING,
          "svg-policy/unsafe-inline-svg",
          `Inline SVG JSX may contain only static pure graphic nodes. Tag ${tagName ?? node.getText(sourceFile)} is not allowed.`,
          { file, line: lineForIndex(content, node.getStart(sourceFile)), tag: tagName },
        ),
      );
      return;
    }
    issues.push(...collectInlineSvgAttributeIssues(attributes, tagName, content, sourceFile, file));
  }

  function visit(node, insideSvg = false) {
    if (ts.isJsxElement(node)) {
      const tagName = jsxTagNameText(node.openingElement.tagName);
      const nextInsideSvg = insideSvg || tagName === "svg";
      if (nextInsideSvg) {
        checkSvgElement(tagName, node.openingElement.attributes, node.openingElement);
      }
      for (const child of node.children) visit(child, nextInsideSvg);
      return;
    }

    if (ts.isJsxSelfClosingElement(node)) {
      const tagName = jsxTagNameText(node.tagName);
      const nextInsideSvg = insideSvg || tagName === "svg";
      if (nextInsideSvg) {
        checkSvgElement(tagName, node.attributes, node);
      }
      return;
    }

    ts.forEachChild(node, (child) => visit(child, insideSvg));
  }

  visit(sourceFile);
  return issues;
}

function hardcodedCopyExcerpt(value) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= 80) return compact;
  return `${compact.slice(0, 77)}...`;
}

function collectHardcodedVisibleCopyIssues(content, file) {
  const issues = [];
  const scanContent = stripCommentsForScanning(content);
  const stringLiteralRegex = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  for (const match of scanContent.matchAll(stringLiteralRegex)) {
    const value = match[2] ?? "";
    if (!CJK_VISIBLE_COPY_RE.test(value)) continue;
    issues.push(
      issue(
        BLOCKING,
        "i18n-policy/hardcoded-visible-copy",
        `Component.tsx contains hardcoded visible copy "${hardcodedCopyExcerpt(value)}". Keep all user-facing Vault component copy in i18n.json and render it through i18n.t(...).`,
        { file, line: lineForIndex(scanContent, match.index ?? -1), text: hardcodedCopyExcerpt(value) },
      ),
    );
  }
  return issues;
}

function isAllowlistedExternalUrl(url, declaredUrls, declaredFrames = new Map()) {
  return isDeclaredUrl(url, declaredUrls) || isDeclaredExternalFrameUrl(url, declaredFrames) || matchesAllowlistPrefix(url, DEFAULT_ALLOWED_URL_PREFIXES);
}

function isAllowedIpfsImageGatewayUrl(url) {
  const parsed = parseUrl(url);
  return (
    parsed?.protocol === "https:" &&
    !parsed.username &&
    !parsed.password &&
    !parsed.search &&
    !parsed.hash &&
    ALLOWED_IPFS_IMAGE_GATEWAY_ORIGINS.has(parsed.origin) &&
    /^\/ipfs\/[^/]+(?:\/[^?#]*)?$/.test(parsed.pathname)
  );
}

function collectStaticImgSrcUrls(content, file) {
  const urls = [];
  const tagRegex = /<img\b[^>]*>/gi;
  for (const tagMatch of content.matchAll(tagRegex)) {
    const tag = tagMatch[0];
    const tagStart = tagMatch.index ?? 0;
    const srcRegex = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(["'`])((?:\\.|(?!\3)[\s\S])*?)\3\s*\})/g;
    for (const srcMatch of tag.matchAll(srcRegex)) {
      const url = srcMatch[1] ?? srcMatch[2] ?? srcMatch[4];
      if (!url) continue;
      urls.push({
        url: sanitizeUrlLiteral(url),
        file,
        line: lineForIndex(content, tagStart + (srcMatch.index ?? 0)),
      });
    }
  }
  return urls;
}

function staticJsxStringAttribute(tag, attributeName) {
  const attrRegex = new RegExp(`\\b${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*(["'\`])((?:\\\\.|(?!\\3)[\\s\\S])*?)\\3\\s*\\})`);
  const match = attrRegex.exec(tag);
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[4] ?? null;
}

function collectIpfsImageCidUsages(content, file) {
  const usages = [];
  const tagRegex = /<(IpfsImage|IpfsBackground)\b[^>]*>/g;
  for (const tagMatch of content.matchAll(tagRegex)) {
    const tag = tagMatch[0];
    const index = tagMatch.index ?? 0;
    const cid = staticJsxStringAttribute(tag, "cid");
    usages.push({
      component: tagMatch[1],
      cid: cid ? cid.trim() : cid,
      file,
      line: lineForIndex(content, index),
    });
  }
  return usages;
}

function isValidIpfsImageCid(cid) {
  return typeof cid === "string" && IPFS_IMAGE_CID_RE.test(cid);
}

function ipfsImageUrlsForCid(cid) {
  return [...ALLOWED_IPFS_IMAGE_GATEWAY_ORIGINS].map((origin) => `${origin}/ipfs/${cid}`);
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

function createTsSourceFile(file, content) {
  const scriptKind = file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind);
}

function unwrapTsExpression(node) {
  if (!node) return node;
  let current = node;
  while (current) {
    if (
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isTypeAssertionExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    return current;
  }
  return node;
}

function tsPropertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function tsStaticStringValue(expression) {
  if (!expression) return null;
  const unwrapped = unwrapTsExpression(expression);
  if (ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)) return unwrapped.text;
  return null;
}

function tsObjectPropertyInitializer(objectLiteral, propertyName) {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (tsPropertyNameText(property.name) === propertyName) return property.initializer;
  }
  return null;
}

function tsArrayLiteralFromExpression(expression) {
  if (!expression) return null;
  const unwrapped = unwrapTsExpression(expression);
  return ts.isArrayLiteralExpression(unwrapped) ? unwrapped : null;
}

function tsIdentifierText(expression) {
  if (!expression) return null;
  const unwrapped = unwrapTsExpression(expression);
  return ts.isIdentifier(unwrapped) ? unwrapped.text : null;
}

function splitTopLevelCommaSeparated(value) {
  const parts = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    const char = value[cursor];
    if (char === "\"" || char === "'" || char === "`") {
      cursor = skipQuoted(value, cursor) - 1;
      continue;
    }
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    if (char === "," && parenDepth === 0 && bracketDepth === 0) {
      const part = value.slice(start, cursor).trim();
      if (part) parts.push(part);
      start = cursor + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function parseHumanReadableFunctionOutputs(signature) {
  const nameMatch = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/u.exec(signature);
  if (!nameMatch) return null;
  const returnsMatch = /\breturns\s*\(/u.exec(signature);
  if (!returnsMatch) return { functionName: nameMatch[1], outputCount: 0 };
  const openIndex = returnsMatch.index + returnsMatch[0].length - 1;
  const closeIndex = findMatchingDelimiter(signature, openIndex, "(", ")");
  if (closeIndex < 0) return null;
  const outputText = signature.slice(openIndex + 1, closeIndex).trim();
  return {
    functionName: nameMatch[1],
    outputCount: outputText ? splitTopLevelCommaSeparated(outputText).length : 0,
  };
}

function objectAbiFunctionOutputCount(objectLiteral) {
  const typeValue = tsStaticStringValue(tsObjectPropertyInitializer(objectLiteral, "type") ?? objectLiteral);
  const functionName = tsStaticStringValue(tsObjectPropertyInitializer(objectLiteral, "name") ?? objectLiteral);
  if (typeValue !== "function" || !functionName) return null;
  const outputs = tsArrayLiteralFromExpression(tsObjectPropertyInitializer(objectLiteral, "outputs") ?? objectLiteral);
  return { functionName, outputCount: outputs ? outputs.elements.length : 0 };
}

function collectAbiFunctionOutputCounts(vaultDir) {
  const abiPath = path.join(vaultDir, "VaultABI.ts");
  const byAbiVariable = new Map();
  if (!fs.existsSync(abiPath)) return byAbiVariable;
  const content = fs.readFileSync(abiPath, "utf8");
  const source = createTsSourceFile("VaultABI.ts", content);

  function record(abiName, functionName, outputCount) {
    if (!abiName || !functionName || typeof outputCount !== "number") return;
    const byFunction = byAbiVariable.get(abiName) ?? new Map();
    byFunction.set(functionName, outputCount);
    byAbiVariable.set(abiName, byFunction);
  }

  function abiArrayFromInitializer(initializer) {
    const unwrapped = unwrapTsExpression(initializer);
    if (ts.isArrayLiteralExpression(unwrapped)) return unwrapped;
    if (ts.isCallExpression(unwrapped) && tsIdentifierText(unwrapped.expression) === "parseAbi") {
      return tsArrayLiteralFromExpression(unwrapped.arguments[0]);
    }
    return null;
  }

  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const abiArray = abiArrayFromInitializer(node.initializer);
      if (abiArray) {
        for (const element of abiArray.elements) {
          const entry = unwrapTsExpression(element);
          if (ts.isStringLiteral(entry) || ts.isNoSubstitutionTemplateLiteral(entry)) {
            const parsed = parseHumanReadableFunctionOutputs(entry.text);
            if (parsed) record(node.name.text, parsed.functionName, parsed.outputCount);
          } else if (ts.isObjectLiteralExpression(entry)) {
            const parsed = objectAbiFunctionOutputCount(entry);
            if (parsed) record(node.name.text, parsed.functionName, parsed.outputCount);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return byAbiVariable;
}

function typeReferenceNameText(typeNode) {
  if (!typeNode) return null;
  if (!ts.isTypeReferenceNode(typeNode)) return null;
  const typeName = typeNode.typeName;
  if (ts.isIdentifier(typeName)) return typeName.text;
  return typeName.getText();
}

function unwrapTsTypeNode(typeNode) {
  let current = typeNode;
  while (current) {
    if (ts.isParenthesizedTypeNode(current)) {
      current = current.type;
      continue;
    }
    return current;
  }
  return typeNode;
}

function isObjectResultTypeNode(typeNode, objectTypeNames) {
  const current = unwrapTsTypeNode(typeNode);
  if (!current) return false;
  if (ts.isTypeLiteralNode(current)) return true;
  if (ts.isTupleTypeNode(current) || ts.isArrayTypeNode(current)) return false;
  if (ts.isTypeOperatorNode(current)) return isObjectResultTypeNode(current.type, objectTypeNames);
  if (ts.isUnionTypeNode(current) || ts.isIntersectionTypeNode(current)) {
    return current.types.some((item) => isObjectResultTypeNode(item, objectTypeNames));
  }
  if (ts.isTypeReferenceNode(current)) {
    const name = typeReferenceNameText(current);
    if (name && objectTypeNames.has(name)) return true;
    if (name === "Record") return true;
    if (["Readonly", "Partial", "Required"].includes(name || "")) {
      return Boolean(current.typeArguments?.some((item) => isObjectResultTypeNode(item, objectTypeNames)));
    }
  }
  return false;
}

function collectObjectResultTypeNames(source) {
  const objectTypeNames = new Set();
  const aliases = [];

  function visit(node) {
    if (ts.isInterfaceDeclaration(node)) {
      objectTypeNames.add(node.name.text);
    } else if (ts.isTypeAliasDeclaration(node)) {
      aliases.push(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);

  let changed = true;
  while (changed) {
    changed = false;
    for (const alias of aliases) {
      if (objectTypeNames.has(alias.name.text)) continue;
      if (isObjectResultTypeNode(alias.type, objectTypeNames)) {
        objectTypeNames.add(alias.name.text);
        changed = true;
      }
    }
  }

  return objectTypeNames;
}

function callExpressionMethodName(expression) {
  const unwrapped = unwrapTsExpression(expression);
  if (ts.isPropertyAccessExpression(unwrapped)) return unwrapped.name.text;
  if (ts.isIdentifier(unwrapped)) return unwrapped.text;
  return null;
}

function collectMultipleOutputObjectReadIssues(content, file, abiFunctionOutputCounts) {
  const issues = [];
  if (!abiFunctionOutputCounts.size) return issues;
  const source = createTsSourceFile(file, content);
  const objectTypeNames = collectObjectResultTypeNames(source);

  function visit(node) {
    if (ts.isCallExpression(node) && callExpressionMethodName(node.expression) === "readContract" && node.typeArguments?.length) {
      const resultType = node.typeArguments[0];
      if (!isObjectResultTypeNode(resultType, objectTypeNames)) {
        ts.forEachChild(node, visit);
        return;
      }
      const request = unwrapTsExpression(node.arguments[0]);
      if (!request || !ts.isObjectLiteralExpression(request)) {
        ts.forEachChild(node, visit);
        return;
      }
      const abiName = tsIdentifierText(tsObjectPropertyInitializer(request, "abi") ?? request);
      const functionName = tsStaticStringValue(tsObjectPropertyInitializer(request, "functionName") ?? request);
      const outputCount = abiName && functionName ? abiFunctionOutputCounts.get(abiName)?.get(functionName) : undefined;
      if (typeof outputCount === "number" && outputCount > 1) {
        issues.push(
          issue(
            BLOCKING,
            "contract-abi/multiple-outputs-require-tuple-read",
            `sdk.readContract<${resultType.getText(source)}> reads ${functionName} from ${abiName}, but that ABI method returns ${outputCount} values. viem returns a tuple array for multiple outputs; map tuple indexes into object state after the read.`,
            { file, line: lineForIndex(content, node.getStart(source)) },
          ),
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return issues;
}

function collectTxButtonStateIssues(content, file) {
  const issues = [];
  const source = createTsSourceFile(file, content);
  const setters = new Set();

  function report(value, node) {
    if (!value || TX_BUTTON_STATES.has(value)) return;
    issues.push(
      issue(
        BLOCKING,
        "ui/invalid-tx-button-state",
        `TxButtonState "${value}" is not supported. Use one of: ${TX_BUTTON_STATE_LIST}.`,
        { file, line: lineForIndex(content, node.getStart(source)), state: value },
      ),
    );
  }

  function jsxStateValue(initializer) {
    if (!initializer) return null;
    if (ts.isStringLiteral(initializer)) return initializer.text;
    if (ts.isJsxExpression(initializer)) return tsStaticStringValue(initializer.expression);
    return null;
  }

  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer) {
      const initializer = unwrapTsExpression(node.initializer);
      if (ts.isCallExpression(initializer) && callExpressionMethodName(initializer.expression) === "useState" && typeReferenceNameText(initializer.typeArguments?.[0]) === "TxButtonState") {
        report(tsStaticStringValue(initializer.arguments[0]), initializer);
        const setter = node.name.elements[1]?.name;
        if (setter && ts.isIdentifier(setter)) setters.add(setter.text);
      }
    }

    if (ts.isCallExpression(node)) {
      const expression = unwrapTsExpression(node.expression);
      if (ts.isIdentifier(expression) && setters.has(expression.text)) {
        report(tsStaticStringValue(node.arguments[0]), node);
      }
    }

    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && jsxTagNameText(node.tagName)?.endsWith("TxButton")) {
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name) && attribute.name.text === "state") {
          report(jsxStateValue(attribute.initializer), attribute);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return issues;
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
    const functionNameProperty = extractObjectPropertyExpression(call.objectText, "functionName");
    const functionName = functionNameProperty ? parseStaticStringLiteral(stripExpressionDecorators(functionNameProperty.text)) : null;
    const resolvedAddress = addressProperty ? resolveAddressExpressionText(addressProperty.text, addressConstants) : null;
    const isDeclaredExternalAddress = Boolean(resolvedAddress && contractPolicy.external.has(resolvedAddress));

    if (functionName && FORBIDDEN_UI_OPERATOR_FUNCTION_NAMES.has(functionName)) {
      issues.push(
        issue(
          BLOCKING,
          "contract-boundary/operator-method-exposed",
          `${call.methodName} exposes operator/admin method ${functionName}. Custom Vault UI must not expose config methods such as setConfig, setSwapPath, or setSplit.`,
          {
            file,
            line: lineForIndex(content, call.objectStart + functionNameProperty.index),
            functionName,
          },
        ),
      );
    }

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
      issues.push(issue(BLOCKING, "media/local-asset", `Local media asset ${item.name} is not part of the Vault package. Keep media controlled by Flap Artifact Workbench/runtime policy.`, { file: rel }));
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

function placeholderAddressLabel(value) {
  const normalized = normalizeAddress(value);
  return normalized ? RESERVED_PLACEHOLDER_ADDRESSES.get(normalized) : undefined;
}

function placeholderAddressIssue(field, value) {
  const label = placeholderAddressLabel(value) || "template placeholder";
  return issue(
    BLOCKING,
    "manifest-binding/placeholder-address",
    `${field} uses reserved ${label} ${value}. Replace it with the real reviewed deployment address before packaging or Workbench publish.`,
    { field, address: value },
  );
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
      if (placeholderAddressLabel(contractEntry.address)) {
        issues.push(placeholderAddressIssue(`${entryField}.address`, contractEntry.address));
      } else if (firstField) {
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
          `manifest.json field ${key} is not developer-declared. Keep manifest limited to artifactId, name, match, i18n, optional layout, endpoints, and externalFrames.`,
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
  if (manifest.layout !== undefined) {
    if (manifest.layout !== FULLSCREEN_LAYOUT) {
      issues.push(
        issue(
          BLOCKING,
          "manifest-schema/invalid-layout",
          'manifest.layout may only be "fullscreen" when Flap explicitly asks for a full-screen Vault body. Omit it for the standard layout.',
          { field: "layout", layout: manifest.layout },
        ),
      );
    } else {
      issues.push(
        issue(
          WARNING,
          "manual-review/fullscreen-layout",
          "manifest.layout=fullscreen requests a full-screen Vault body and requires additional Flap review. flap.sh must keep host-owned token/header constraints around the artifact.",
          { field: "layout", layout: FULLSCREEN_LAYOUT },
        ),
      );
    }
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
      const manifestTestTokenFields = [];
      const factoryFieldsByChain = new Map();
      const noFactoryFieldsByChain = new Map();
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
        if (Number.isInteger(bindingEntry.chainId) && bindingEntry.chainId > 0) {
          if (isNonZeroAddress(bindingEntry.factoryAddress)) {
            if (!factoryFieldsByChain.has(bindingEntry.chainId)) factoryFieldsByChain.set(bindingEntry.chainId, field);
          } else if (
            bindingEntry.factoryAddress === undefined &&
            ((Array.isArray(bindingEntry.tokenAddresses) && bindingEntry.tokenAddresses.length > 0) ||
              (Array.isArray(bindingEntry.vaultAddresses) && bindingEntry.vaultAddresses.length > 0))
          ) {
            if (!noFactoryFieldsByChain.has(bindingEntry.chainId)) noFactoryFieldsByChain.set(bindingEntry.chainId, field);
          }
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
        } else if (hasFactoryField && placeholderAddressLabel(bindingEntry.factoryAddress)) {
          issues.push(placeholderAddressIssue(`${field}.factoryAddress`, bindingEntry.factoryAddress));
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
            for (const [addressIndex, addr] of bindingEntry.vaultAddresses.entries()) {
              if (!ADDRESS_RE.test(addr) || isZeroAddress(addr)) {
                issues.push(issue(BLOCKING, "manifest-binding/invalid-address", `${field}.vaultAddresses contains invalid or zero address: ${addr}.`, { field: `${field}.vaultAddresses[${addressIndex}]` }));
              } else if (placeholderAddressLabel(addr)) {
                issues.push(placeholderAddressIssue(`${field}.vaultAddresses[${addressIndex}]`, addr));
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
            for (const [addressIndex, addr] of bindingEntry.tokenAddresses.entries()) {
              if (!ADDRESS_RE.test(addr) || isZeroAddress(addr)) {
                issues.push(issue(BLOCKING, "manifest-binding/invalid-address", `${field}.tokenAddresses contains invalid or zero address: ${addr}.`, { field: `${field}.tokenAddresses[${addressIndex}]` }));
              } else if (placeholderAddressLabel(addr)) {
                issues.push(placeholderAddressIssue(`${field}.tokenAddresses[${addressIndex}]`, addr));
              } else if (!hasRequiredTestTokenSuffix(addr)) {
                issues.push(
                  issue(
                    BLOCKING,
                    "manifest-binding/invalid-test-token-suffix",
                    `${field}.tokenAddresses[${addressIndex}] must be a real test token address ending in ${REQUIRED_TEST_TOKEN_SUFFIX}: ${addr}.`,
                    { field: `${field}.tokenAddresses[${addressIndex}]`, tokenAddress: addr, requiredSuffix: REQUIRED_TEST_TOKEN_SUFFIX },
                  ),
                );
              } else {
                manifestTestTokenFields.push(`${field}.tokenAddresses[${addressIndex}]`);
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
      for (const [chainId, factoryField] of factoryFieldsByChain.entries()) {
        const noFactoryField = noFactoryFieldsByChain.get(chainId);
        if (!noFactoryField) continue;
        issues.push(
          issue(
            BLOCKING,
            "manifest-binding/mixed-chain-scope",
            `${noFactoryField} cannot coexist with ${factoryField} on chain ${chainId}. Use one factory binding, optionally with tokenAddresses, or one no-factory binding mode for that chain.`,
            { field: noFactoryField, chainId, factoryField },
          ),
        );
      }
      if (manifestTestTokenFields.length === 0) {
        issues.push(
          issue(
            BLOCKING,
            "manifest-binding/missing-test-token",
            `manifest.match.bindings must declare at least one real deployed ${REQUIRED_TEST_TOKEN_SUFFIX}-suffix tokenAddresses entry for Workbench/vault:e2e test coverage. Local vault:e2e --token overrides do not satisfy vault:check, and production CA restrictions belong in Workbench/registry caRestrictionMode configuration.`,
            { field: "match.bindings[].tokenAddresses", required: "at least one tokenAddresses entry" },
          ),
        );
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
        issues.push(
          issue(WARNING, "manual-review/external-endpoint", `Declared external endpoint ${endpoint}. External endpoints are discouraged and require Flap review approval before publish.`, {
            field,
            source: "manifest",
            url: endpoint,
            origin: parsedEndpoint.origin,
            pathname: parsedEndpoint.pathname,
            queryParams: queryParamsForUrl(endpoint),
          }),
        );
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
  const folderName = path.basename(vaultDir);
  const declaredUrls = collectDeclaredUrls(manifest);
  const declaredFrames = collectDeclaredFrames(manifest);
  const contractPolicy = collectManifestContractPolicy(manifest);
  const abiFunctionOutputCounts = collectAbiFunctionOutputCounts(vaultDir);
  const oracleProvisionDetails = getRuntimeOracleProvisionDetails();
  const sourceFiles = walk(vaultDir).filter((item) => !item.isDirectory && !item.isSymlink && item.name.match(/\.(ts|tsx|js|jsx)$/));
  for (const item of sourceFiles) {
    const rel = path.relative(ROOT, item.path);
    const content = fs.readFileSync(item.path, "utf8");
    const scanContent = stripCommentsForScanning(content);
    const checks = [
      [/\b(?:window|globalThis|global|self)\.(?:ethereum|web3|solana|BinanceChain|tronWeb|coinbaseWalletExtension|okxwallet|trustwallet)\b/, "forbidden-api/direct-window-ethereum", "Direct injected wallet provider access is not allowed."],
      [/\b(?:window|globalThis|global|self)\s*\[\s*["'`](?:ethereum|web3|solana|BinanceChain|tronWeb|coinbaseWalletExtension|okxwallet|trustwallet)["'`]\s*\]/, "forbidden-api/direct-window-ethereum", "Direct injected wallet provider access is not allowed."],
      [/\b(?:ethereum|web3|solana|BinanceChain|tronWeb)\.(?:request|send|sendAsync|enable|currentProvider|signMessage|signTransaction|signAllTransactions|signAndSendTransaction)\b/, "forbidden-api/direct-window-ethereum", "Direct wallet provider request/signing APIs are not allowed."],
      [/\bweb3\.eth\.(?:sendTransaction|sign|personal)\b/, "forbidden-api/direct-window-ethereum", "Direct web3 wallet transaction/signing APIs are not allowed."],
      [/\{\s*(?:ethereum|web3|solana|BinanceChain|tronWeb|coinbaseWalletExtension|okxwallet|trustwallet)\b[^}]*\}\s*=\s*(?:window|globalThis|global|self)\b/, "forbidden-api/direct-window-ethereum", "Destructuring injected wallet providers from browser globals is not allowed."],
      [/\b(?:request|send|sendAsync)\s*\(\s*(?:\{\s*method\s*:\s*)?["'`](?:eth_|wallet_|personal_)/, "forbidden-api/direct-window-ethereum", "Raw wallet RPC request/send calls are not allowed."],
      [/["'`](?:personal_sign|eth_sign(?:TypedData(?:_v[134])?)?|eth_sendTransaction|eth_requestAccounts|wallet_[A-Za-z0-9_]+|eth_decrypt|eth_getEncryptionPublicKey|eip6963:(?:requestProvider|announceProvider))["'`]/, "forbidden-api/direct-window-ethereum", "Wallet signing, transaction, permission, or provider-discovery RPC methods are not allowed."],
      [/\beval\s*\(/, "forbidden-api/eval", "eval() is not allowed."],
      [/\b(?:new\s+)?Function\s*\(/, "forbidden-api/function-constructor", "Function constructor usage is not allowed."],
      [/\.\s*constructor\s*\(\s*["'`]/, "forbidden-api/function-constructor", "Calling .constructor(...) as a Function-constructor escape is not allowed."],
      [/\b(?:window\.)?set(?:Timeout|Interval)\s*\(\s*["'`]/, "forbidden-api/eval", "String-based timer callbacks are eval-like and are not allowed."],
      [/<iframe\b/i, "forbidden-api/iframe", "raw iframe UI is not allowed. Use ReviewedFrame for reviewed display-only externalFrames."],
      [/document\.createElement\s*\(\s*["'`]iframe["'`]\s*\)/, "forbidden-api/iframe", "raw iframe creation is not allowed. Use ReviewedFrame for reviewed display-only externalFrames."],
      [/<script\b/i, "forbidden-api/script", "script injection is not allowed."],
      [/document\.createElement\s*\(\s*["'`]script["'`]\s*\)/, "forbidden-api/script", "script injection is not allowed."],
      [/\bdocument\.write(?:ln)?\s*\(/, "forbidden-api/script", "document.write/writeln is not allowed inside Vault components."],
      [/\bdocument\.(?:open|close)\s*\(/, "forbidden-api/script", "document.open/close can replace the host page and are not allowed inside Vault components."],
      [/\.\s*(?:innerHTML|outerHTML)\s*=/, "forbidden-api/script", "Direct HTML replacement is not allowed inside Vault components."],
      [/\.\s*insertAdjacentHTML\s*\(/, "forbidden-api/script", "HTML injection APIs are not allowed inside Vault components."],
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
      [/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:window|globalThis|self)\.open\b/, "forbidden-api/browser-navigation", "Aliasing window.open is not allowed inside Vault components."],
      [/\{\s*open\b[^}]*\}\s*=\s*(?:window|globalThis|self)\b/, "forbidden-api/browser-navigation", "Destructuring open from browser globals is not allowed inside Vault components."],
      [/(?<![.\w$])open\s*(?:\?\.)?\(\s*["'`]/, "forbidden-api/browser-navigation", "Global open() is not allowed. Use reviewed explorer-only window.open or AddressLink."],
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
    issues.push(...collectBrowserGlobalMemberIssues(scanContent, rel));
    issues.push(...collectWindowOpenIssues(scanContent, rel));
    if (item.name === "Component.tsx") {
      issues.push(...collectHardcodedVisibleCopyIssues(content, rel));
      issues.push(...collectInlineSvgIssues(content, rel));
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
      } else if (sharedRuntimeImportRoot(spec)) {
        issues.push(issue(BLOCKING, "imports-and-dependencies/deep-shared-runtime-import", `Deep import ${spec} is not allowed. Import from the shared ${sharedRuntimeImportRoot(spec)} barrel instead.`, { file: rel }));
      } else if (/sdk/i.test(spec) && !isAllowedPackageImport(spec)) {
        issues.push(issue(BLOCKING, "imports-and-dependencies/external-sdk-package", `External SDK-style import ${spec} is not allowed. Use the shared @/src/sdk and @/src/ui surfaces only.`, { file: rel }));
      } else if (!isAllowedPackageImport(spec)) {
        issues.push(issue(BLOCKING, "imports-and-dependencies/unreviewed-import", `Import ${spec} is not in the approved allowlist.`, { file: rel }));
      }
    }
    const walletUtilityImportRegex =
      /import\s*\{[^}]*\b(?:createWalletClient|custom|privateKeyToAccount|toAccount|signMessage|signTypedData|signTransaction)\b[^}]*\}\s*from\s*["'`]viem(?:\/accounts)?["'`]/g;
    for (const match of scanContent.matchAll(walletUtilityImportRegex)) {
      issues.push(
        issue(
          BLOCKING,
          "imports-and-dependencies/forbidden-import",
          "Wallet-client and signing utilities from viem are not allowed inside Vault source. Use the Flap SDK wallet/contract methods.",
          { file: rel, line: lineForIndex(scanContent, match.index ?? -1) },
        ),
      );
    }
    issues.push(...collectDynamicImportIssues(content, rel));
    issues.push(...collectReviewedFrameIssues(scanContent, rel, declaredFrames));
    const staticImgSrcUrls = collectStaticImgSrcUrls(scanContent, rel);
    const ipfsImageCidUsages = collectIpfsImageCidUsages(scanContent, rel);
    for (const usage of ipfsImageCidUsages) {
      if (!isValidIpfsImageCid(usage.cid)) {
        issues.push(
          issue(
            BLOCKING,
            "media-policy/invalid-ipfs-image-cid",
            "IpfsImage/IpfsBackground must receive a static image CID. URLs, ipfs:// values, metadata CIDs, and dynamic expressions are not allowed.",
            usage,
          ),
        );
      }
    }
    const requireRegex = /\brequire\s*\(/g;
    for (const match of scanContent.matchAll(requireRegex)) {
      issues.push(issue(BLOCKING, "imports-and-dependencies/require-call", "CommonJS require() is not allowed inside a Vault package.", { file: rel, line: lineForIndex(scanContent, match.index ?? -1) }));
    }
    for (const oracleUsage of collectReadOracleUsages(scanContent, rel)) {
      const provision = oracleProvisionDetails.get(oracleUsage.oracleId);
      const isBuiltInOracle = provision?.source === "built-in";
      issues.push(
        issue(
          isBuiltInOracle ? WARNING : BLOCKING,
          "manual-review/oracle-usage",
          isBuiltInOracle
            ? `Oracle ${oracleUsage.oracleId} is used by code and is provisioned through ${provision.source}. Flap Artifact Workbench/runtime must still review the oracle endpoint and params before production publish.`
            : provision
              ? `Oracle ${oracleUsage.oracleId} is provisioned only through ${RUNTIME_ORACLE_REGISTRY_ENV}. Template source packages must use built-in runtime oracle ids so Workbench production validates the same package. Promote this oracle to the shared runtime or switch to an existing built-in oracle id before packaging.`
            : `Oracle ${oracleUsage.oracleId} is used by code but is not provisioned by the runtime oracle registry. Do not declare oracle config in manifest.json; Flap Artifact Workbench/runtime must review and provision it before packaging.`,
          {
            ...oracleUsage,
            provisioned: Boolean(provision),
            source: provision?.source ?? "missing",
            endpoints: provision?.endpoints ?? [],
            allowedParams: provision?.allowedParams ?? [],
            fixedParams: provision?.fixedParams ?? {},
          },
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
      } else {
        issues.push(
          issue(WARNING, "manual-review/external-endpoint", `fetch() uses declared external endpoint ${staticTarget}. External endpoint usage requires Flap review approval before publish.`, {
            source: "fetch",
            url: staticTarget,
            origin: parsedTarget.origin,
            pathname: parsedTarget.pathname,
            queryParams: queryParamsForUrl(staticTarget),
            file: rel,
            line: lineForIndex(scanContent, match.index ?? -1),
          }),
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
    if (/url\(\s*["']?(?:https?:\/\/|ipfs:\/\/|ar:\/\/|data:)/i.test(scanContent)) {
      issues.push(issue(BLOCKING, "media-policy/remote-media", "Remote media is not developer-declared in this template. Use Flap-controlled media/runtime policy instead.", { file: rel }));
    }
    for (const imageSrc of staticImgSrcUrls) {
      if (/^(?:https?:\/\/|ipfs:\/\/|ar:\/\/|data:)/i.test(imageSrc.url)) {
        issues.push(issue(BLOCKING, "media-policy/remote-media", "Remote image sources must use IpfsImage or IpfsBackground with a static cid prop instead of a URL.", imageSrc));
      }
    }
    const hardcodedAddressRegex = /["'`]0x[a-fA-F0-9]{40}["'`]/g;
    for (const match of scanContent.matchAll(hardcodedAddressRegex)) {
      const normalizedAddress = normalizeAddress(match[0].slice(1, -1));
      if (!normalizedAddress || !contractPolicy.all.has(normalizedAddress)) {
        issues.push(issue(BLOCKING, "security/hardcoded-address", `Hardcoded address ${match[0]} found in Vault source. Use runtime context addresses or declare intentional external contract addresses in manifest.`, { file: rel, line: lineForIndex(scanContent, match.index) }));
      }
    }
    if (/refetchInterval\s*:\s*([0-4]?\d{1,3})(?!\d)/.test(scanContent)) {
      issues.push(issue(BLOCKING, "performance/refetch-too-fast", "refetchInterval below 5000ms is not allowed in Vault source.", { file: rel }));
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
          BLOCKING,
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
          BLOCKING,
          "manual-review/action-stage-gating",
          "Component has a user write path but does not reference marketPhase or isActionAvailableForPhase. Stage-gated actions must state whether they run in internal-market, DEX-listed, both, or read-only mode.",
          { file: rel },
        ),
      );
    }
    const hasComponentRiskStatusIntegration = item.name === "Component.tsx" ? hasRiskStatusIntegration(scanContent) : false;
    if (item.name === "Component.tsx" && !hasComponentRiskStatusIntegration) {
      issues.push(
        issue(
          BLOCKING,
          "risk-status/missing-host-risk-state",
          "Every onboarded Vault UI must read and visibly render the current contract risk status from host Vault/TaxInfo context. If the host risk level is unavailable, render a prominent message that this Vault must add risk-status integration.",
          { file: rel },
        ),
      );
    }
    if (item.name === "Component.tsx") {
      issues.push(...collectMultipleOutputObjectReadIssues(content, rel, abiFunctionOutputCounts));
      issues.push(...collectTxButtonStateIssues(content, rel));
      if (hasComponentRiskStatusIntegration && !hasProminentRiskStatusPlacement(scanContent)) {
        issues.push(
          issue(
            BLOCKING,
            "risk-status/not-prominent-placement",
            "The current contract risk status must be placed within the first three Vault business rows, before any preview, hero, banner, showcase, media, chart, or large visual block.",
            { file: rel },
          ),
        );
      }
      issues.push(...collectManualLowRiskLabelIssues(scanContent, i18n, manifestLocales, rel));
      issues.push(...collectRowHeavyDashboardIssues(scanContent, rel, folderName));
    }
    if (/Number\s*\([^)]*(amount|balance|allowance|deposit|claim|reward)/i.test(scanContent)) {
      issues.push(issue(BLOCKING, "contract-abi/number-bigint", "Avoid Number(...) for token amounts used in transaction logic.", { file: rel }));
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

function collectIpfsImageCidSources(vaultDir) {
  return walk(vaultDir)
    .filter((item) => !item.isDirectory && !item.isSymlink && item.name.match(/\.(ts|tsx|js|jsx)$/))
    .flatMap((item) => {
      const rel = path.relative(ROOT, item.path);
      const content = stripCommentsForScanning(fs.readFileSync(item.path, "utf8"));
      return collectIpfsImageCidUsages(content, rel)
        .filter((source) => isValidIpfsImageCid(source.cid))
        .map((source) => ({
          ...source,
          urls: ipfsImageUrlsForCid(source.cid),
        }));
    });
}

async function probeImageUrl(url) {
  for (const method of ["HEAD", "GET"]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, {
        method,
        headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
        signal: controller.signal,
      });
      if (response.body) await response.body.cancel().catch(() => {});
      const finalUrl = response.url || url;
      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && isAllowedIpfsImageGatewayUrl(finalUrl) && contentType.toLowerCase().startsWith("image/")) return null;
      if (method === "HEAD" && (response.status === 405 || response.status === 403 || !contentType.toLowerCase().startsWith("image/"))) continue;
      return { status: response.status, contentType, finalUrl };
    } catch (error) {
      if (method === "HEAD") continue;
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { error: "image probe failed" };
}

async function collectIpfsImageValidationIssues(vaultDir) {
  const seen = new Set();
  const sources = collectIpfsImageCidSources(vaultDir).filter((source) => {
    if (seen.has(source.cid)) return false;
    seen.add(source.cid);
    return true;
  });
  const issues = [];
  for (const source of sources) {
    const attempts = [];
    let resolved = false;
    for (const url of source.urls) {
      const failure = await probeImageUrl(url);
      if (!failure) {
        resolved = true;
        break;
      }
      attempts.push({ url, ...failure });
    }
    if (resolved) continue;
    issues.push(
      issue(
        BLOCKING,
        "media-policy/ipfs-image-unavailable",
        `${source.component} cid ${source.cid} must resolve through at least one allowed Flap IPFS gateway with an image/* content-type.`,
        { ...source, attempts },
      ),
    );
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
    url: item.url,
    oracleId: item.oracleId,
    locale: item.locale,
    key: item.key,
    fixHint: item.fixHint,
  }));
}

function collectManualReview(issues) {
  const externalEndpoints = issues
    .filter((item) => item.ruleId === "manual-review/external-endpoint" && item.url)
    .map((item) => ({
      source: item.source,
      url: item.url,
      origin: item.origin,
      pathname: item.pathname,
      queryParams: item.queryParams ?? {},
      file: item.file,
      line: item.line,
      field: item.field,
      severity: item.severity,
      ruleId: item.ruleId,
    }));

  const oracles = issues
    .filter((item) => item.ruleId === "manual-review/oracle-usage" && item.oracleId)
    .map((item) => ({
      oracleId: item.oracleId,
      provisioned: Boolean(item.provisioned),
      source: item.source,
      endpoints: item.endpoints ?? [],
      allowedParams: item.allowedParams ?? [],
      fixedParams: item.fixedParams ?? {},
      params: item.params,
      paramsExpression: item.paramsExpression,
      file: item.file,
      line: item.line,
      severity: item.severity,
      ruleId: item.ruleId,
    }));

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

  const fullscreenLayouts = issues
    .filter((item) => item.ruleId === "manual-review/fullscreen-layout")
    .map((item) => ({
      layout: item.layout,
      field: item.field,
      severity: item.severity,
      ruleId: item.ruleId,
    }));

  return { externalEndpoints, oracles, externalFrames, fullscreenLayouts };
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

export async function runVaultCheckWithTokenContracts(folderName, options = {}) {
  const staticReport = runVaultCheck(folderName, { ...options, silent: true });
  if (staticReport.summary.blocking > 0) {
    if (!options.silent) console.log(JSON.stringify(staticReport, null, 2));
    return staticReport;
  }

  let manifest = {};
  try {
    manifest = readJson(path.join(ROOT, "src", "vaults", folderName, "manifest.json"));
  } catch {
    if (!options.silent) console.log(JSON.stringify(staticReport, null, 2));
    return staticReport;
  }

  const tokenIssues = await collectManifestErc20TokenIssues(manifest, {
    file: `src/vaults/${folderName}/manifest.json`,
  });
  const ipfsImageIssues = await collectIpfsImageValidationIssues(path.join(ROOT, "src", "vaults", folderName));
  const report = buildCheckReport(folderName, [...staticReport.issues, ...tokenIssues, ...ipfsImageIssues]);
  if (!options.silent) {
    console.log(JSON.stringify(report, null, 2));
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const folderName = process.argv[2];
  await assertTemplateFresh({ folderName });
  const result = await runVaultCheckWithTokenContracts(folderName);
  const hasBlocking = result.issues.some((item) => item.severity === BLOCKING);
  process.exit(hasBlocking ? 1 : 0);
}
