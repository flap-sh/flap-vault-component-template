import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { compareSemver } from "./check-template-fresh.mjs";

const freshnessUrl = new URL("./check-template-fresh.mjs", import.meta.url).href;
const version = "0.1.40-beta.routing.0";
function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "flap-routing-freshness-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, "repo"); fs.mkdirSync(root);
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  git(["init", "-b", "feat/mini-app-routing"]);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version }));
  git(["add", "."]); git(["-c", "user.name=Test", "-c", "user.email=test@flap.local", "commit", "-m", "routing fixture"]);
  const head = git(["rev-parse", "HEAD"]);
  git(["remote", "add", "origin", "https://github.com/flap-sh/flap-vault-component-template.git"]);
  git(["update-ref", "refs/remotes/origin/feat/mini-app-routing", head]);
  // Only fetch is mocked; all source identity, clean-tree and ancestry checks
  // below execute real Git against the fixture repository.
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const bin = path.join(temp, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "git"), `#!/bin/sh\nif [ "$1" = "fetch" ]; then exit 0; fi\nexec '${realGit.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
  const source = `globalThis.fetch = async (url) => {
    if (url.endsWith('/routing') || url.endsWith('/${version}')) return new Response('{}', {status:404});
    if (url.endsWith('/dist-tags')) return new Response(JSON.stringify({latest:'0.1.39', next:'0.1.40-next.4'}));
    if (url.endsWith('/latest')) return new Response(JSON.stringify({version:'0.1.39',gitHead:'${head}'}));
    throw new Error('Unexpected registry query '+url);
  }; const {assertTemplateFresh} = await import(${JSON.stringify(freshnessUrl)});
  console.log(JSON.stringify(await assertTemplateFresh(JSON.parse(process.argv[1]))));`;
  return { root, git, run: (options = {}, env = {}) => spawnSync(process.execPath, ["--input-type=module", "-e", source, JSON.stringify(options)], { cwd: root, encoding: "utf8", env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FLAP_TEMPLATE_CHANNEL: "routing", FLAP_TEMPLATE_WORKFLOW: "runtime", FLAP_TEMPLATE_FRESHNESS_REF: "origin/feat/mini-app-routing", ...env } }) };
}

test("beta.routing prereleases sort below the existing next lower bound", () => {
  assert(compareSemver(version, "0.1.40-next.4") < 0);
  assert(compareSemver("0.1.40-routing.0", "0.1.40-next.4") > 0);
});

test("complete routing freshness permits only clean exact official source with verified bootstrap", (t) => {
  const repo = fixture(t);
  const result = repo.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).checks.npm.status, "routing-bootstrap");
  for (const options of [{ includeGit: false }, { includeNpm: false }, { autoUpdate: true }, { folderName: "some-app" }]) {
    const blocked = repo.run(options);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /routing-complete-gate|routing-source/);
  }
  fs.writeFileSync(path.join(repo.root, "uncommitted.txt"), "dirty");
  const dirty = repo.run(); assert.notEqual(dirty.status, 0); assert.match(dirty.stderr, /routing-source/);
});

test("routing freshness rejects forks, arbitrary refs and an ahead source commit", (t) => {
  const repo = fixture(t);
  for (const ref of ["origin/main", "origin/next", "HEAD"]) {
    const blocked = repo.run({}, { FLAP_TEMPLATE_FRESHNESS_REF: ref });
    assert.notEqual(blocked.status, 0); assert.match(blocked.stderr, /invalid-channel/);
  }
  repo.git(["remote", "set-url", "origin", "https://github.com/0x-sen/flap-vault-component-template.git"]);
  const fork = repo.run(); assert.notEqual(fork.status, 0); assert.match(fork.stderr, /routing-source/);
  repo.git(["remote", "set-url", "origin", "https://github.com/flap-sh/flap-vault-component-template.git"]);
  repo.git(["-c", "user.name=Test", "-c", "user.email=test@flap.local", "commit", "--allow-empty", "-m", "ahead source"]);
  const ahead = repo.run(); assert.notEqual(ahead.status, 0); assert.match(ahead.stderr, /template-freshness\/ahead/);
});


function appFixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "flap-routing-app-freshness-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, "repo"); fs.mkdirSync(root);
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  const write = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), value); };
  const commit = () => { git(["add", "."]); git(["-c", "user.name=Test", "-c", "user.email=test@flap.local", "commit", "-m", "fixture source"]); };
  git(["init", "-b", "feat/mini-app-routing"]);
  write("package.json", JSON.stringify({ version })); write("src/sdk/client.ts", "// published SDK\n"); commit();
  const publishedHead = git(["rev-parse", "HEAD"]);
  git(["remote", "add", "origin", "https://github.com/flap-sh/flap-vault-component-template.git"]);
  git(["update-ref", "refs/remotes/origin/feat/mini-app-routing", publishedHead]);
  write("src/vaults/example/manifest.json", JSON.stringify({ schemaVersion: 2, mode: "mini-app", appModel: "standalone", slug: "example", match: { bindings: [] } }));
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const bin = path.join(temp, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "git"), `#!/bin/sh\nif [ "$1" = "fetch" ]; then exit 0; fi\nexec '${realGit.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
  return { root, git, write, commit, publishedHead, run({ options = { folderName: "example" }, metadata = {}, env = {} } = {}) {
    const record = { version, gitHead: publishedHead };
    const source = `const metadata = JSON.parse(process.argv[1]); const queries=[];
    globalThis.fetch=async url=>{queries.push(url);const field=url.endsWith('/routing')?'tag':url.endsWith('/${version}')?'immutable':null;
      if(!field)throw new Error('Unexpected registry endpoint '+url);
      if(metadata[field]===404)return new Response('{}',{status:404});
      if(metadata[field]==='network')throw new TypeError('offline');
      return new Response(JSON.stringify(metadata[field]));};
    const {assertTemplateFresh}=await import(${JSON.stringify(freshnessUrl)});
    console.log(JSON.stringify({...(await assertTemplateFresh(JSON.parse(process.argv[2]))),queries}));`;
    return spawnSync(process.execPath, ["--input-type=module", "-e", source, JSON.stringify({ tag: record, immutable: record, ...metadata }), JSON.stringify(options)], { cwd: root, encoding: "utf8", env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FLAP_TEMPLATE_CHANNEL: "routing", FLAP_TEMPLATE_WORKFLOW: "app", FLAP_TEMPLATE_FRESHNESS_REF: "origin/feat/mini-app-routing", ...env } });
  } };
}

