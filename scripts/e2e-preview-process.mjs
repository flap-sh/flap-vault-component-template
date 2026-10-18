import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

// Own a separate process group so stopping this preview also stops Next's worker,
// without touching any preview or service started outside this E2E invocation.
export function spawnPreviewProcess(command, args, { cwd, env, graceMs = 1000 } = {}) {
  const grouped = process.platform !== "win32";
  const child = spawn(command, args, {
    cwd,
    env,
    detached: grouped,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let spawnError;
  let stopping;
  const collect = (chunk) => { output = (output + chunk.toString()).slice(-128 * 1024); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.on("error", (error) => { spawnError = error.code || "spawn-failed"; });

  const alive = () => {
    if (!child.pid) return false;
    try {
      process.kill(grouped ? -child.pid : child.pid, 0);
      return true;
    } catch { return false; }
  };
  const signal = (name) => {
    if (!child.pid) return;
    try {
      if (grouped) process.kill(-child.pid, name);
      else child.kill(name);
    } catch {}
  };

  return {
    child,
    diagnostics: () => ({
      pid: child.pid,
      exitCode: child.exitCode,
      signalCode: child.signalCode,
      ...(spawnError ? { spawnError } : {}),
      logs: output.split(/\r?\n/).slice(-80),
    }),
    stop: () => {
      if (stopping) return stopping;
      stopping = (async () => {
        signal("SIGTERM");
        const deadline = Date.now() + graceMs;
        while (alive() && Date.now() < deadline) await sleep(25);
        // child.killed means a signal was sent, not that its descendants exited.
        if (alive()) signal("SIGKILL");
        const killedDeadline = Date.now() + 1000;
        while (alive() && Date.now() < killedDeadline) await sleep(25);
      })();
      return stopping;
    },
  };
}
