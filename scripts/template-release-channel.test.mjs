import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
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

function previewRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flap-preview-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), value);
  };
  const commit = (message = "update template") => {
    git(["add", "."]);
    git(["-c", "user.name=Test", "-c", "user.email=test@flap.local", "commit", "-m", message]);
  };
  git(["init", "-b", "feat/mini-app-v2"]);
  write("package.json", JSON.stringify({ version: "0.1.36-next.0" }));
  write("src/sdk/client.ts", "export const version = 1;\n");
  write("docs/development.md", "# Preview\n");
  commit("published runtime");
  const publishedHead = git(["rev-parse", "HEAD"]);
  return { root, git, write, commit, identity: () => ({ root, localVersion: "0.1.36-next.0", publishedVersion: "0.1.36-next.0", head: git(["rev-parse", "HEAD"]), publishedHead }) };
}

test("source ZIP provenance retains the exact published next version and real commit ancestry", (t) => {
  const repo = previewRepository(t);
  assert.equal(assertPreviewPublishedIdentity(repo.identity()).status, "exact-published-commit");
  for (const change of [{ publishedVersion: "0.1.33-next.1" }, { publishedHead: "b".repeat(40) }, { publishedHead: undefined }, { head: "a".repeat(40) }, { localVersion: "0.1.36-next.0.canary.abc" }]) {
    assert.throws(() => assertPreviewPublishedIdentity({ ...repo.identity(), ...change }));
  }
  const identity = repo.identity();
  repo.git(["checkout", "--orphan", "unrelated"]);
  repo.commit("same files, unrelated history");
  assert.throws(() => assertPreviewPublishedIdentity({ ...identity, head: repo.git(["rev-parse", "HEAD"]) }), /must contain/);
});

test("official docs and authoring-tool descendants retain the published runtime identity", (t) => {
  const repo = previewRepository(t);
  repo.write("README.md", "SDK 0.1.36-next.0 is published.\n");
  repo.write("docs/development.zh-CN.md", "已发布。\n");
  repo.commit("docs: update release status");
  repo.git(["mv", "docs/development.md", "docs/quickstart.md"]);
  repo.write("scripts/template-release-channel.mjs", "// updated authoring check\n");
  repo.write("agent-contract.json", '{"version":54}\n');
  repo.commit("update official authoring tools");
  const result = assertPreviewPublishedIdentity(repo.identity());
  assert.equal(result.status, "published-runtime-source");
  assert.equal(result.runtimePackageGitHead, repo.identity().publishedHead);
  assert.equal(result.templateGitHead, repo.identity().head);
});

for (const file of ["src/sdk/client.ts", "src/sdk/README.md", "src/ui/Button.tsx", "yarn.lock", "package.json", "tsup.runtime.config.ts", "tsconfig.runtime-package.json", "schemas/manifest.schema.json", "config/mini-app-capability-profiles.json", "scripts/build-runtime-package.mjs", "scripts/runtime-package-mode.mjs", "scripts/vault-package.mjs", "scripts/vault-verify-package.mjs", "scripts/e2e-report-utils.mjs", "scripts/mini-app-capabilities.mjs", "scripts/standalone-app.mjs", "new-runtime-input.ts"]) {
  test(`a docs commit cannot hide changed runtime/build/protocol input: ${file}`, (t) => {
    const repo = previewRepository(t);
    repo.write(file, "changed\n");
    repo.commit("docs: pretend this is documentation");
    assert.throws(() => assertPreviewPublishedIdentity(repo.identity()), /Publish a matching npm next runtime/);
  });
}

test("runtime deletion and moving runtime code into docs still require a release", (t) => {
  const repo = previewRepository(t);
  repo.git(["mv", "src/sdk/client.ts", "docs/client.ts"]);
  repo.commit("move runtime to docs");
  assert.throws(() => assertPreviewPublishedIdentity(repo.identity()), /src\/sdk\/client.ts/);
});

for (const file of ["src/sdk/client.ts", "src/sdk/new file.ts", "scripts/template-release-channel.mjs", "agent-contract.json", "yarn.lock"]) {
  for (const staged of [false, true]) {
    test(`rejects local ${staged ? "staged" : "unstaged/untracked"} runtime/tool edits: ${file}`, (t) => {
      const repo = previewRepository(t);
      repo.write(file, "local edit\n");
      if (staged) repo.git(["add", file]);
      assert.throws(() => assertPreviewPublishedIdentity(repo.identity()), /Restore local runtime\/tool edits/);
    });
  }
}

test("local App source, preview registration and docs remain allowed", (t) => {
  const repo = previewRepository(t);
  repo.write("src/vaults/my-app/Component.tsx", "export default function App() { return null; }\n");
  repo.write("src/vaults/index.ts", "// register App preview\n");
  repo.write("docs/development.md", "Updated docs\n");
  repo.git(["add", "src/vaults/index.ts"]);
  assert.doesNotThrow(() => assertPreviewPublishedIdentity(repo.identity()));
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
