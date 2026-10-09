import fs from "node:fs";
import path from "node:path";
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
  if (!/^\d+\.\d+\.\d+-next\.\d+$/.test(version)) throw new Error("The next template requires a committed version such as 0.1.33-next.0.");
  if (folderName !== undefined) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folderName)) throw new Error("Use a valid standalone App folder name.");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "src/vaults", folderName, "manifest.json"), "utf8"));
    if (!isStandaloneApp(manifest)) throw new Error("The next source-package channel is limited to standalone Mini App v2. Legacy packages retain main/latest.");
  }
}

export function assertPreviewPublishedIdentity({ localVersion, publishedVersion, head, publishedHead }) {
  if (localVersion !== publishedVersion || !/^[a-f0-9]{40}$/i.test(publishedHead || "") || head !== publishedHead) {
    throw new Error("Publish the exact template commit and version to npm next before generating an App source ZIP; an older next package or a private canary cannot be its provenance.");
  }
}
