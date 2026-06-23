#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { failAgent } from "./agent-error.mjs";
import { hasRequiredTestTokenSuffix, REQUIRED_TEST_TOKEN_SUFFIX, validateErc20TokenContract } from "./erc20-token-validation.mjs";
import { isValidFolderName, registerVault } from "./vault-registration.mjs";

const ROOT = process.cwd();
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const RESERVED_PLACEHOLDER_ADDRESSES = new Map([
  ["0x1000000000000000000000000000000000000001", "template factory placeholder"],
  ["0x2000000000000000000000000000000000000002", "template token placeholder"],
  ["0x2000000000000000000000000000000000000005", "template token placeholder"],
]);
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

function placeholderAddressLabel(value) {
  return typeof value === "string" ? RESERVED_PLACEHOLDER_ADDRESSES.get(value.toLowerCase()) : undefined;
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
import { Activity, ArrowRight, CheckCircle2, ClipboardCheck, ShieldCheck, Wallet } from "lucide-react";
import { AddressLink, Alert, Button, Card, CardContent, CardHeader, CardTitle, DetailTile, Metric, StatusBadge } from "@/src/ui";
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
    <div className="w-full space-y-3 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[length:34px_34px] sm:space-y-4">
      <Card className="overflow-hidden rounded-[18px] border-white/10 bg-gradient-to-b from-[#0e141d] to-[#070b11] shadow-[0_20px_70px_-38px_rgba(76,141,255,0.65)]">
        <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#4c8dff] shadow-[0_0_12px_rgba(76,141,255,0.85)]" />
                <CardTitle className="text-base sm:text-lg">{t("title")}</CardTitle>
              </div>
              <p className="max-w-2xl text-sm font-medium leading-6 text-[#7c8899]">{t("subtitle")}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <StatusBadge tone={riskTone}>{riskLabel}</StatusBadge>
              <StatusBadge tone="neutral">{marketPhaseLabel}</StatusBadge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:space-y-4 sm:p-5 sm:pt-0">
          <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr] lg:gap-4">
            <div className="rounded-[14px] border border-white/10 bg-black/25 p-3 sm:rounded-[16px] sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#eaf1f8]">{t("sections.mechanism")}</span>
                <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs font-semibold text-[#7c8899]">
                  {t("badges.defaultShell")}
                </span>
              </div>
              <div className="mt-3 flex items-stretch gap-1.5 sm:mt-4 sm:gap-2">
                <div className="min-w-0 flex-1 rounded-[10px] border border-white/10 bg-white/[0.03] px-2 py-2 text-center sm:rounded-[11px] sm:py-3">
                  <div className="truncate text-xs font-semibold text-[#eaf1f8] sm:text-sm">{t("flow.context")}</div>
                  <div className="mt-0.5 truncate text-[10px] font-medium text-[#5a6678] sm:mt-1">{t("flow.contextDetail")}</div>
                </div>
                <div className="grid place-items-center font-mono text-sm font-semibold text-[#4c8dff]">
                  <ArrowRight className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 rounded-[10px] border border-white/10 bg-white/[0.03] px-2 py-2 text-center sm:rounded-[11px] sm:py-3">
                  <div className="truncate text-xs font-semibold text-[#eaf1f8] sm:text-sm">{t("flow.reads")}</div>
                  <div className="mt-0.5 truncate text-[10px] font-medium text-[#5a6678] sm:mt-1">{t("flow.readsDetail")}</div>
                </div>
                <div className="grid place-items-center font-mono text-sm font-semibold text-[#4c8dff]">
                  <ArrowRight className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 rounded-[10px] border border-white/10 bg-white/[0.03] px-2 py-2 text-center sm:rounded-[11px] sm:py-3">
                  <div className="truncate text-xs font-semibold text-[#eaf1f8] sm:text-sm">{t("flow.actions")}</div>
                  <div className="mt-0.5 truncate text-[10px] font-medium text-[#5a6678] sm:mt-1">{t("flow.actionsDetail")}</div>
                </div>
              </div>
              <p className="mt-3 text-xs font-semibold leading-5 text-[#7c8899] sm:mt-4 sm:text-sm sm:leading-6">{t("flow.description")}</p>
              <div className="mt-3 rounded-[12px] border border-[#4c8dff]/30 bg-[#4c8dff]/10 px-3 py-2 text-sm font-medium leading-5 text-[#c8dcff] sm:mt-4">
                {t("notices.defaultScope")}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-3">
              <Metric label={t("labels.chain")} value={String(context.chainId)} hint={t("labels.runtimeChain")} tone="primary" />
              <Metric label={t("labels.marketPhase")} value={marketPhaseLabel} hint={host.renderSurface} />
              <Metric label={t("labels.riskStatus")} value={riskLabel} hint={t("labels.hostRisk")} tone={riskTone === "success" ? "success" : "warning"} />
            </div>
          </div>

          {riskLevel === null ? <Alert tone="danger">{t("notices.riskMissing")}</Alert> : null}

          <div className="grid grid-cols-2 overflow-hidden rounded-[14px] border border-white/10 sm:rounded-[16px] lg:grid-cols-4">
            <div className="min-w-0 border-white/10 bg-[#0e141d] p-3 lg:border-r">
              <div className="truncate text-xs font-medium text-[#7c8899]">{t("labels.vault")}</div>
              <div className="mt-2 min-w-0 text-sm font-semibold leading-tight text-[#eaf1f8]">
                <AddressLink address={context.vaultAddress} explorerBaseUrl={context.explorerBaseUrl} />
              </div>
            </div>
            <div className="min-w-0 border-l border-white/10 bg-[#0e141d] p-3 lg:border-r">
              <div className="truncate text-xs font-medium text-[#7c8899]">{t("labels.token")}</div>
              <div className="mt-2 min-w-0 text-sm font-semibold leading-tight text-[#eaf1f8]">
                <AddressLink address={context.tokenAddress} explorerBaseUrl={context.explorerBaseUrl} label={context.tokenSymbol} />
              </div>
            </div>
            <div className="min-w-0 border-t border-white/10 bg-[#0e141d] p-3 sm:border-l lg:border-l-0 lg:border-t-0 lg:border-r">
              <div className="truncate text-xs font-medium text-[#7c8899]">{t("labels.factory")}</div>
              <div className="mt-2 min-w-0 break-words font-mono text-sm font-semibold leading-tight text-[#eaf1f8]">{context.factoryAddress || "-"}</div>
            </div>
            <div className="min-w-0 border-l border-t border-white/10 bg-[#0e141d] p-3 lg:border-t-0">
              <div className="truncate text-xs font-medium text-[#7c8899]">{t("labels.user")}</div>
              <div className="mt-2 min-w-0 break-words font-mono text-sm font-semibold leading-tight text-[#eaf1f8]">{context.userAddress ?? "-"}</div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
            <DetailTile
              icon={<Activity className="h-4 w-4" />}
              label={t("labels.primaryMetric")}
              value={t("states.awaitingReads")}
              detail={t("hints.primaryMetric")}
              tone="muted"
            />
            <DetailTile
              icon={<Wallet className="h-4 w-4" />}
              label={t("labels.walletState")}
              value={context.userAddress ? t("states.walletConnected") : t("states.walletRequired")}
              detail={t("hints.walletState")}
              tone={context.userAddress ? "success" : "warning"}
            />
          </div>

          <div className="rounded-[14px] border border-white/10 bg-black/30 p-3 sm:rounded-[16px] sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#eaf1f8]">
                  <ClipboardCheck className="h-4 w-4 text-[#4c8dff]" />
                  {t("sections.primaryAction")}
                </div>
                <p className="mt-1 text-xs font-medium leading-5 text-[#7c8899]">{t("notices.actionPlaceholder")}</p>
              </div>
              <Button type="button" variant="secondary" disabled className="h-10 rounded-xl border-white/15 bg-white/[0.04]">
                <CheckCircle2 className="h-4 w-4" />
                {t("actions.wireAction")}
              </Button>
            </div>
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
      subtitle: localeText(locale, "一个干净的默认 Vault 业务面板；补充最小 ABI、真实读取和主操作后即可作为第一版交付基础。", "A clean default Vault business panel. Add minimal ABI fragments, real reads, and the primary action to turn it into a first delivery build."),
      "badges.defaultShell": localeText(locale, "默认结构", "Default shell"),
      "sections.mechanism": localeText(locale, "Vault 机制", "Vault mechanism"),
      "sections.primaryAction": localeText(locale, "主操作", "Primary action"),
      "flow.context": localeText(locale, "上下文", "Context"),
      "flow.contextDetail": localeText(locale, "链 / Token / Vault", "Chain / token / Vault"),
      "flow.reads": localeText(locale, "读取", "Reads"),
      "flow.readsDetail": localeText(locale, "Vault 状态", "Vault state"),
      "flow.actions": localeText(locale, "操作", "Actions"),
      "flow.actionsDetail": localeText(locale, "阶段门控", "Stage gated"),
      "flow.description": localeText(
        locale,
        "默认布局先把机制、合约风险、市场阶段和运行时目标放清楚，再把具体指标和主操作接入同一张业务卡片。",
        "The default layout explains the mechanism, contract risk, market phase, and runtime targets first, then leaves room for concrete metrics and the primary action in the same business card.",
      ),
      "labels.chain": localeText(locale, "链", "Chain"),
      "labels.factory": localeText(locale, "Factory", "Factory"),
      "labels.vault": localeText(locale, "Vault", "Vault"),
      "labels.token": localeText(locale, "Token", "Token"),
      "labels.user": localeText(locale, "用户", "User"),
      "labels.primaryMetric": localeText(locale, "核心指标", "Primary metric"),
      "labels.walletState": localeText(locale, "钱包状态", "Wallet state"),
      "labels.riskStatus": localeText(locale, "合约风险状态", "Contract risk status"),
      "labels.marketPhase": localeText(locale, "市场阶段", "Market phase"),
      "labels.runtimeChain": localeText(locale, "运行时链", "Runtime chain"),
      "labels.hostRisk": localeText(locale, "Host 风险状态", "Host risk status"),
      "actions.wireAction": localeText(locale, "接入真实操作", "Wire real action"),
      "hints.primaryMetric": localeText(locale, "接入 Vault 读取后替换为真实数值。", "Replace this with real data after wiring Vault reads."),
      "hints.walletState": localeText(locale, "写操作前请同时处理连接钱包、错误网络和阶段门控。", "Before writes, handle wallet connection, wrong network, and phase gating."),
      "states.awaitingReads": localeText(locale, "等待接入", "Awaiting reads"),
      "states.walletConnected": localeText(locale, "已连接", "Connected"),
      "states.walletRequired": localeText(locale, "未连接", "Not connected"),
      "states.riskMissing": localeText(locale, "缺少风险状态", "Risk status missing"),
      "states.riskUnverified": localeText(locale, "未验证", "Unverified"),
      "states.riskLow": localeText(locale, "低风险", "Low risk"),
      "states.riskLowMedium": localeText(locale, "中低风险", "Low-medium risk"),
      "states.riskMedium": localeText(locale, "中风险", "Medium risk"),
      "states.riskHigh": localeText(locale, "高风险", "High risk"),
      "states.marketPhaseInternal": localeText(locale, "内盘阶段", "Internal market"),
      "states.marketPhaseDexListed": localeText(locale, "已 Listing", "DEX listed"),
      "states.marketPhaseUnknown": localeText(locale, "未知阶段", "Unknown phase"),
      "notices.defaultScope": localeText(
        locale,
        "保留这张卡片的密度和层级：少量核心数字、明确状态、一个主操作区；不要重建上方 Token 头部。",
        "Keep this card density and hierarchy: a few core numbers, clear status, and one primary action area; do not rebuild the host token header.",
      ),
      "notices.riskMissing": localeText(
        locale,
        "必须接入当前合约风险状态后才能交付这个 Vault UI；请使用 host Vault/TaxInfo context 读取 riskLevel，并在界面中显著展示。",
        "This Vault UI must integrate the current contract risk status before delivery; read riskLevel from host Vault/TaxInfo context and display it prominently.",
      ),
      "notices.actionPlaceholder": localeText(
        locale,
        "这里应替换为真实 approve / simulate / write / refetch 流程；阶段不匹配时保持可见并说明原因。",
        "Replace this with the real approve / simulate / write / refetch flow; keep it visible with a reason when the phase does not match.",
      ),
      "notices.nextStep": localeText(
        locale,
        "下一步：补充最小 VaultABI，接入真实读取和主操作，然后运行 vault:check、vault:package、vault:verify-package。",
        "Next: add minimal VaultABI fragments, wire real reads and the primary action, then run vault:check, vault:package, and vault:verify-package.",
      ),
    };
  }
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function manifestSource({ artifactId, name, bindings, locales }) {
  const matchBindings = bindings.map((binding) => {
    const entry = { chainId: binding.chainId };
    if (binding.factoryAddress) entry.factoryAddress = binding.factoryAddress;
    if (binding.vaultAddresses?.length) entry.vaultAddresses = binding.vaultAddresses;
    if (binding.tokenAddresses?.length) entry.tokenAddresses = binding.tokenAddresses;
    return entry;
  });
  const match = { bindings: matchBindings };
  return `${JSON.stringify({ artifactId, name, match, i18n: locales }, null, 2)}\n`;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const folderName = parsed._[0];
  const dryRun = collectBoolean(parsed, "dry-run", false);
  const force = collectBoolean(parsed, "force", false);

  if (!folderName) {
    fail(
      "Usage: yarn vault:scaffold <folder-name> --chain 56 --factory 0xMainnetFactory --token 0xReal7777TestToken or --chain 56 --vault 0x... --token 0xReal7777TestToken [--name \"My Vault UI\"] [--locales en,zh] [--artifact-id vaultui_<folder-name>_<ulid>]",
      {
        code: "cli/missing-folder-name",
        fixHint:
          "Provide a lowercase kebab-case folder name, a real binding target, and a real deployed ERC20 manifest test token ending in 7777. Example: yarn vault:scaffold my-vault --chain 56 --factory 0xMainnetFactory --token 0xReal7777TestToken.",
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
      fixHint: "Pass --chain 56 --factory 0x... --token 0x... for factory-scoped UI, or --chain 56 --vault 0x... --token 0x... for single-Vault UI.",
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
  if (parsed["restrict-token"] !== undefined) {
    fail("Global token restriction flags are not accepted in the public manifest.", {
      code: "manifest-binding/ca-policy-not-in-manifest",
      fixHint: "Remove --restrict-token. Use match.bindings[].tokenAddresses only for the required manifest test token or no-factory token-scoped bindings. Production CA restriction belongs in Workbench/registry caRestrictionMode configuration.",
      tokenCount: tokenValues.length,
    });
  }
  if (tokenValues.length === 0) {
    fail("At least one --token address is required so manifest.json carries a Workbench/vault:e2e test token.", {
      code: "manifest-binding/missing-test-token",
      fixHint: "Pass at least one --token 0xReal7777TestToken. It must be a real deployed ERC20 address ending in 7777. For production, still provide the final real mainnet factory with --chain 56 --factory 0xMainnetFactory; do not use random mainnet token CAs as production restrictions.",
      chainCount: chainValues.length,
    });
  }
  if (tokenValues.length > chainValues.length) {
    fail(`--token count must not exceed --chain count: got ${chainValues.length} chain(s) and ${tokenValues.length} token address(es).`, {
      code: "manifest-binding/chain-token-count-mismatch",
      fixHint: "Provide at most one --token per --chain in the same order. Prefer putting the testnet binding first when only the testnet token is ready, then add the final mainnet factory binding without treating the test token as a production CA restriction.",
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
  for (const address of allAddresses) {
    const label = placeholderAddressLabel(address);
    if (label) {
      fail(`Invalid placeholder address: ${address}`, {
        code: "manifest-binding/placeholder-address",
        fixHint: "Replace the template placeholder with a real deployment address. If the factory or Vault is not deployed yet, do not scaffold a publishable binding yet.",
        address,
        placeholder: label,
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
        fixHint: "Use a real deployed Vault or test token address. At least one real 7777-suffix token address is required in manifest tokenAddresses for package proof.",
        address,
      });
    }
  }
  for (const address of tokenValues) {
    if (!hasRequiredTestTokenSuffix(address)) {
      fail(`Invalid test token address: ${address}`, {
        code: "manifest-binding/invalid-test-token-suffix",
        fixHint: `Use a real deployed ERC20 test token address ending in ${REQUIRED_TEST_TOKEN_SUFFIX}. Non-${REQUIRED_TEST_TOKEN_SUFFIX} token addresses are not accepted as package proof.`,
        address,
        requiredSuffix: REQUIRED_TEST_TOKEN_SUFFIX,
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

  for (const [index, tokenAddress] of tokenValues.entries()) {
    const chainId = chainValues[index];
    const result = await validateErc20TokenContract(chainId, tokenAddress);
    if (!result.ok) {
      fail(`Invalid ERC20 token address for chain ${chainId}: ${tokenAddress}`, {
        code: "manifest-binding/invalid-erc20-token",
        fixHint: "Use a real deployed ERC20 token contract on the declared chain, then rerun vault:scaffold.",
        chainId,
        tokenAddress,
        tokenContract: result,
      });
    }
  }

  const bindings = chainValues.map((chainId, index) => {
    const tokenAddress = tokenValues[index];
    const entry = {
      chainId,
      factoryAddress: factoryValues[index],
      vaultAddresses: vaultValues[index] ? [vaultValues[index]] : [],
    };
    if (tokenAddress) {
      entry.tokenAddresses = [tokenAddress];
    }
    return entry;
  });

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

await main();
