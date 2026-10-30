import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROUTING_VERSION_PATTERN, assertRuntimeReleaseChannel } from "./runtime-package-mode.mjs";
import { isStandaloneApp } from "./standalone-app.mjs";

export function templateReleasePolicy(env = process.env) {
  const channel = env.FLAP_TEMPLATE_CHANNEL?.trim() || "latest";
  if (!["latest", "next", "routing"].includes(channel)) throw new Error("FLAP_TEMPLATE_CHANNEL must be latest, next or routing.");
  const officialRef = env.FLAP_TEMPLATE_FRESHNESS_REF?.trim() || (channel === "routing" ? "origin/feat/mini-app-routing" : channel === "next" ? "origin/next" : "origin/main");
  const packageName = env.FLAP_TEMPLATE_NPM_PACKAGE?.trim() || "@flapsdk/vault-runtime";
  if (channel === "next" && (!/^[a-zA-Z0-9_-]+\/(?:feat\/mini-app-v2|next)$/.test(officialRef) || packageName !== "@flapsdk/vault-runtime")) {
    throw new Error("The next channel requires the official feat/mini-app-v2 or next ref and @flapsdk/vault-runtime.");
  }
  if (channel === "routing" && (!/^[a-zA-Z0-9_-]+\/feat\/mini-app-routing$/.test(officialRef) || packageName !== "@flapsdk/vault-runtime" || !["runtime", "app"].includes(env.FLAP_TEMPLATE_WORKFLOW))) {
    throw new Error("The routing channel requires an explicit App or runtime workflow, the official feat/mini-app-routing ref and @flapsdk/vault-runtime.");
  }
  return { channel, npmTag: channel, officialRef, packageName };
}

export function assertOfficialTemplateRemote(remoteUrl) {
  const url = remoteUrl?.replace(/\.git$/, "");
  if (!["https://github.com/flap-sh/flap-vault-component-template", "git@github.com:flap-sh/flap-vault-component-template", "ssh://git@github.com/flap-sh/flap-vault-component-template"].includes(url)) {
    throw new Error("Release commands must fetch flap-sh/flap-vault-component-template, not a fork or local ref.");
  }
}

// Retain the preview helper for explicitly authorized next runtime releases.
export const assertOfficialPreviewRemote = assertOfficialTemplateRemote;

export function assertAppReleasePolicy(env = process.env) {
  const policy = templateReleasePolicy(env);
  if (policy.channel === "routing" && env.FLAP_TEMPLATE_WORKFLOW === "app") return policy;
  if (policy.channel !== "latest" || !/^[a-zA-Z0-9_-]+\/main$/.test(policy.officialRef) || policy.packageName !== "@flapsdk/vault-runtime") {
    throw new Error("App commands require the official main ref and @flapsdk/vault-runtime on latest.");
  }
  return policy;
}

export function isStandaloneTarget(root, folderName) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folderName || "")) return false;
  try { return isStandaloneApp(JSON.parse(fs.readFileSync(path.join(root, "src/vaults", folderName, "manifest.json"), "utf8"))); }
  catch { return false; }
}

export function assertAppTemplate(root, folderName, env = process.env) {
  if (env.FLAP_TEMPLATE_CHANNEL?.trim() === "routing") {
    assertAppReleasePolicy(env);
    const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    if (!ROUTING_VERSION_PATTERN.test(version || "")) throw new Error("Routing App commands require a published beta.routing template version; next and private canaries are not App source provenance.");
    if (folderName !== undefined && !isStandaloneTarget(root, folderName)) throw new Error("Routing App source packages accept standalone Mini App v2 only (format 7), never Vault UI or token-bound Apps.");
    return;
  }
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version || "")) {
    throw new Error("App commands require a committed stable template version such as 0.1.38 from main/latest.");
  }
  if (folderName !== undefined && !isStandaloneTarget(root, folderName)) {
    throw new Error("App commands require a valid standalone Mini App v2 folder and manifest. Vault UI and existing token-bound Apps use vault:*.");
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

export function assertRoutingTemplate(root, folderName, env = process.env) {
  const policy = templateReleasePolicy(env);
  if (policy.channel !== "routing" || env.FLAP_TEMPLATE_WORKFLOW !== "runtime" || folderName !== undefined) throw new Error("Routing Runtime packaging requires workflow=runtime and no App folder; use the explicit routing App workflow for standalone source ZIPs.");
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assertRuntimeReleaseChannel(version, "routing");
  return policy;
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

export function assertPublishedRuntimeIdentity({ localVersion, publishedVersion, head, publishedHead, root = process.cwd(), channel = "latest" }) {
  const versionPattern = channel === "routing" ? ROUTING_VERSION_PATTERN : channel === "next" ? /^\d+\.\d+\.\d+-next\.\d+$/ : /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  if (!["latest", "next", "routing"].includes(channel) || !versionPattern.test(localVersion || "") || localVersion !== publishedVersion
      || !/^[a-f0-9]{40}$/i.test(publishedHead || "") || !/^[a-f0-9]{40}$/i.test(head || "")) {
    throw new Error(`Use the exact published npm ${channel} version and a verified source commit; an unpublished version, another channel or a private canary cannot be App ZIP provenance.`);
  }
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
  const files = (args) => git(args).split("\0").filter(Boolean);
  try {
    if (git(["rev-parse", "HEAD"]).trim() !== head) throw new Error("Template HEAD changed during packaging.");
    git(["merge-base", "--is-ancestor", publishedHead, head]);
  } catch {
    throw new Error(`The template must contain the exact source commit published to npm ${channel}; unrelated commits cannot supply runtime provenance.`);
  }

  const committed = files(["diff", "--name-only", "--no-renames", "-z", publishedHead, head, "--"]);
  const runtimeChanges = committed.filter((file) => !isAuthoringOnly(file));
  if (runtimeChanges.length) {
    throw new Error(`Publish a matching npm ${channel} runtime before packaging: runtime source, dependencies, build configuration or package protocol changed (${runtimeChanges.join(", ")}).`);
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

export function assertPreviewPublishedIdentity(input) {
  return assertPublishedRuntimeIdentity({ ...input, channel: "next" });
}
