#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { failAgent } from "./agent-error.mjs";
import { isValidFolderName, registerVault } from "./vault-registration.mjs";

const ROOT = process.cwd();
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ARTIFACT_ID_RE = /^vaultui_([a-z0-9]+(?:-[a-z0-9]+)*)_([0-9A-HJKMNPQRSTVWXYZ]{26})$/;

function fail(message, { code = "cli/scaffold-error", fixHint = "Read agent.nextActions and rerun the command after fixing the input.", nextActions, ...extra } = {}) {
  failAgent({ code, message, fixHint, nextActions, extra });
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.trim();
    const next = argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith("--") ? next : true);
    if (inlineValue === undefined && value === next) index += 1;
    if (parsed[key] === undefined) {
      parsed[key] = value;
    } else if (Array.isArray(parsed[key])) {
      parsed[key].push(value);
    } else {
      parsed[key] = [parsed[key], value];
    }
  }
  return parsed;
}

function collectValues(parsed, keys, fallback = []) {
  const values = [];
  for (const key of keys) {
    const value = parsed[key];
    if (value === undefined || value === true) continue;
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
      values.push(
        ...String(item)
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      );
    }
  }
  return values.length ? values : fallback;
}

function collectBoolean(parsed, key, fallback) {
  const value = parsed[key];
  if (value === undefined) return fallback;
  if (value === true) return true;
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  fail(`--${key} must be true or false.`, {
    code: "cli/invalid-boolean",
    fixHint: `Pass --${key} true, --${key} false, or omit the flag.`,
    flag: key,
  });
}

function unique(values) {
  return [...new Set(values)];
}

function humanizeFolderName(folderName) {
  return folderName
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function encodeBase32(value, length) {
  let output = "";
  let nextValue = value;
  for (let index = 0; index < length; index += 1) {
    output = ULID_ALPHABET[Number(nextValue & 31n)] + output;
    nextValue >>= 5n;
  }
  return output;
}

function createUlid() {
  let randomValue = 0n;
  for (const byte of crypto.randomBytes(10)) {
    randomValue = (randomValue << 8n) + BigInt(byte);
  }
  return `${encodeBase32(BigInt(Date.now()), 10)}${encodeBase32(randomValue, 16)}`;
}

function createArtifactId(folderName) {
  return `vaultui_${folderName}_${createUlid()}`;
}

function validateArtifactId(artifactId, folderName) {
  const match = ARTIFACT_ID_RE.exec(artifactId);
  if (!match) {
    fail("--artifact-id must match vaultui_<folder-name>_<26-char ULID>, for example vaultui_my-vault_01HZY7J4S9D0W5XJ8H2Q3K4M5N.", {
      code: "manifest-schema/invalid-artifact-id",
      fixHint: "Let vault:scaffold generate artifactId, or pass --artifact-id using vaultui_<folder-name>_<26-char ULID>.",
      folderName,
      artifactId,
    });
  }
  if (match[1] !== folderName) {
    fail("--artifact-id folder-name segment must match the Vault folder name.", {
      code: "manifest-schema/artifact-id-folder-name-mismatch",
      fixHint: "Regenerate artifactId for this folder name, or rename the folder to match the artifactId folder-name segment.",
      folderName,
      artifactId,
      artifactFolderName: match[1],
    });
  }
}

function pascalCase(folderName) {
  return folderName
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).replace(/[^a-zA-Z0-9]/g, ""))
    .join("");
}

function localeText(locale, zh, en) {
  return locale.toLowerCase().startsWith("zh") ? zh : en;
}

