import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { runVaultCheck } from "./vault-check.mjs";

test("shared CopyButton passes the full checker in Vault UI and standalone App; raw copy stays blocked", () => {
  const folder = `copy-check-${process.pid}`;
  const dir = path.join(process.cwd(), "src/vaults", folder);
  const old = process.env.VAULT_CHECK_SKIP_REGISTRATION;
  process.env.VAULT_CHECK_SKIP_REGISTRATION = "1";
  fs.mkdirSync(dir, { recursive: true });
  try {
    const manifest = { artifactId: `vaultui_${folder}_01ARZ3NDEKTSV4RRFFQ69G5FAV`, name: "Copy test", i18n: ["en", "zh", "ko"], match: { bindings: [{ chainId: 56, tokenAddresses: ["0x286184b2660a2822671a33f24c4517f593947777"] }] } };
    fs.writeFileSync(path.join(dir, "VaultABI.ts"), "export const VaultABI = [] as const;");
    fs.writeFileSync(path.join(dir, "i18n.json"), JSON.stringify({ en: { copy: "Copy", risk: "Risk status unavailable" }, zh: { copy: "复制", risk: "风险状态不可用" }, ko: { copy: "복사", risk: "위험 상태를 확인할 수 없습니다" } }));
    const vaultSource = `import { useFlapSdk, readTaxVaultHostContext } from "@/src/sdk"; import { CopyButton, Alert, StatusBadge } from "@/src/ui";
export default function Component() { const { context, i18n } = useFlapSdk(); const host = readTaxVaultHostContext(context.host); const riskLevel = host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel;
return <main className="min-h-screen"><StatusBadge>{riskLevel}</StatusBadge>{riskLevel === undefined ? <Alert tone="warning">{i18n.t("risk")}</Alert> : null}<CopyButton value={context.tokenAddress} label={i18n.t("copy")} /></main>; }`;
    const appSource = `import { useMiniAppSdk } from "@/src/sdk"; import { CopyButton as CopyAddress } from "@/src/ui"; export default function Component() { const { i18n, session } = useMiniAppSdk(); return <main className="min-h-screen"><CopyAddress value={session.address || ""} label={i18n.t("copy")} /></main>; }`;
    for (const [mode, source] of [["vault", vaultSource], ["app", appSource]]) {
      const m = mode === "app" ? { ...manifest, schemaVersion: 2, mode: "mini-app", appModel: "standalone", slug: folder, displayTitle: { en: "Copy test", zh: "复制测试" }, match: { bindings: [] } } : manifest;
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(m));
      fs.writeFileSync(path.join(dir, "Component.tsx"), source);
      let result = runVaultCheck(folder, { silent: true });
      assert.equal(result.summary.blocking, 0, JSON.stringify(result.issues));
      fs.writeFileSync(path.join(dir, "Component.tsx"), source + '\nconst copy = () => navigator.clipboard.writeText("x");');
      result = runVaultCheck(folder, { silent: true });
      assert.ok(result.issues.some((issue) => issue.ruleId === "forbidden-api/clipboard" && issue.severity === "blocking"));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    if (old === undefined) delete process.env.VAULT_CHECK_SKIP_REGISTRATION; else process.env.VAULT_CHECK_SKIP_REGISTRATION = old;
  }
});
