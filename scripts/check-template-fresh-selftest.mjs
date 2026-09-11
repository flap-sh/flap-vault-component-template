#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(new URL("./check-template-fresh.mjs", import.meta.url));
const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flap-template-freshness-"));
const origin = path.join(tempRoot, "origin.git");
const seed = path.join(tempRoot, "seed");
const developer = path.join(tempRoot, "developer");
const npmDeveloper = path.join(tempRoot, "npm-developer");
const publisher = path.join(tempRoot, "publisher");
const npmSyncHelper = path.join(tempRoot, "npm-sync-helper.mjs");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commit(cwd, message) {
  git(cwd, ["add", "."]);
  git(cwd, ["-c", "user.name=Flap Selftest", "-c", "user.email=selftest@flap.local", "commit", "-m", message]);
}

function runSync() {
  return spawnSync(process.execPath, [scriptPath, "example", "--sync", "--git-only"], {
    cwd: developer,
    encoding: "utf8",
    env: { ...process.env, FLAP_TEMPLATE_FRESHNESS_REF: "origin/main" },
  });
}

function runNpmSync(cwd, version, gitHead) {
  return spawnSync(process.execPath, [npmSyncHelper, version, gitHead], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FLAP_TEMPLATE_FRESHNESS_REF: "origin/main" },
  });
}

try {
  const packageCommand = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).scripts?.["vault:package"];
  assert.equal(packageCommand, "node scripts/check-template-fresh.mjs --sync --quiet && node scripts/vault-package.mjs");

  fs.writeFileSync(
    npmSyncHelper,
    `import { assertNpmPackageFresh } from ${JSON.stringify(pathToFileURL(scriptPath).href)};\n` +
      `const result = await assertNpmPackageFresh({\n` +
      `  autoUpdate: true,\n` +
      `  readLatestMetadata: async () => ({ version: process.argv[2], gitHead: process.argv[3] }),\n` +
      `  syncAttempts: 1,\n` +
      `  syncDelayMs: 0,\n` +
      `});\n` +
      `console.log(JSON.stringify(result));\n`,
  );

  git(tempRoot, ["init", "--bare", origin]);
  fs.mkdirSync(seed);
  git(seed, ["init", "-b", "main"]);
  fs.writeFileSync(path.join(seed, "template.txt"), "template v1\n");
  fs.writeFileSync(path.join(seed, "vault.txt"), "vault v1\n");
  fs.writeFileSync(path.join(seed, "package.json"), `${JSON.stringify({ name: "freshness-fixture", version: "0.1.0" }, null, 2)}\n`);
  commit(seed, "initial");
  git(seed, ["remote", "add", "origin", origin]);
  git(seed, ["push", "-u", "origin", "main"]);
  git(tempRoot, ["--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main"]);
  git(tempRoot, ["clone", origin, developer]);
  git(tempRoot, ["clone", origin, npmDeveloper]);
  git(tempRoot, ["clone", origin, publisher]);

  fs.writeFileSync(path.join(developer, "vault.txt"), "developer vault work\n");
  fs.writeFileSync(path.join(publisher, "template.txt"), "template v2\n");
  fs.writeFileSync(path.join(publisher, "package.json"), `${JSON.stringify({ name: "freshness-fixture", version: "0.1.1" }, null, 2)}\n`);
  commit(publisher, "publish v2");
  git(publisher, ["push", "origin", "main"]);

  const publishedHead = git(publisher, ["rev-parse", "HEAD"]);
  const npmSynced = runNpmSync(npmDeveloper, "0.1.1", publishedHead);
  assert.equal(npmSynced.status, 0, npmSynced.stderr || npmSynced.stdout);
  const npmSyncedResult = JSON.parse(npmSynced.stdout);
  assert.equal(npmSyncedResult.status, "up-to-date");
  assert.equal(npmSyncedResult.gitSync.status, "updated");
  assert.equal(git(npmDeveloper, ["rev-parse", "HEAD"]), publishedHead);

  const releasePending = runNpmSync(npmDeveloper, "0.1.2", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.notEqual(releasePending.status, 0);
  const releasePendingResult = JSON.parse(releasePending.stderr);
  assert.equal(releasePendingResult.code, "template-freshness/npm-outdated");
  assert.equal(releasePendingResult.releaseSyncPending, true);

  const updated = runSync();
  assert.equal(updated.status, 0, updated.stderr || updated.stdout);
  const updatedResult = JSON.parse(updated.stdout);
  assert.equal(updatedResult.checks.git.status, "updated");
  assert.equal(git(developer, ["rev-parse", "HEAD"]), git(developer, ["rev-parse", "origin/main"]));
  assert.equal(fs.readFileSync(path.join(developer, "vault.txt"), "utf8"), "developer vault work\n");

  fs.writeFileSync(path.join(developer, "template.txt"), "developer conflicting work\n");
  fs.writeFileSync(path.join(publisher, "template.txt"), "template v3\n");
  commit(publisher, "publish v3");
  git(publisher, ["push", "origin", "main"]);

  const blocked = runSync();
  assert.notEqual(blocked.status, 0);
  const blockedResult = JSON.parse(blocked.stderr);
  assert.equal(blockedResult.code, "template-freshness/auto-update-failed");
  assert.equal(fs.readFileSync(path.join(developer, "template.txt"), "utf8"), "developer conflicting work\n");
  assert.notEqual(git(developer, ["rev-parse", "HEAD"]), git(developer, ["rev-parse", "origin/main"]));

  console.log(
    JSON.stringify(
      {
        ok: true,
        passed: [
          "vault:package runs freshness sync before the package script",
          "npm-ahead race re-fetches origin/main before blocking packaging",
          "unpublished npm source provenance is reported as upstream release synchronization",
          "behind checkout fast-forwards before packaging",
          "non-conflicting Vault source edits are preserved",
          "conflicting local work blocks automatic update without changing HEAD",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
