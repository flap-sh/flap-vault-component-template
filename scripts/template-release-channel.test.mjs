import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertOfficialPreviewRemote, assertPreviewPublishedIdentity, assertPreviewTemplate, templateReleasePolicy } from "./template-release-channel.mjs";

test("stable commands keep main/latest and preview selects the explicit official channel", () => {
  assert.equal(templateReleasePolicy({}).officialRef, "origin/main");
  assert.equal(templateReleasePolicy({}).npmTag, "latest");
  assert.equal(templateReleasePolicy({ FLAP_TEMPLATE_CHANNEL: "next" }).officialRef, "origin/feat/mini-app-v2");
  assert.equal(templateReleasePolicy({ FLAP_TEMPLATE_CHANNEL: "next", FLAP_TEMPLATE_FRESHNESS_REF: "upstream/next" }).npmTag, "next");
  for (const ref of ["HEAD", "origin/main", "origin/random", "origin/feat/mini-app-v2/extra"]) assert.throws(() => templateReleasePolicy({ FLAP_TEMPLATE_CHANNEL: "next", FLAP_TEMPLATE_FRESHNESS_REF: ref }));
  assert.throws(() => templateReleasePolicy({ FLAP_TEMPLATE_CHANNEL: "beta" }));
  assert.throws(() => templateReleasePolicy({ FLAP_TEMPLATE_CHANNEL: "next", FLAP_TEMPLATE_NPM_PACKAGE: "other" }));
});

test("preview refuses forks, local refs, URL credentials and lookalike origins", () => {
  for (const url of ["https://github.com/flap-sh/flap-vault-component-template.git", "git@github.com:flap-sh/flap-vault-component-template.git", "ssh://git@github.com/flap-sh/flap-vault-component-template.git"]) assert.doesNotThrow(() => assertOfficialPreviewRemote(url));
  for (const url of ["https://github.com/0x-sen/flap-vault-component-template.git", "/tmp/repo.git", "https://github.com.evil/flap-sh/flap-vault-component-template", "https://user@github.com/flap-sh/flap-vault-component-template", undefined]) assert.throws(() => assertOfficialPreviewRemote(url));
});

test("source ZIP provenance must equal the published next version and exact commit", () => {
  const identity = { localVersion: "0.1.33-next.0", publishedVersion: "0.1.33-next.0", head: "a".repeat(40), publishedHead: "a".repeat(40) };
  assert.doesNotThrow(() => assertPreviewPublishedIdentity(identity));
  for (const change of [{ publishedVersion: "0.1.32-next.1" }, { publishedHead: "b".repeat(40) }, { publishedHead: undefined }, { localVersion: "0.1.33-next.0.canary.abc" }]) assert.throws(() => assertPreviewPublishedIdentity({ ...identity, ...change }));
});

test("next source packaging accepts standalone apps and rejects legacy packages", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flap-app-channel-"));
  try {
    fs.mkdirSync(path.join(root, "src/vaults/example"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "0.1.33-next.0" }));
    fs.writeFileSync(path.join(root, "src/vaults/example/manifest.json"), JSON.stringify({ schemaVersion: 2, mode: "mini-app", appModel: "standalone", slug: "example", match: { bindings: [] } }));
    assert.doesNotThrow(() => assertPreviewTemplate(root, "example"));
    assert.throws(() => assertPreviewTemplate(root, "../example"));
    fs.writeFileSync(path.join(root, "src/vaults/example/manifest.json"), JSON.stringify({ mode: "mini-app", match: { bindings: [{ chainId: 56 }] } }));
    assert.throws(() => assertPreviewTemplate(root, "example"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "0.1.32" }));
    assert.throws(() => assertPreviewTemplate(root));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
