import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isStandaloneApp, standaloneReportIssues } from "./standalone-app.mjs";
import { runVaultCheck } from "./vault-check.mjs";
import { selectE2EBinding } from "./e2e-report-utils.mjs";
const app = { schemaVersion: 2, mode: "mini-app", appModel: "standalone", slug: "flap-streets", artifactId: "vaultui_flap-streets_01ARZ3NDEKTSV4RRFFQ69G5FAV", match: { bindings: [] } };
test("new app proof has no CA or chain and all session/viewport checks", () => {
 assert.deepEqual(selectE2EBinding(app), { appModel: "standalone", slug: "flap-streets" });
 const report = { binding: selectE2EBinding(app), checks: ["pc","ipad","h5"].flatMap((viewport) => ["guest","connected"].map((phase) => ({ viewport, phase, session: phase, wrongNetwork: false, passed: true, issues: [] }))) };
 assert.deepEqual(standaloneReportIssues(report, app), []);
 assert.ok(standaloneReportIssues({ ...report, checks: report.checks.slice(1) }, app).length);
 assert.ok(standaloneReportIssues({ ...report, binding: { ...report.binding, tokenAddress: "fake" } }, app).length);
 assert.equal(isStandaloneApp({ ...app, schemaVersion: 3 }), false);
});
test("checker preserves old CA rules and rejects malformed v2 envelopes", () => {
 const folder = `standalone-check-${process.pid}`;
 const dir = path.join(process.cwd(), "src/vaults", folder);
 const sample = path.join(process.cwd(), "src/vaults/standalone-example");
 fs.cpSync(sample, dir, { recursive: true });
 const base = JSON.parse(fs.readFileSync(path.join(sample, "manifest.json")));
 base.artifactId = `vaultui_${folder}_01ARZ3NDEKTSV4RRFFQ69G5FAV`;
 const originalSkip = process.env.VAULT_CHECK_SKIP_REGISTRATION;
 process.env.VAULT_CHECK_SKIP_REGISTRATION = "1";
 try {
   const check = (manifest) => { fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest)); return runVaultCheck(folder, { silent: true }).issues.filter((issue) => issue.severity === "blocking"); };
   assert.deepEqual(check(base), []);
   assert.ok(check({ ...base, schemaVersion: 3 }).some((issue) => issue.ruleId === "manifest-schema/invalid-standalone-app"));
   assert.ok(check({ ...base, match: { bindings: [{ chainId: 56 }] } }).some((issue) => issue.ruleId === "manifest-binding/standalone-has-bindings"));
   const legacy = { ...base }; delete legacy.schemaVersion; delete legacy.appModel; delete legacy.slug;
   assert.ok(check(legacy).some((issue) => issue.ruleId === "manifest-binding/missing-bindings"));
 } finally { fs.rmSync(dir, { recursive: true, force: true }); if (originalSkip === undefined) delete process.env.VAULT_CHECK_SKIP_REGISTRATION; else process.env.VAULT_CHECK_SKIP_REGISTRATION = originalSkip; }
});
