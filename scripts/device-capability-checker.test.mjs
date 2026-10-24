import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runVaultCheck } from "./vault-check.mjs";

test("full checker keeps old Vault manifests compatible and checks declared SDK device access", () => {
  const slug = `device-check-${randomBytes(5).toString("hex")}`;
  const dir = path.join(process.cwd(), "src/vaults", slug);
  mkdirSync(dir);
  const priorSkip = process.env.VAULT_CHECK_SKIP_REGISTRATION;
  process.env.VAULT_CHECK_SKIP_REGISTRATION = "1";
  try {
    const manifest = JSON.parse(readFileSync("src/vaults/example/manifest.json", "utf8"));
    manifest.artifactId = `vaultui_${slug}_01HZY7J4S9D0W5XJ8H2Q3K4M5N`;
    const writeManifest = () => writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    writeManifest();
    for (const name of ["i18n.json", "VaultABI.ts", "Component.tsx"]) writeFileSync(path.join(dir, name), readFileSync(`src/vaults/example/${name}`));
    const deviceIssues = () => runVaultCheck(slug, { silent: true }).issues.filter((issue) => issue.ruleId.startsWith("device-policy/") || issue.ruleId.startsWith("runtime-policy/device"));
    assert.deepEqual(deviceIssues(), []);
    const original = readFileSync(path.join(dir, "Component.tsx"), "utf8");
    writeFileSync(path.join(dir, "Component.tsx"), original + '\nimport {useDeviceMotion as useShake} from "@/src/sdk"; function MotionProbe(){return useShake().status;}');
    assert(deviceIssues().some((issue) => issue.ruleId === "device-policy/undeclared-capability"));
    manifest.deviceCapabilities = ["motion"];
    writeManifest();
    assert.deepEqual(deviceIssues(), []);
    const result = runVaultCheck(slug, { silent: true });
    assert(result.issues.some((issue) => issue.ruleId === "manual-review/device-capabilities"));
    assert(!result.issues.some((issue) => issue.ruleId === "manifest-schema/disallowed-field" && issue.field === "deviceCapabilities"));
    writeFileSync(path.join(dir, "Component.tsx"), original + '\nDeviceMotionEvent.requestPermission();');
    assert(runVaultCheck(slug, { silent: true }).issues.some((issue) => issue.ruleId === "forbidden-api/browser-permission"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    if (priorSkip === undefined) delete process.env.VAULT_CHECK_SKIP_REGISTRATION;
    else process.env.VAULT_CHECK_SKIP_REGISTRATION = priorSkip;
  }
});
