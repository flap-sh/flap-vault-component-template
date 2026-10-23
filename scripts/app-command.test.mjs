import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const commandFile = fileURLToPath(new URL("./app-command.mjs", import.meta.url));
const manifest = { schemaVersion: 2, mode: "mini-app", appModel: "standalone", slug: "example", match: { bindings: [] } };

function fixture(t, version = "0.1.38") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flap-app-command-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "scripts"));
  fs.mkdirSync(path.join(root, "src/vaults/example"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version }));
  fs.writeFileSync(path.join(root, "src/vaults/example/manifest.json"), JSON.stringify(manifest));
  const report = `console.log(JSON.stringify({file:process.argv[1].split(/[\\\\/]/).pop(),args:process.argv.slice(2),channel:process.env.FLAP_TEMPLATE_CHANNEL,ref:process.env.FLAP_TEMPLATE_FRESHNESS_REF,workflow:process.env.FLAP_TEMPLATE_WORKFLOW}));`;
  for (const file of ["check-template-fresh.mjs", "vault-check.mjs", "vault-e2e.mjs", "vault-package.mjs", "vault-verify-package.mjs", "build-runtime-package.mjs"]) {
    fs.writeFileSync(path.join(root, "scripts", file), report);
  }
  fs.mkdirSync(path.join(root, "bin"));
  fs.writeFileSync(path.join(root, "bin/yarn"), `#!${process.execPath}\n${report}\n`, { mode: 0o755 });
  return { root, run(args, overrides = {}) {
    const env = { ...process.env, PATH: `${path.join(root, "bin")}${path.delimiter}${process.env.PATH}`, FLAP_TEMPLATE_CHANNEL: "next", ...overrides };
    if (!("FLAP_TEMPLATE_FRESHNESS_REF" in overrides)) delete env.FLAP_TEMPLATE_FRESHNESS_REF;
    if (!("FLAP_TEMPLATE_NPM_PACKAGE" in overrides)) delete env.FLAP_TEMPLATE_NPM_PACKAGE;
    return spawnSync(process.execPath, [commandFile, ...args], { cwd: root, env, encoding: "utf8" });
  } };
}

for (const [command, target, script] of [["check", "example", "vault-check.mjs"], ["e2e", "example", "vault-e2e.mjs"], ["package", "example", "vault-package.mjs"], ["verify", "dist/example.zip", "vault-verify-package.mjs"]]) {
  test(`app ${command} dispatches through main/latest even with an inherited next channel`, (t) => {
    const repo = fixture(t);
    const result = repo.run([command, target]);
    assert.equal(result.status, 0, result.stderr);
    const calls = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(calls.at(-1).file, script);
    assert.deepEqual(calls.at(-1).args, [target]);
    for (const call of calls) {
      assert.equal(call.channel, "latest");
      assert.equal(call.ref, "origin/main");
      assert.equal(call.workflow, "app");
    }
    if (command === "package") assert.deepEqual(calls[0], { file: "check-template-fresh.mjs", args: [target, "--sync", "--quiet"], channel: "latest", ref: "origin/main", workflow: "app" });
  });
}

test("app build runs main/latest preflight before invoking Next", { skip: process.platform === "win32" }, (t) => {
  const repo = fixture(t);
  const result = repo.run(["build"]);
  assert.equal(result.status, 0, result.stderr);
  const calls = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(calls[0].file, "check-template-fresh.mjs");
  assert.deepEqual(calls[1].args, ["next", "build"]);
  assert.ok(calls.every((call) => call.channel === "latest" && call.ref === "origin/main"));
});

test("app commands accept official upstream/main and reject preview/local release overrides", (t) => {
  const repo = fixture(t);
  assert.equal(repo.run(["check", "example"], { FLAP_TEMPLATE_FRESHNESS_REF: "upstream/main" }).status, 0);
  for (const ref of ["origin/feat/mini-app-v2", "origin/next", "HEAD", "origin/random"]) {
    const result = repo.run(["check", "example"], { FLAP_TEMPLATE_FRESHNESS_REF: ref });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).code, "app-release/target");
  }
  assert.notEqual(repo.run(["check", "example"], { FLAP_TEMPLATE_NPM_PACKAGE: "other" }).status, 0);
});

test("App commands retain version, model, path and argument checks", (t) => {
  const repo = fixture(t);
  for (const args of [["check"], ["check", "../example"], ["package", "example", "extra"], ["build", "extra"], ["unknown"]]) {
    const result = repo.run(args);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).ok, false);
  }
  fs.writeFileSync(path.join(repo.root, "src/vaults/example/manifest.json"), JSON.stringify({ mode: "mini-app", match: { bindings: [{ chainId: 56 }] } }));
  assert.notEqual(repo.run(["check", "example"]).status, 0);
  const preview = fixture(t, "0.1.40-next.0");
  assert.notEqual(preview.run(["check", "example"]).status, 0);
});

test("explicit next runtime packaging remains isolated and cannot use stable 0.1.38", (t) => {
  const preview = fixture(t, "0.1.40-next.0");
  const result = preview.run(["runtime"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { file: "build-runtime-package.mjs", args: [], channel: "next", ref: "origin/next", workflow: "runtime" });
  assert.notEqual(fixture(t).run(["runtime"]).status, 0);
});