function componentSource(componentName) {
  return `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Info, ShieldCheck, Wallet } from "lucide-react";
import { AddressLink, Alert, Card, CardContent, CardHeader, CardTitle, DetailTile, Metric, StatusBadge } from "@/src/ui";
import { vaultAbi } from "./VaultABI";

export default function ${componentName}(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const t = i18n.t;
  const host = readTaxVaultHostContext(context.host);
  const marketPhase = host.marketPhase;
  const marketPhaseLabel =
    marketPhase === "internal-market"
      ? t("states.marketPhaseInternal")
      : marketPhase === "dex-listed"
        ? t("states.marketPhaseDexListed")
        : t("states.marketPhaseUnknown");
  const riskLevel = host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel ?? null;
  const riskLabel =
    riskLevel === 1
      ? t("states.riskLow")
      : riskLevel === 2
        ? t("states.riskLowMedium")
        : riskLevel === 3
          ? t("states.riskMedium")
          : riskLevel === 4
            ? t("states.riskHigh")
            : riskLevel === 0
              ? t("states.riskUnverified")
              : t("states.riskMissing");
  const riskTone = riskLevel === null || riskLevel === 0 || riskLevel >= 4 ? "danger" : riskLevel >= 3 ? "warning" : "success";
  void vaultAbi;

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>{t("title")}</CardTitle>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#a8b5c7]">{t("subtitle")}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <StatusBadge tone={riskTone}>{riskLabel}</StatusBadge>
              <StatusBadge tone="neutral">{marketPhaseLabel}</StatusBadge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(16rem,0.95fr)]">
            <div className="rounded-lg border border-[#344963] bg-[#101827] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#d8e2ef]">
                <Info className="h-4 w-4 text-[#a78bfa]" />
                {t("sections.implementationPath")}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border border-[#40536c] bg-[#172131] p-3 text-center">
                  <div className="text-sm font-semibold text-white">{t("flow.context")}</div>
                  <div className="mt-1 text-xs font-medium leading-5 text-[#8d9caf]">{t("flow.contextDetail")}</div>
                </div>
                <div className="rounded-md border border-[#40536c] bg-[#172131] p-3 text-center">
                  <div className="text-sm font-semibold text-white">{t("flow.reads")}</div>
                  <div className="mt-1 text-xs font-medium leading-5 text-[#8d9caf]">{t("flow.readsDetail")}</div>
                </div>
                <div className="rounded-md border border-[#40536c] bg-[#172131] p-3 text-center">
                  <div className="text-sm font-semibold text-white">{t("flow.actions")}</div>
                  <div className="mt-1 text-xs font-medium leading-5 text-[#8d9caf]">{t("flow.actionsDetail")}</div>
                </div>
              </div>
              <p className="mt-4 text-sm font-medium leading-6 text-[#9facbf]">{t("flow.description")}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Metric label={t("labels.chain")} value={String(context.chainId)} hint={t("labels.runtimeChain")} tone="primary" />
              <Metric label={t("labels.marketPhase")} value={marketPhaseLabel} hint={host.renderSurface} />
              <Metric label={t("labels.riskStatus")} value={riskLabel} hint={t("labels.hostRisk")} tone={riskTone === "success" ? "success" : "warning"} />
            </div>
          </div>

          {riskLevel === null ? <Alert tone="danger">{t("notices.riskMissing")}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailTile
              icon={<ShieldCheck className="h-4 w-4" />}
              label={t("labels.vault")}
              value={<AddressLink address={context.vaultAddress} explorerBaseUrl={context.explorerBaseUrl} />}
              tone="muted"
            />
            <DetailTile
              icon={<Wallet className="h-4 w-4" />}
              label={t("labels.token")}
              value={<AddressLink address={context.tokenAddress} explorerBaseUrl={context.explorerBaseUrl} label={context.tokenSymbol} />}
              tone="muted"
            />
            <DetailTile label={t("labels.factory")} value={context.factoryAddress} tone="muted" />
            <DetailTile label={t("labels.user")} value={context.userAddress ?? "-"} tone={context.userAddress ? "success" : "warning"} />
          </div>
        </CardContent>
      </Card>

      <Alert>{t("notices.nextStep")}</Alert>
    </div>
  );
}
`;
}

function abiSource() {
  return `export const vaultAbi = [] as const;
`;
}

