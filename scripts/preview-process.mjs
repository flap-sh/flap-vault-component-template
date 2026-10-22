import { execFile, spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DEFAULT_GRACE_MS = 2500;
const DEFAULT_KILL_MS = 2500;

async function closesWithin(closed, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      closed.then(() => true),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function groupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

function taskkill(pid, force, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])], { windowsHide: true, timeout: timeoutMs }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/** Own the process group from spawn time; never accept another service's PID. */
export function spawnOwnedPreview(command, args, options = {}) {
  const posixGroup = process.platform !== "win32";
  const child = spawn(command, args, { ...options, detached: posixGroup });
  let didClose = false;
  // Register before callers can await readiness or the child can naturally exit.
  const closed = new Promise((resolve) => {
    child.once("close", () => { didClose = true; resolve(); });
  });
  child.on("error", () => {}); // The readiness caller still receives spawn errors.
  let stopping;

  return {
    child,
    stop({ graceMs = DEFAULT_GRACE_MS, killMs = DEFAULT_KILL_MS } = {}) {
      stopping ??= (async () => {
        if (!child.pid) {
          if (!(await closesWithin(closed, killMs))) throw new Error("Preview spawn did not close after failing to start.");
          return;
        }
        try {
          if (posixGroup) {
            // The root may have exited while descendants still hold its pipes.
            signalGroup(child.pid, "SIGTERM");
            const gracefulClose = await closesWithin(closed, graceMs);
            if (!gracefulClose || groupExists(child.pid)) signalGroup(child.pid, "SIGKILL");
          } else if (!didClose) {
            try {
              await taskkill(child.pid, false, graceMs);
            } catch (error) {
              if (didClose) return;
              // Console processes may require /F; it is still scoped to our PID tree.
              await taskkill(child.pid, true, killMs);
            }
            if (!(await closesWithin(closed, graceMs))) await taskkill(child.pid, true, killMs);
          }
          if (!(await closesWithin(closed, killMs))) {
            throw new Error(`Preview process ${child.pid} did not close after its owned process tree was terminated.`);
          }
        } catch (error) {
          // Report cleanup failure without leaving local pipe handles hanging CI.
          child.stdout?.destroy();
          child.stderr?.destroy();
          throw error;
        }
      })();
      return stopping;
    },
  };
}

export function startNextPreview(args, options = {}) {
  // Yarn 1 creates a detached shell for scripts. Start the same local Next CLI
  // directly so Next and its server descendants stay in the group we own.
  return spawnOwnedPreview(process.execPath, [require.resolve("next/dist/bin/next"), ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}
