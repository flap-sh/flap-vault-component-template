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


test("standalone package validation distinguishes copy text from executable source", (t) => {
  const folder = `copy-text-check-${process.pid}`;
  const dir = path.resolve("src/vaults", folder);
  fs.mkdirSync(dir);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const registration = process.env.VAULT_CHECK_SKIP_REGISTRATION;
  process.env.VAULT_CHECK_SKIP_REGISTRATION = "1";
  t.after(() => {
    if (registration === undefined) delete process.env.VAULT_CHECK_SKIP_REGISTRATION;
    else process.env.VAULT_CHECK_SKIP_REGISTRATION = registration;
  });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    artifactId: `vaultui_${folder}_01ARZ3NDEKTSV4RRFFQ69G5FAV`,
    name: "Copy text test", i18n: ["en"], schemaVersion: 2, mode: "mini-app",
    appModel: "standalone", slug: folder, displayTitle: { en: "Copy text test", zh: "复制文本测试" },
    match: { bindings: [] },
  }));
  fs.writeFileSync(path.join(dir, "VaultABI.ts"), "export const VaultABI = [] as const;");
  fs.writeFileSync(path.join(dir, "i18n.json"), JSON.stringify({ en: { copy: "Copy" } }));
  const endpoint = "https://example.invalid/rpc";
  const prompt = `// 使用说明\nconst tool = require("node:assert");\nconst rpc = "${endpoint}";\nconst address = "0x${"a".repeat(40)}";\nconst input = {inputData:encodeValue(), data:item.input};`;
  const literal = `\`${prompt}\``;
  const code = (children, body = "", params = "") => `import { CopyButton as CopyText } from "@/src/ui";
export default function Component(${params}) {
  ${body}
  return <main className="min-h-screen">${children}</main>;
}`;
  const check = (source) => {
    fs.writeFileSync(path.join(dir, "Component.tsx"), source);
    return runVaultCheck(folder, { silent: true });
  };
  const blockingRules = (source) => check(source).issues.filter((item) => item.severity === "blocking").map((item) => item.ruleId);

  for (const value of [literal, `\`${prompt}\nconst argument = \${argument};\``]) {
    const result = check(code(`{argument ? <CopyText value={${value}} /> : null}`, 'const argument = "example";'));
    assert.equal(result.summary.blocking, 0, JSON.stringify(result.issues));
    assert.equal(result.issues.filter((item) => item.ruleId === "manual-review/copy-text" && item.severity === "warning").length, 1);
  }

  const copy = '<CopyText value={prompt} />';
  const promptDeclaration = `const prompt = ${literal};`;
  const unreviewedBuilder = `
export function buildAgentActionScript() {
  const runners = {
    native: "const check = require('node:assert'); const rpc = 'https://bsc-dataseed.bnbchain.org';",
    erc20: "instructions",
    claim: "instructions",
    refund: "instructions",
  };
  return runners.native;
}`;
  const unreviewedRules = blockingRules(code(`<pre>{prompt}</pre>${copy}`, "const prompt = buildAgentActionScript();") + unreviewedBuilder);
  assert.ok(unreviewedRules.includes("imports-and-dependencies/require-call"));
  assert.ok(unreviewedRules.includes("endpoint-policy/undeclared-url"));

  for (const body of [
    promptDeclaration,
    `const argument = JSON.stringify({ item: "example" }); const prompt = \`${prompt}\nconst argument = \${argument};\`;`,
    `const enabled = true; const prompt = enabled ? ${literal} : "No instructions";`,
  ]) {
    const result = check(code(copy, body));
    assert.equal(result.summary.blocking, 0, JSON.stringify(result.issues));
    assert.equal(result.issues.filter((item) => item.ruleId === "manual-review/copy-text" && item.severity === "warning").length, 1);
  }

  for (const source of [
    code(`<CopyText value={${literal}} />`, "", "CopyText: any"),
    code(`<CopyText {...props} value={${literal}} />`, "const props = {};"),
    code(`<CopyText value={${literal}} value="other" />`),
    code(`<a href={${literal}} />`),
    code(`<Wrapper><CopyText value={${literal}} /></Wrapper>`),
    '/* @jsxRuntime classic */\n/* @jsx intercept */\n' + code(`<CopyText value={${literal}} />`),
    code(`<CopyText value={${literal}} />`) + '\nconst copyValue = Component().props.children.props.value;',
    code(`<CopyText value={\`${prompt} \${require("node:assert")}\`} />`),
    code(`<CopyText value={${literal}} />`, 'require("node:assert");'),
    code(copy, `${promptDeclaration} const alias = prompt;`),
    code(copy, `${promptDeclaration} void { prompt };`),
    code(copy, `${promptDeclaration} new Function(prompt);`),
    code(copy, `${promptDeclaration} void import(prompt);`),
    code(`<pre>{prompt}</pre>${copy}`, promptDeclaration),
    code(copy, `${promptDeclaration} void fetch(prompt);`),
    code(`${copy}<a href={prompt} />`, promptDeclaration),
    code(`<Wrapper>${copy}</Wrapper>`, `${promptDeclaration} const Wrapper = ({ children }) => children;`),
    code(copy, promptDeclaration, "CopyText: any"),
    code(copy, `${promptDeclaration} prompt = "Different text";`),
    code(copy, `let prompt = ${literal};`),
  ]) assert.ok(blockingRules(source).includes("imports-and-dependencies/require-call"), source);

  assert.ok(blockingRules(code(`<CopyText value={${literal}} />`, `void fetch("${endpoint}");`)).includes("endpoint-policy/direct-fetch"));
  assert.ok(blockingRules(code('<CopyText value={`Read ${"https:" + "//example.invalid/rpc"}.`} />')).includes("endpoint-policy/undeclared-url"));
  assert.deepEqual(blockingRules(code('<CopyText value="example" />', 'const item = {input: "0x"}; const request = {data: item.input};')), []);
  assert.ok(blockingRules(code(`<CopyText value={\`${prompt}\ndata:text/html,example\`} />`)).includes("endpoint-policy/undeclared-url"));
  assert.ok(blockingRules(code('<CopyText value="example" />', 'const item = {data: "0x"}; const src = "data:text/html,example";')).includes("endpoint-policy/undeclared-url"));
});
