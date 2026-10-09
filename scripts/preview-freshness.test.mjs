import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const freshnessUrl = new URL("./check-template-fresh.mjs", import.meta.url).href;
test("preview freshness reads next, retains the stable floor, and verifies published ancestry", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flap-preview-freshness-"));
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  try {
    git(["init", "-b", "feat/mini-app-v2"]);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "0.1.32" }));
    git(["add", "."]); git(["-c", "user.name=Test", "-c", "user.email=test@flap.local", "commit", "-m", "stable"]);
    const stableHead = git(["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "0.1.33-next.0" }));
    git(["add", "."]); git(["-c", "user.name=Test", "-c", "user.email=test@flap.local", "commit", "-m", "preview"]);
    const previewHead = git(["rev-parse", "HEAD"]);
    const helper = path.join(root, "check.mjs");
    fs.writeFileSync(helper, `import { assertNpmPackageFresh } from ${JSON.stringify(freshnessUrl)}; const metadata=JSON.parse(process.argv[2]); console.log(JSON.stringify(await assertNpmPackageFresh({readLatestMetadata:async (_,tag)=>metadata[tag]})));`);
    const metadata = { latest: { version: "0.1.32", gitHead: stableHead }, next: { version: "0.1.33-next.0", gitHead: previewHead } };
    function run(values) { return spawnSync(process.execPath, [helper, JSON.stringify(values)], { cwd: root, encoding: "utf8", env: { ...process.env, FLAP_TEMPLATE_CHANNEL: "next", FLAP_TEMPLATE_FRESHNESS_REF: "origin/feat/mini-app-v2" } }); }
    const success = run(metadata);
    assert.equal(success.status, 0, success.stderr);
    assert.equal(JSON.parse(success.stdout).npmTag, "next");
    assert.equal(JSON.parse(success.stdout).latestGitHead, previewHead);
    const futureStable = run({ ...metadata, latest: { ...metadata.latest, version: "0.1.33" } });
    assert.notEqual(futureStable.status, 0);
    assert.equal(JSON.parse(futureStable.stderr).code, "template-freshness/preview-behind-stable");
    const futureNext = run({ ...metadata, next: { ...metadata.next, version: "0.1.33-next.1" } });
    assert.notEqual(futureNext.status, 0);
    assert.equal(JSON.parse(futureNext.stderr).code, "template-freshness/npm-outdated");
    const unrelated = run({ ...metadata, next: { ...metadata.next, gitHead: "a".repeat(40) } });
    assert.notEqual(unrelated.status, 0);
    assert.equal(JSON.parse(unrelated.stderr).code, "template-freshness/npm-git-head-mismatch");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
