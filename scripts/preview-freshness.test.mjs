import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const freshnessUrl = new URL("./check-template-fresh.mjs", import.meta.url).href;

function fixture(t, { channel = "next", version = "0.1.33-next.0" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flap-channel-freshness-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  git(["init", "-b", channel === "next" ? "feat/mini-app-v2" : "main"]);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version }));
  git(["add", "."]);
  git(["-c", "user.name=Test", "-c", "user.email=test@flap.local", "commit", "-m", "published runtime"]);
  const head = git(["rev-parse", "HEAD"]);
  const helper = path.join(root, "check.mjs");
  fs.writeFileSync(helper, `
import { assertNpmPackageFresh } from ${JSON.stringify(freshnessUrl)};
const metadata = JSON.parse(process.argv[2]);
const tags = [];
const result = await assertNpmPackageFresh({ readLatestMetadata: async (_, tag) => {
  tags.push(tag);
  if (!metadata[tag]) throw new Error("Unavailable metadata for " + tag);
  return metadata[tag];
} });
console.log(JSON.stringify({ ...result, tags }));
`);
  return {
    metadata: { version, gitHead: head },
    run: (metadata) => spawnSync(process.execPath, [helper, JSON.stringify(metadata)], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, FLAP_TEMPLATE_CHANNEL: channel, FLAP_TEMPLATE_FRESHNESS_REF: channel === "next" ? "origin/feat/mini-app-v2" : "origin/main" },
    }),
  };
}

test("next freshness ignores current and future latest releases", (t) => {
  const preview = fixture(t);
  for (const stableVersion of ["0.1.33", "0.2.0", "1.0.0"]) {
    const result = preview.run({ latest: { version: stableVersion, gitHead: "b".repeat(40) }, next: preview.metadata });
    assert.equal(result.status, 0, result.stderr);
    const checked = JSON.parse(result.stdout);
    assert.equal(checked.npmTag, "next");
    assert.equal(checked.latestVersion, preview.metadata.version);
    assert.equal(checked.gitHead.status, "exact-published-commit");
    assert.deepEqual(checked.tags, ["next"]);
  }
});

test("next freshness does not require latest registry metadata", (t) => {
  const preview = fixture(t);
  const result = preview.run({ next: preview.metadata });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).tags, ["next"]);
});

test("next freshness still rejects an outdated preview", (t) => {
  const preview = fixture(t);
  const result = preview.run({ next: { ...preview.metadata, version: "0.1.33-next.1" } });
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stderr).code, "template-freshness/npm-outdated");
});

test("next freshness still fails when its registry metadata is unavailable", (t) => {
  const preview = fixture(t);
  const result = preview.run({ latest: { version: "0.1.32" } });
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stderr).code, "template-freshness/npm-fetch-failed");
});

test("next freshness still rejects an unrelated published commit", (t) => {
  const preview = fixture(t);
  const result = preview.run({ next: { ...preview.metadata, gitHead: "a".repeat(40) } });
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stderr).code, "template-freshness/npm-git-head-mismatch");
});

test("next freshness still rejects malformed published versions", (t) => {
  const preview = fixture(t);
  const result = preview.run({ next: { ...preview.metadata, version: "not-semver" } });
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stderr).code, "template-freshness/invalid-version");
});

test("latest freshness ignores next and retains its version and provenance checks", (t) => {
  const stable = fixture(t, { channel: "latest", version: "0.1.33" });
  const success = stable.run({ latest: stable.metadata, next: { version: "1.0.0-next.0", gitHead: "b".repeat(40) } });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).npmTag, "latest");
  assert.deepEqual(JSON.parse(success.stdout).tags, ["latest"]);
  const latestOnly = stable.run({ latest: stable.metadata });
  assert.equal(latestOnly.status, 0, latestOnly.stderr);
  const outdated = stable.run({ latest: { ...stable.metadata, version: "0.1.34" } });
  assert.notEqual(outdated.status, 0);
  assert.equal(JSON.parse(outdated.stderr).code, "template-freshness/npm-outdated");
  const unrelated = stable.run({ latest: { ...stable.metadata, gitHead: "a".repeat(40) } });
  assert.notEqual(unrelated.status, 0);
  assert.equal(JSON.parse(unrelated.stderr).code, "template-freshness/npm-git-head-mismatch");
});
