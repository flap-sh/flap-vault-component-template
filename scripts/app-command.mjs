#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { assertAppReleasePolicy, assertAppTemplate, assertPreviewTemplate } from "./template-release-channel.mjs";
import { failAgent } from "./agent-error.mjs";

const [command, ...args] = process.argv.slice(2);
const scripts = { check: "vault-check.mjs", e2e: "vault-e2e.mjs", package: "vault-package.mjs", verify: "vault-verify-package.mjs", runtime: "build-runtime-package.mjs" };
if (!(command in scripts) && command !== "build") failAgent({ code: "app-preview/command", message: "Unknown App command.", fixHint: "Use app:check, app:e2e, app:package, app:verify-package, app:build or runtime:package:next." });
if ((["build", "runtime"].includes(command) && args.length) || (!["build", "runtime"].includes(command) && (args.length !== 1 || args[0].startsWith("--")))) {
  failAgent({ code: "app-preview/arguments", message: "Supply one App folder (or ZIP for verify); build/runtime accept no arguments.", fixHint: "Follow docs/mini-app-v2-quickstart.md." });
}
const previewRuntime = command === "runtime";
const routingApp = !previewRuntime && process.env.FLAP_TEMPLATE_CHANNEL?.trim() === "routing";
const env = { ...process.env, FLAP_TEMPLATE_CHANNEL: previewRuntime ? "next" : routingApp ? "routing" : "latest", FLAP_TEMPLATE_WORKFLOW: previewRuntime ? "runtime" : "app",
  ...(!process.env.FLAP_TEMPLATE_FRESHNESS_REF ? { FLAP_TEMPLATE_FRESHNESS_REF: previewRuntime ? "origin/next" : routingApp ? "origin/feat/mini-app-routing" : "origin/main" } : {}) };
try {
  if (previewRuntime) assertPreviewTemplate(process.cwd());
  else {
    assertAppReleasePolicy(env);
    assertAppTemplate(process.cwd(), ["check", "e2e", "package"].includes(command) ? args[0] : undefined, env);
  }
} catch (error) {
  failAgent({ code: "app-release/target", message: error.message, fixHint: "Use official main/latest for stable Apps, or explicitly select routing with its published beta.routing template. Use runtime:package:next only for an authorized next Runtime release." });
}
function run(executable, argv, routingVerify = false) {
  if (routingVerify) {
    // Reuse the complete protected verifier before enforcing this entry point's
    // standalone-only boundary. Do not duplicate ZIP parsing or weaken hashes.
    const result = spawnSync(executable, argv, { stdio: ["inherit", "pipe", "pipe"], encoding: "utf8", env });
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error || result.status !== 0) { if (result.stdout) process.stdout.write(result.stdout); process.exit(result.status || 1); }
    let verified;
    try { verified = JSON.parse(result.stdout); } catch { /* Fail closed on a non-verifier response. */ }
    if (verified?.ok !== true || verified.packageFormatVersion !== 7) failAgent({ code: "app-release/routing-format", message: "Routing App verification accepts verified standalone format-7 source packages only.", fixHint: "Regenerate a standalone Mini App v2 ZIP with the explicit routing App workflow." });
    process.stdout.write(result.stdout);
    return;
  }
  const result = spawnSync(executable, argv, { stdio: "inherit", env });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
if (routingApp || command === "package" || command === "build") run(process.execPath, ["scripts/check-template-fresh.mjs", ...(routingApp ? (["check", "e2e", "package"].includes(command) ? [args[0]] : []) : command === "package" ? [args[0], "--sync"] : []), "--quiet"]);
if (command === "build") run(process.platform === "win32" ? "yarn.cmd" : "yarn", ["next", "build"]);
else run(process.execPath, [`scripts/${scripts[command]}`, ...args], routingApp && command === "verify");
