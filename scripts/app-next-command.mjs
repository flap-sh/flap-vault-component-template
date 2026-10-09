#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { assertPreviewTemplate } from "./template-release-channel.mjs";
import { failAgent } from "./agent-error.mjs";

const [command, ...args] = process.argv.slice(2);
const scripts = { check: "vault-check.mjs", e2e: "vault-e2e.mjs", package: "vault-package.mjs", verify: "vault-verify-package.mjs", runtime: "build-runtime-package.mjs" };
if (!(command in scripts) && command !== "build") failAgent({ code: "app-preview/command", message: "Unknown App preview command.", fixHint: "Use app:check, app:e2e, app:package, app:verify-package, app:build or runtime:package:next." });
if ((["build", "runtime"].includes(command) && args.length) || (!["build", "runtime"].includes(command) && (args.length !== 1 || args[0].startsWith("--")))) {
  failAgent({ code: "app-preview/arguments", message: "Supply one App folder (or ZIP for verify); build/runtime accept no arguments.", fixHint: "Follow docs/mini-app-v2-quickstart.md." });
}
try { assertPreviewTemplate(process.cwd(), ["check", "e2e", "package"].includes(command) ? args[0] : undefined); }
catch (error) { failAgent({ code: "app-preview/target", message: error.message, fixHint: "Use a standalone App v2 scaffold from the official preview branch. Legacy packages use main/latest." }); }
const env = { ...process.env, FLAP_TEMPLATE_CHANNEL: "next", ...(command === "runtime" && !process.env.FLAP_TEMPLATE_FRESHNESS_REF ? { FLAP_TEMPLATE_FRESHNESS_REF: "origin/next" } : {}) };
function run(executable, argv) {
  const result = spawnSync(executable, argv, { stdio: "inherit", env });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
if (command === "package" || command === "build") run(process.execPath, ["scripts/check-template-fresh.mjs", ...(command === "package" ? [args[0], "--sync"] : []), "--quiet"]);
if (command === "build") run(process.platform === "win32" ? "yarn.cmd" : "yarn", ["next", "build"]);
else run(process.execPath, [`scripts/${scripts[command]}`, ...args]);
