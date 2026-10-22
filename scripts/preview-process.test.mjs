import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import test from "node:test";
import { spawnOwnedPreview } from "./preview-process.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const serverSource = `
  const net = require('node:net');
  process.on('SIGTERM', () => {});
  const server = net.createServer(socket => { socket.on('error', () => {}); socket.end(); });
  server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({pid: process.pid, port: server.address().port})));
`;
const wrapperSource = `
  require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(serverSource)}], {stdio: ['ignore', 'inherit', 'inherit']});
  process.on('SIGTERM', () => process.exit(0));
`;

async function ready(child) {
  let output = "";
  let timer;
  try {
    return await Promise.race([
      new Promise((resolve, reject) => {
        child.once("error", reject);
        child.stdout.on("data", (chunk) => {
          output += chunk;
          if (output.includes("\n")) resolve(JSON.parse(output.split("\n")[0]));
        });
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("fixture did not open its listener")), 4000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
  });
}

async function waitClosed(port) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!(await listening(port))) return;
    await sleep(20);
  }
  assert.fail("owned descendant is still serving after stop");
}

function cleanGroup(child) {
  try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
}

test("stop reaps an exited wrapper's TERM-resistant descendant and inherited pipes without touching another server", { skip: process.platform === "win32", timeout: 10000 }, async (t) => {
  const owned = spawnOwnedPreview(process.execPath, ["-e", wrapperSource], { stdio: ["ignore", "pipe", "pipe"] });
  const sentinel = spawn(process.execPath, ["-e", serverSource], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { cleanGroup(owned.child); sentinel.kill("SIGKILL"); });
  let closed = false;
  owned.child.once("close", () => { closed = true; });
  const descendant = await ready(owned.child);
  const unrelated = await ready(sentinel);
  await owned.stop({ graceMs: 100, killMs: 1500 });
  assert.equal(closed, true, "stop must wait for inherited stdout/stderr to close");
  await waitClosed(descendant.port);
  assert.equal(await listening(unrelated.port), true, "unrelated server must survive");
  await owned.stop();
});

test("stop handles a process that closed before cleanup was requested", { timeout: 5000 }, async () => {
  const owned = spawnOwnedPreview(process.execPath, ["-e", "process.stdout.write('done')"], { stdio: ["ignore", "pipe", "pipe"] });
  owned.child.stdout.resume();
  await once(owned.child, "close");
  await owned.stop({ graceMs: 100, killMs: 100 });
  await owned.stop();
});

test("spawn failure has no PID to signal and cleanup stays bounded", { timeout: 5000 }, async () => {
  const owned = spawnOwnedPreview("flap-preview-command-that-does-not-exist", [], { stdio: ["ignore", "pipe", "pipe"] });
  const [error] = await once(owned.child, "error");
  assert.equal(error.code, "ENOENT");
  await owned.stop({ graceMs: 100, killMs: 100 });
});


test("a normally terminating owned server closes its port before stop resolves", { timeout: 5000 }, async (t) => {
  const source = serverSource.replace("process.on('SIGTERM', () => {});", "");
  const owned = spawnOwnedPreview(process.execPath, ["-e", source], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (process.platform === "win32") owned.child.kill("SIGKILL"); else cleanGroup(owned.child); });
  const server = await ready(owned.child);
  await owned.stop({ graceMs: 1000, killMs: 1000 });
  await waitClosed(server.port);
});

test("cleanup reports a bounded failure when an escaped process retains pipes", { skip: process.platform === "win32", timeout: 10000 }, async (t) => {
  const escapedSource = wrapperSource.replace("{stdio:", "{detached: true, stdio:");
  const owned = spawnOwnedPreview(process.execPath, ["-e", escapedSource], { stdio: ["ignore", "pipe", "pipe"] });
  let escaped;
  t.after(() => { cleanGroup(owned.child); if (escaped) cleanGroup(escaped); });
  escaped = await ready(owned.child);
  const started = Date.now();
  await assert.rejects(owned.stop({ graceMs: 100, killMs: 100 }), /did not close/);
  assert.ok(Date.now() - started < 2000, "cleanup failure must not hang the runner");
  assert.equal(await listening(escaped.port), true, "cleanup must not signal a different process group");
});

test("missing Next CLI stays a machine-readable E2E startup failure", { timeout: 10000 }, async () => {
  const bootstrap = `
    import Module from 'node:module';
    const original = Module._resolveFilename;
    Module._resolveFilename = function(request, ...args) {
      if (request === 'next/dist/bin/next') {
        const error = new Error('Missing Next CLI fixture');
        error.code = 'MODULE_NOT_FOUND';
        throw error;
      }
      return original.call(this, request, ...args);
    };
  `;
  const child = spawn(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(bootstrap)}`, "scripts/vault-e2e.mjs", "example"], { stdio: ["ignore", "pipe", "pipe"] });
  let errors = "";
  child.stdout.resume();
  child.stderr.on("data", (chunk) => { errors += chunk; });
  const [code] = await once(child, "close");
  assert.equal(code, 1);
  const failure = JSON.parse(errors);
  assert.equal(failure.ok, false);
  assert.equal(failure.code, "vault-e2e/dev-server-command-missing");
  assert.equal(failure.agent.verdict, "fix-blocking");
});

test("cleanup failure retains the startup cause in machine-readable E2E output", { timeout: 10000 }, async () => {
  const replacement = `
    import { EventEmitter } from 'node:events';
    import { PassThrough } from 'node:stream';
    export function startNextPreview() {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      queueMicrotask(() => {
        const error = new Error('fixture startup failure');
        error.code = 'ENOENT';
        child.emit('error', error);
      });
      return { child, async stop() { throw new Error('fixture cleanup failure'); } };
    }
  `;
  const bootstrap = `
    import { registerHooks } from 'node:module';
    registerHooks({ load(url, context, nextLoad) {
      if (url.endsWith('/scripts/preview-process.mjs')) return { format: 'module', source: ${JSON.stringify(replacement)}, shortCircuit: true };
      return nextLoad(url, context);
    }});
  `;
  const child = spawn(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(bootstrap)}`, "scripts/vault-e2e.mjs", "example"], { stdio: ["ignore", "pipe", "pipe"] });
  let errors = "";
  child.stdout.resume();
  child.stderr.on("data", (chunk) => { errors += chunk; });
  const [code] = await once(child, "close");
  assert.equal(code, 1);
  const failure = JSON.parse(errors);
  assert.equal(failure.ok, false);
  assert.equal(failure.code, "vault-e2e/cleanup-failed");
  assert.equal(failure.startupError, "fixture startup failure");
  assert.equal(failure.cleanupError, "fixture cleanup failure");
  assert.equal(failure.agent.verdict, "fix-blocking");
});