test("routing App freshness requires an existing exact tag and immutable version, never bootstrap/ahead", t => {
  const repo = appFixture(t);
  const success = repo.run(); assert.equal(success.status, 0, success.stderr);
  const checked = JSON.parse(success.stdout);
  assert.equal(checked.checks.npm.latestGitHead, repo.publishedHead); assert.equal(checked.checks.npm.latestVersion, version);
  assert.equal(checked.checks.npm.status, "up-to-date"); assert.equal(checked.queries.length, 2);
  for (const metadata of [{ tag:404 }, { immutable:404 }, { tag:"network" }, { immutable:"network" }, { tag:{version:"0.1.40-beta.routing.1",gitHead:repo.publishedHead} }, { tag:{version:"0.1.39",gitHead:repo.publishedHead} }, { immutable:{version,gitHead:"a".repeat(40)} }, { tag:{version,gitHead:undefined},immutable:{version,gitHead:undefined} }, { tag:{version,gitHead:"a".repeat(40)},immutable:{version,gitHead:"a".repeat(40)} }]) {
    const blocked=repo.run({metadata}); assert.notEqual(blocked.status,0); assert.match(blocked.stderr,/routing-app-registry/);
  }
  for (const options of [{ includeGit:false }, { includeNpm:false }, { autoUpdate:true }]) assert.match(repo.run({options}).stderr,/routing-complete-gate/);
});

test("routing App freshness retains official-ref, standalone and unchanged published runtime gates", t => {
  const repo=appFixture(t);
  for(const versionValue of ["0.1.39","0.1.40-next.4","0.1.40-beta.routing.0.canary.abc"]){repo.write("package.json",JSON.stringify({version:versionValue}));assert.match(repo.run().stderr,/routing-source/);}
  repo.git(["restore","package.json"]);
  repo.write("scripts/app-command.mjs","// uncommitted authoring\n");assert.match(repo.run().stderr,/routing-app-registry/);
  repo.commit();
  assert.match(repo.run().stderr,/template-freshness\/ahead/);
  repo.git(["update-ref","refs/remotes/origin/feat/mini-app-routing",repo.git(["rev-parse","HEAD"])]);
  const descendant=repo.run();assert.equal(descendant.status,0,descendant.stderr);
  assert.equal(JSON.parse(descendant.stdout).checks.npm.latestGitHead,repo.publishedHead);
  repo.write("src/sdk/client.ts","// changed SDK\n");assert.match(repo.run().stderr,/routing-app-registry/);repo.commit();
  repo.git(["update-ref","refs/remotes/origin/feat/mini-app-routing",repo.git(["rev-parse","HEAD"])]);
  assert.match(repo.run().stderr,/matching npm routing runtime/);
});

test("routing App freshness rejects wrong remotes and legacy targets", t=>{
  const repo=appFixture(t);
  repo.git(["remote","set-url","origin","https://github.com/0x-sen/flap-vault-component-template.git"]);assert.match(repo.run().stderr,/routing-source/);
  repo.git(["remote","set-url","origin","https://github.com/flap-sh/flap-vault-component-template.git"]);
  repo.write("src/vaults/example/manifest.json",JSON.stringify({mode:"mini-app",match:{bindings:[{chainId:56}]}}));assert.match(repo.run().stderr,/routing-source/);
});
