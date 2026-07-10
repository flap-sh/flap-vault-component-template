#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./check-template-fresh.mjs", import.meta.url));
const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flap-template-freshness-"));
const origin = path.join(tempRoot, "origin.git");
const seed = path.join(tempRoot, "seed");
const developer = path.join(tempRoot, "developer");
const publisher = path.join(tempRoot, "publisher");

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

try {
  const packageCommand = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).scripts?.["vault:package"];
  assert.equal(packageCommand, "node scripts/check-template-fresh.mjs --sync --git-only --quiet && node scripts/vault-package.mjs");

  git(tempRoot, ["init", "--bare", origin]);
  fs.mkdirSync(seed);
  git(seed, ["init", "-b", "main"]);
  fs.writeFileSync(path.join(seed, "template.txt"), "template v1\n");
  fs.writeFileSync(path.join(seed, "vault.txt"), "vault v1\n");
  commit(seed, "initial");
  git(seed, ["remote", "add", "origin", origin]);
  git(seed, ["push", "-u", "origin", "main"]);
  git(tempRoot, ["--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main"]);
  git(tempRoot, ["clone", origin, developer]);
  git(tempRoot, ["clone", origin, publisher]);

  fs.writeFileSync(path.join(developer, "vault.txt"), "developer vault work\n");
  fs.writeFileSync(path.join(publisher, "template.txt"), "template v2\n");
  commit(publisher, "publish v2");
  git(publisher, ["push", "origin", "main"]);

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
