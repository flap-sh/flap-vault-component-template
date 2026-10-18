import assert from "node:assert/strict";
import net from "node:net";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";
import { promisify } from "node:util";
import { spawnPreviewProcess } from "./e2e-preview-process.mjs";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");

test("Tailwind config and the animation plugin load through native TypeScript ESM", async () => {
  await run(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", 'const {default: config}=await import("./tailwind.config.ts"); if(!config.plugins?.length)process.exit(1);'], { cwd: ROOT });
});

test("preview diagnostics preserve bounded output and spawn failure", async () => {
  const preview = spawnPreviewProcess(process.execPath, ["-e", 'process.stdout.write("x".repeat(150000));process.stderr.write("\\npreview stopped\\n");process.exitCode=2;']);
  await once(preview.child, "exit");
  const diagnostic = preview.diagnostics();
  assert.equal(diagnostic.exitCode, 2);
  assert.ok(diagnostic.logs.join("\n").length <= 128 * 1024);
  assert.ok(diagnostic.logs.includes("preview stopped"));
  await preview.stop();

  const missing = spawnPreviewProcess(path.join(tmpdir(), "flap-missing-preview-command"), []);
  await new Promise((resolve) => missing.child.once("error", resolve));
  assert.equal(missing.diagnostics().spawnError, "ENOENT");
  await missing.stop();
});

test("preview stop terminates only its own process group including an uncooperative server", { skip: process.platform === "win32" }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "flap-preview-process-"));
  const childFile = path.join(dir, "server.mjs");
  const parentFile = path.join(dir, "parent.mjs");
  await writeFile(childFile, 'import http from "node:http";process.on("SIGTERM",()=>{});http.createServer((req,res)=>res.end("ready")).listen(0,"127.0.0.1",function(){console.log("PORT="+this.address().port)});');
  await writeFile(parentFile, `import{spawn}from"node:child_process";spawn(process.execPath,[${JSON.stringify(childFile)}],{stdio:"inherit"});setInterval(()=>{},1000);`);
  const preview = spawnPreviewProcess(process.execPath, [parentFile], { graceMs: 50 });
  // A separate preview proves stop does not target all Node/Next processes.
  const unrelated = spawnPreviewProcess(process.execPath, [childFile], { graceMs: 50 });
  const port = async (process) => {
    for (let i = 0; i < 100; i++) {
      const match = process.diagnostics().logs.join("\n").match(/PORT=(\d+)/);
      if (match) return Number(match[1]);
      await sleep(20);
    }
    throw new Error("preview fixture did not become ready");
  };
  try {
    const [ownedPort, unrelatedPort] = await Promise.all([port(preview), port(unrelated)]);
    assert.equal(await (await fetch(`http://127.0.0.1:${ownedPort}`)).text(), "ready");
    await Promise.all([preview.stop(), preview.stop()]);
    await assert.rejects(fetch(`http://127.0.0.1:${ownedPort}`));
    assert.equal(await (await fetch(`http://127.0.0.1:${unrelatedPort}`)).text(), "ready");
  } finally {
    await preview.stop();
    await unrelated.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a source-attestation failure stays blocking JSON and cleans up its owned preview", { skip: process.platform === "win32" }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "flap-preview-attestation-"));
  const folder = "dex-listed-example";
  const state = path.join(dir, "preview-state.json");
  try {
    await mkdir(path.join(dir, "src", "vaults"), { recursive: true });
    await mkdir(path.join(dir, "schemas"));
    await mkdir(path.join(dir, "config"));
    await cp(path.join(ROOT, "src", "vaults", folder), path.join(dir, "src", "vaults", folder), { recursive: true });
    await cp(path.join(ROOT, "schemas", "manifest.schema.json"), path.join(dir, "schemas", "manifest.schema.json"));
    await cp(path.join(ROOT, "config", "mini-app-capability-profiles.json"), path.join(dir, "config", "mini-app-capability-profiles.json"));
    await writeFile(path.join(dir, "yarn"), `#!${process.execPath}\nimport http from "node:http";import fs from "node:fs";const port=Number(process.argv[process.argv.indexOf("-p")+1]);process.on("SIGTERM",()=>{});http.createServer((req,res)=>{res.setHeader("content-type","application/json");res.end(JSON.stringify({componentSha256:"wrong-source"}));}).listen(port,"127.0.0.1",()=>fs.writeFileSync(${JSON.stringify(state)},JSON.stringify({port,pid:process.pid})));\n`, { mode: 0o755 });
    const portProbe = net.createServer();
    await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
    const requestedPort = portProbe.address().port;
    await new Promise((resolve) => portProbe.close(resolve));
    let failure;
    try {
      await run(process.execPath, [path.join(ROOT, "scripts", "vault-e2e.mjs"), folder, "--port", String(requestedPort)], { cwd: dir, env: { ...process.env, PATH: `${dir}:${process.env.PATH || ""}`, VAULT_E2E_BASE_URL: "" }, timeout: 20_000 });
    } catch (error) { failure = error; }
    assert.ok(failure, "mismatched source must never pass E2E");
    assert.equal(failure.code, 1);
    const diagnostic = JSON.parse(failure.stderr);
    assert.equal(diagnostic.code, "vault-e2e/preview-source-mismatch");
    assert.equal(diagnostic.actual, "wrong-source");
    const { port } = JSON.parse(await readFile(state, "utf8"));
    await assert.rejects(fetch(`http://127.0.0.1:${port}`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
