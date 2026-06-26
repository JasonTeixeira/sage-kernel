// Daemon supervisor — promotes the worker poller into a supervised process with
// a single-instance lock, heartbeat, crash-restart with exponential backoff, and
// graceful shutdown. Pure pieces (lock, backoff, heartbeat) are unit-testable;
// the run loop accepts an injected spawnChild and an AbortSignal so it can be
// tested deterministically and driven by real signals in production.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export function isProcessAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM"; // exists but not signalable
  }
}

export function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

// Acquire the single-instance lock. Refuses if a live process already holds it;
// reclaims a stale lock whose holder is dead.
export function acquireLock(lockPath, pid = process.pid) {
  const existing = readLock(lockPath);
  if (existing && isProcessAlive(existing.pid)) {
    return { acquired: false, holder: existing.pid, reason: "another instance is already running" };
  }
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({ pid, acquiredAt: new Date().toISOString() }));
  return { acquired: true, pid, reclaimed: Boolean(existing) };
}

export function releaseLock(lockPath, pid = process.pid) {
  const existing = readLock(lockPath);
  if (existing && existing.pid === pid) {
    fs.rmSync(lockPath, { force: true });
    return true;
  }
  return false;
}

export function backoffDelay(attempt, options = {}) {
  const base = options.baseMs ?? 200;
  const max = options.maxMs ?? 5000;
  return Math.min(max, base * 2 ** Math.max(0, attempt - 1));
}

export function writeHeartbeat(heartbeatPath, data) {
  fs.mkdirSync(path.dirname(heartbeatPath), { recursive: true });
  fs.writeFileSync(heartbeatPath, `${JSON.stringify({ ...data, ts: new Date().toISOString() }, null, 2)}\n`);
}

export function readHeartbeat(heartbeatPath) {
  try {
    return JSON.parse(fs.readFileSync(heartbeatPath, "utf8"));
  } catch {
    return null;
  }
}

export function supervisorStatus(heartbeatPath, options = {}) {
  const heartbeat = readHeartbeat(heartbeatPath);
  if (!heartbeat) return { status: "stopped", heartbeat: null };
  const ageMs = Date.now() - Date.parse(heartbeat.ts);
  const freshMs = options.freshMs ?? 15000;
  const running = heartbeat.status === "running" && ageMs <= freshMs && isProcessAlive(heartbeat.pid);
  return { status: running ? "running" : "stale", ageMs, heartbeat };
}

function delay(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener?.(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

function waitForChildExit(child, signal) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (!done) {
        done = true;
        resolve(result);
      }
    };
    child.once("exit", (code, sig) => finish({ code, signal: sig }));
    child.once("error", () => finish({ code: 1, signal: null }));
    const killOnAbort = () => {
      try {
        child.kill?.("SIGTERM");
      } catch {
        /* already gone */
      }
      finish({ code: null, signal: "SIGTERM", aborted: true });
    };
    if (signal?.aborted) killOnAbort();
    else signal?.addEventListener?.("abort", killOnAbort, { once: true });
  });
}

function defaultSpawnChild(options) {
  return ({ root }) =>
    spawn("node", [options.script || "apps/worker/scripts/worker-daemon.mjs"], {
      cwd: root,
      stdio: options.stdio || "ignore"
    });
}

// Run the supervisor. Spawns the child, restarts it on exit (up to maxRestarts)
// with backoff, writes heartbeats, and stops gracefully on abort. Every exit
// carries a typed stopReason.
export async function runSupervisor(options = {}) {
  const root = options.root || process.cwd();
  const lockPath = options.lockPath || path.join(root, ".sage-kernel/daemon/daemon.lock");
  const heartbeatPath = options.heartbeatPath || path.join(root, ".sage-kernel/daemon/heartbeat.json");
  const maxRestarts = options.maxRestarts ?? 5;
  const signal = options.signal;
  const spawnChild = options.spawnChild || defaultSpawnChild(options);

  const lock = acquireLock(lockPath);
  if (!lock.acquired) return { status: "already_running", holder: lock.holder, restarts: 0 };

  const crashes = [];
  let restarts = 0;
  let stopReason = "completed";
  let aborted = false;
  const onAbort = () => {
    aborted = true;
  };
  signal?.addEventListener?.("abort", onAbort, { once: true });

  try {
    for (;;) {
      writeHeartbeat(heartbeatPath, { pid: process.pid, restarts, status: "running" });
      const child = spawnChild({ root });
      const exit = await waitForChildExit(child, signal);
      crashes.push({ at: new Date().toISOString(), code: exit.code, signal: exit.signal });
      if (aborted || signal?.aborted || exit.aborted) {
        stopReason = "aborted";
        break;
      }
      if (restarts >= maxRestarts) {
        stopReason = "max_restarts_exhausted";
        break;
      }
      restarts += 1;
      await delay(backoffDelay(restarts, options), signal);
      if (aborted || signal?.aborted) {
        stopReason = "aborted";
        break;
      }
    }
  } finally {
    signal?.removeEventListener?.("abort", onAbort);
    writeHeartbeat(heartbeatPath, { pid: process.pid, restarts, status: "stopped", stopReason });
    releaseLock(lockPath);
  }

  return { status: "stopped", stopReason, restarts, crashes: crashes.length };
}

// Stop a running supervisor by signalling the lock holder.
export function stopDaemon(options = {}) {
  const root = options.root || process.cwd();
  const lockPath = options.lockPath || path.join(root, ".sage-kernel/daemon/daemon.lock");
  const lock = readLock(lockPath);
  if (!lock || !isProcessAlive(lock.pid)) return { status: "not_running" };
  try {
    process.kill(lock.pid, "SIGTERM");
    return { status: "signalled", pid: lock.pid };
  } catch (error) {
    return { status: "error", error: error.message };
  }
}
