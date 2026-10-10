import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isStandaloneApp } from "./standalone-app.mjs";

export function templateReleasePolicy(env = process.env) {
  const channel = env.FLAP_TEMPLATE_CHANNEL?.trim() || "latest";
  if (!["latest", "next"].includes(channel)) throw new Error("FLAP_TEMPLATE_CHANNEL must be latest or next.");
  const officialRef = env.FLAP_TEMPLATE_FRESHNESS_REF?.trim() || (channel === "next" ? "origin/feat/mini-app-v2" : "origin/main");
  const packageName = env.FLAP_TEMPLATE_NPM_PACKAGE?.trim() || "@flapsdk/vault-runtime";
  if (channel === "next" && (!/^[a-zA-Z0-9_-]+\/(?:feat\/mini-app-v2|next)$/.test(officialRef) || packageName !== "@flapsdk/vault-runtime")) {
    throw new Error("The next channel requires the official feat/mini-app-v2 or next ref and @flapsdk/vault-runtime.");
  }
  return { channel, npmTag: channel, officialRef, packageName };
}

export function assertOfficialPreviewRemote(remoteUrl) {
  const url = remoteUrl?.replace(/\.git$/, "");
  if (!["https://github.com/flap-sh/flap-vault-component-template", "git@github.com:flap-sh/flap-vault-component-template", "ssh://git@github.com/flap-sh/flap-vault-component-template"].includes(url)) {
    throw new Error("The next channel must fetch flap-sh/flap-vault-component-template, not a fork or local ref.");
  }
}

export function assertPreviewTemplate(root, folderName) {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (!/^\d+\.\d+\.\d+-next\.\d+$/.test(version)) throw new Error("The next template requires a committed version such as 0.1.36-next.0.");
  if (folderName !== undefined) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folderName)) throw new Error("Use a valid standalone App folder name.");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "src/vaults", folderName, "manifest.json"), "utf8"));
    if (!isStandaloneApp(manifest)) throw new Error("The next source-package channel is limited to standalone Mini App v2. Legacy packages retain main/latest.");
  }
}

// Template authoring tools come from the current official branch, independently
// of the published runtime. Keep build inputs and the ZIP/E2E protocol pinned.
const PUBLISHED_PROTOCOL_SCRIPTS = new Set([
  "scripts/build-runtime-package.mjs",
  "scripts/runtime-package-mode.mjs",
  "scripts/vault-package.mjs",
  "scripts/vault-verify-package.mjs",
  "scripts/e2e-report-utils.mjs",
  "scripts/mini-app-capabilities.mjs",
  "scripts/standalone-app.mjs",
]);

function isDocumentation(file) {
  return file.startsWith("docs/") || file.startsWith("skills/") || /^[^/]+\.md$/.test(file)
    || [".cursorrules", ".windsurfrules", ".github/copilot-instructions.md"].includes(file)
    || file.startsWith(".cursor/rules/");
}

function isAuthoringOnly(file) {
  return isDocumentation(file) || file === "agent-contract.json" || file.startsWith("src/vaults/")
    || (file.startsWith("scripts/") && !PUBLISHED_PROTOCOL_SCRIPTS.has(file));
}

export function assertPreviewPublishedIdentity({ localVersion, publishedVersion, head, publishedHead, root = process.cwd() }) {
  if (!/^\d+\.\d+\.\d+-next\.\d+$/.test(localVersion || "") || localVersion !== publishedVersion
      || !/^[a-f0-9]{40}$/i.test(publishedHead || "") || !/^[a-f0-9]{40}$/i.test(head || "")) {
    throw new Error("Use the exact published npm next version and a verified source commit; an older next package or a private canary cannot be App ZIP provenance.");
  }
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
  const files = (args) => git(args).split("\0").filter(Boolean);
  try {
    if (git(["rev-parse", "HEAD"]).trim() !== head) throw new Error("Template HEAD changed during packaging.");
    git(["merge-base", "--is-ancestor", publishedHead, head]);
  } catch {
    throw new Error("The template must contain the exact source commit published to npm next; unrelated commits cannot supply runtime provenance.");
  }

  const committed = files(["diff", "--name-only", "--no-renames", "-z", publishedHead, head, "--"]);
  const runtimeChanges = committed.filter((file) => !isAuthoringOnly(file));
  if (runtimeChanges.length) {
    throw new Error(`Publish a matching npm next runtime before packaging: runtime source, dependencies, build configuration or package protocol changed (${runtimeChanges.join(", ")}).`);
  }

  // App source/registration and docs may be local work; SDK and tools may not.
  const localChanges = [...files(["diff", "--name-only", "--no-renames", "-z", head, "--"]),
    ...files(["ls-files", "--others", "--exclude-standard", "-z"])];
  const uncommitted = localChanges.filter((file) => !isDocumentation(file) && !file.startsWith("src/vaults/"));
  if (uncommitted.length) {
    throw new Error(`Restore local runtime/tool edits before packaging (${uncommitted.join(", ")}); App source belongs in src/vaults/{slug}.`);
  }
  return { status: head === publishedHead ? "exact-published-commit" : "published-runtime-source", templateGitHead: head, runtimePackageGitHead: publishedHead };
}