function i18nSource(locales, name) {
  const payload = {};
  for (const locale of locales) {
    payload[locale] = {
      title: localeText(locale, `${name}`, `${name}`),
      subtitle: localeText(locale, "基于 Flap runtime 数据生成的默认业务面板；继续补充最小 ABI 和真实读写流程。", "A default business panel generated from Flap runtime data. Continue by adding minimal ABI fragments and real read/write flows."),
      "sections.implementationPath": localeText(locale, "实现路径", "Implementation path"),
      "flow.context": localeText(locale, "上下文", "Context"),
      "flow.contextDetail": localeText(locale, "链 / Token / Vault", "Chain / token / Vault"),
      "flow.reads": localeText(locale, "读取", "Reads"),
      "flow.readsDetail": localeText(locale, "Vault 状态", "Vault state"),
      "flow.actions": localeText(locale, "操作", "Actions"),
      "flow.actionsDetail": localeText(locale, "阶段门控", "Stage gated"),
      "flow.description": localeText(
        locale,
        "这个默认组件先展示风险、阶段和运行时目标，再由开发者把具体 Vault 机制、指标和操作接入到同一结构中。",
        "This default component shows risk, phase, and runtime targets first. Developers can then plug the real Vault mechanism, metrics, and actions into the same structure.",
      ),
      "labels.chain": localeText(locale, "链", "Chain"),
      "labels.factory": localeText(locale, "Factory", "Factory"),
      "labels.vault": localeText(locale, "Vault", "Vault"),
      "labels.token": localeText(locale, "Token", "Token"),
      "labels.user": localeText(locale, "用户", "User"),
      "labels.riskStatus": localeText(locale, "合约风险状态", "Contract risk status"),
      "labels.marketPhase": localeText(locale, "市场阶段", "Market phase"),
      "labels.runtimeChain": localeText(locale, "运行时链", "Runtime chain"),
      "labels.hostRisk": localeText(locale, "Host 风险状态", "Host risk status"),
      "states.riskMissing": localeText(locale, "缺少风险状态", "Risk status missing"),
      "states.riskUnverified": localeText(locale, "未验证", "Unverified"),
      "states.riskLow": localeText(locale, "低风险", "Low risk"),
      "states.riskLowMedium": localeText(locale, "中低风险", "Low-medium risk"),
      "states.riskMedium": localeText(locale, "中风险", "Medium risk"),
      "states.riskHigh": localeText(locale, "高风险", "High risk"),
      "states.marketPhaseInternal": localeText(locale, "内盘阶段", "Internal market"),
      "states.marketPhaseDexListed": localeText(locale, "已 Listing", "DEX listed"),
      "states.marketPhaseUnknown": localeText(locale, "未知阶段", "Unknown phase"),
      "notices.riskMissing": localeText(
        locale,
        "必须接入当前合约风险状态后才能交付这个 Vault UI；请使用 host Vault/TaxInfo context 读取 riskLevel，并在界面中显著展示。",
        "This Vault UI must integrate the current contract risk status before delivery; read riskLevel from host Vault/TaxInfo context and display it prominently.",
      ),
      "notices.nextStep": localeText(
        locale,
        "下一步：补充最小 VaultABI，使用 sdk.readContract / sdk.simulateContract / sdk.writeContract 实现业务流程。",
        "Next: add minimal VaultABI fragments and implement the workflow with sdk.readContract, sdk.simulateContract, and sdk.writeContract.",
      ),
    };
  }
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function manifestSource({ artifactId, name, bindings, locales }) {
  const matchBindings = bindings.map((binding) => {
    const entry = { chainId: binding.chainId };
    if (binding.factoryAddress) entry.factoryAddress = binding.factoryAddress;
    if (binding.vaultAddresses.length) entry.vaultAddresses = binding.vaultAddresses;
    if (binding.tokenAddresses.length) entry.tokenAddresses = binding.tokenAddresses;
    return entry;
  });
  const match = { bindings: matchBindings };
  return `${JSON.stringify({ artifactId, name, match, i18n: locales }, null, 2)}\n`;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const folderName = parsed._[0];
  const dryRun = collectBoolean(parsed, "dry-run", false);
  const force = collectBoolean(parsed, "force", false);

  if (!folderName) {
    fail(
      "Usage: yarn vault:scaffold <folder-name> --chain 56 --factory 0x... or --chain 56 --vault 0x... [--token 0x...] [--name \"My Vault UI\"] [--locales en,zh] [--artifact-id vaultui_<folder-name>_<ulid>]",
      {
        code: "cli/missing-folder-name",
        fixHint:
          "Provide a lowercase kebab-case folder name and at least one binding target, for example: yarn vault:scaffold my-vault --chain 56 --factory 0x1000000000000000000000000000000000000001 or yarn vault:scaffold my-vault --chain 56 --vault 0x3000000000000000000000000000000000000003",
      },
    );
  }
  if (!isValidFolderName(folderName)) {
    fail("Folder name must be 3-64 characters of lowercase kebab-case, for example my-vault.", {
      code: "cli/invalid-folder-name",
      fixHint: "Use lowercase letters and numbers separated by single hyphens; do not use spaces, underscores, uppercase letters, leading/trailing hyphens, or nested folders.",
      folderName,
    });
  }

  const name = typeof parsed.name === "string" ? parsed.name.trim() : `${humanizeFolderName(folderName)} Vault UI`;
  const artifactId = typeof parsed["artifact-id"] === "string" ? parsed["artifact-id"].trim() : createArtifactId(folderName);
  const chainValues = collectValues(parsed, ["chain", "chains"], ["56"]).map((value) => Number(value));
  const factoryValues = collectValues(parsed, ["factory", "factories"]);
  const tokenValues = collectValues(parsed, ["token", "tokens"]);
  const vaultValues = collectValues(parsed, ["vault", "vaults"]);
  const locales = unique(collectValues(parsed, ["locale", "locales"], ["en", "zh"]));

  if (!name) {
    fail("--name must not be empty.", {
      code: "manifest-schema/invalid-name",
      fixHint: "Pass a readable manifest name with --name, for example --name \"My Vault UI\".",
    });
  }
  validateArtifactId(artifactId, folderName);
  if (!chainValues.length || chainValues.some((chainId) => !Number.isInteger(chainId) || chainId <= 0)) {
    fail("--chain must be a positive integer chain ID, for example --chain 56.", {
      code: "manifest-binding/invalid-chain-ids",
      fixHint: "Pass --chain 56 for a single chain. For multiple chains repeat --chain with one --factory or --vault target per chain.",
      chainValues,
    });
  }
  const usingFactoryMode = factoryValues.length > 0;
  const usingVaultMode = factoryValues.length === 0 && vaultValues.length > 0;
  if (!usingFactoryMode && !usingVaultMode) {
    fail("Each binding needs either --factory or --vault.", {
      code: "manifest-binding/missing-binding-target",
      fixHint: "Pass --chain 56 --factory 0x... for factory-scoped UI, or --chain 56 --vault 0x... [--token 0x...] for single-Vault UI.",
    });
  }
  if (usingFactoryMode && chainValues.length !== factoryValues.length) {
    fail(`--chain and --factory must be paired: got ${chainValues.length} chain(s) and ${factoryValues.length} factory address(es).`, {
      code: "manifest-binding/chain-factory-count-mismatch",
      fixHint: "Provide exactly one --factory for each --chain, in the same order. Example: --chain 56 --factory 0xAAA --chain 97 --factory 0xBBB",
      chainCount: chainValues.length,
      factoryCount: factoryValues.length,
    });
  }
  if (usingVaultMode && vaultValues.length !== chainValues.length) {
    fail(`--chain and --vault must be paired: got ${chainValues.length} chain(s) and ${vaultValues.length} vault address(es).`, {
      code: "manifest-binding/chain-vault-count-mismatch",
      fixHint: "Provide exactly one --vault for each --chain in the same order. Example: --chain 56 --vault 0xAAA --chain 97 --vault 0xBBB",
      chainCount: chainValues.length,
      vaultCount: vaultValues.length,
    });
  }
  if (parsed["restrict-token"] !== undefined || (usingFactoryMode && tokenValues.length)) {
    fail("Token CA reference lists are not accepted as factory-mode scaffold flags.", {
      code: "manifest-binding/ca-policy-not-in-manifest",
      fixHint: "Remove --restrict-token and --token flags for factory mode. If a reference token CA list is needed, scaffold first and then add tokenAddresses under the relevant match.bindings entry in manifest.json.",
      tokenCount: tokenValues.length,
    });
  }
  if (usingVaultMode && tokenValues.length && tokenValues.length !== chainValues.length) {
    fail(`--token count must match --chain count in single-Vault mode: got ${chainValues.length} chain(s) and ${tokenValues.length} token address(es).`, {
      code: "manifest-binding/chain-token-count-mismatch",
      fixHint: "Provide exactly one --token per --chain in the same order, or omit --token when token matching is not needed.",
      chainCount: chainValues.length,
      tokenCount: tokenValues.length,
    });
  }
  if (usingFactoryMode && vaultValues.length && vaultValues.length !== chainValues.length) {
    fail(`--vault count must match --chain count: got ${chainValues.length} chain(s) and ${vaultValues.length} vault address(es).`, {
      code: "manifest-binding/chain-vault-count-mismatch",
      fixHint: "Provide exactly one --vault per --chain in the same order, or omit --vault to let the runtime derive Vault addresses.",
      chainCount: chainValues.length,
      vaultCount: vaultValues.length,
    });
  }
  const allAddresses = [...factoryValues, ...vaultValues, ...tokenValues];
  for (const address of allAddresses) {
    if (!ADDRESS_RE.test(address)) {
      fail(`Invalid address: ${address}`, {
        code: "manifest-binding/invalid-address",
        fixHint: "Use a full 20-byte EVM address matching 0x plus 40 hex characters.",
        address,
      });
    }
  }
  for (const address of factoryValues) {
    if (address.toLowerCase() === ZERO_ADDRESS) {
      fail(`Invalid factory address: ${address}`, {
        code: "manifest-binding/zero-factory-address",
        fixHint: "Pass the real deployed factory contract address. Zero address is not a valid custom UI binding target.",
        address,
      });
    }
  }
  for (const address of [...vaultValues, ...tokenValues]) {
    if (address.toLowerCase() === ZERO_ADDRESS) {
      fail(`Invalid zero address: ${address}`, {
        code: "manifest-binding/invalid-address",
        fixHint: "Use a real deployed Vault or token address, or omit the optional token address.",
        address,
      });
    }
  }
  if (!locales.length || locales.some((locale) => locale.length < 2)) {
    fail("--locales must contain at least one locale.", {
      code: "i18n-policy/manifest-locales",
      fixHint: "Pass --locales en,zh or another locale list where every locale has at least two characters.",
      locales,
    });
  }

  const bindings = chainValues.map((chainId, index) => ({
    chainId,
    factoryAddress: factoryValues[index],
    vaultAddresses: vaultValues[index] ? [vaultValues[index]] : [],
    tokenAddresses: usingVaultMode && tokenValues[index] ? [tokenValues[index]] : [],
  }));

  const vaultDir = path.join(ROOT, "src", "vaults", folderName);
  if (fs.existsSync(vaultDir) && !force) {
    fail(`src/vaults/${folderName} already exists. Pass --force only when you intentionally want to overwrite scaffold-managed files.`, {
      code: "package-structure/vault-dir-exists",
      fixHint: "Use a different folder name, edit the existing package, or pass --force only when overwriting scaffold-managed files is intentional.",
      folderName,
      vaultDir: `src/vaults/${folderName}`,
    });
  }

  const pascalName = pascalCase(folderName);
  const componentName = pascalName.endsWith("Vault") ? pascalName : `${pascalName}Vault`;
  const files = [
    ["Component.tsx", componentSource(componentName)],
    ["manifest.json", manifestSource({ artifactId, name, bindings, locales })],
    ["VaultABI.ts", abiSource()],
    ["i18n.json", i18nSource(locales, name)],
  ];

  const filePaths = files.map(([file]) => `src/vaults/${folderName}/${file}`);
  if (!dryRun) {
    fs.mkdirSync(vaultDir, { recursive: true });
    for (const [file, content] of files) {
      fs.writeFileSync(path.join(vaultDir, file), content);
    }
  }
  let registration;
  try {
    registration = registerVault(folderName, { dryRun, root: ROOT });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), {
      code: "preview-registration/register-failed",
      fixHint: "Fix src/vaults/index.ts so it matches the expected vaultModules shape, then run yarn vault:register <folder-name>.",
      nextActions: [
        {
          ruleId: "preview-registration/register-failed",
          severity: "blocking",
          file: "src/vaults/index.ts",
          fixHint: "Restore the expected vaultModules object and getVaultFolderNames export, then run yarn vault:register <folder-name>.",
        },
      ],
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        folderName,
        artifactId,
        vaultDir: `src/vaults/${folderName}`,
        files: filePaths,
        updatedFiles: registration.changed ? [registration.file] : [],
        previewPath: `/${folderName}`,
        nextCommands: [`yarn vault:check ${folderName}`, `yarn dev`, `yarn vault:package ${folderName}`],
      },
      null,
      2,
    ),
  );
}

main();
