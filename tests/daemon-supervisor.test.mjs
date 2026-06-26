import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import {
  isProcessAlive,
  acquireLock,
  readLock,
  releaseLock,
  backoffDelay,
  writeHeartbeat,
  supervisorStatus,
  runSupervisor,
  stopDaemon
} from "../packages/operate/daemon.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-daemon-"));
}

function paths(root) {
  return { lockPath: path.join(root, "daemon.lock"), heartbeatPath: path.join(root, "heartbeat.json") };
}

// A fake child that exits on next tick (simulates a crash loop).
function crashingChild() {
  const child = new EventEmitter();
  child.kill = () => {};
  process.nextTick(() => child.emit("exit", 1, null));
  return child;
}

// A fake child that never exits on its own (only on kill/abort).
function longLivedChild() {
  const child = new EventEmitter();
  child.kill = () => {};
  return child;
}

test("isProcessAlive: true for self, false for a dead pid", () => {
  assert.equal(isProcessAlive(process.pid), true);
  assert.equal(isProcessAlive(2147480000), false);
});

test("single-instance lock refuses a second live holder and reclaims a stale one", () => {
  const root = tempRoot();
  const { lockPath } = paths(root);
  assert.equal(acquireLock(lockPath).acquired, true); // held by this (live) pid
  assert.equal(acquireLock(lockPath).acquired, false); // refused
  assert.equal(releaseLock(lockPath), true);

  fs.writeFileSync(lockPath, JSON.stringify({ pid: 2147480000, acquiredAt: "x" })); // dead holder
  const reclaimed = acquireLock(lockPath);
  assert.equal(reclaimed.acquired, true);
  assert.equal(reclaimed.reclaimed, true);
});

test("backoffDelay grows exponentially and is capped", () => {
  assert.equal(backoffDelay(1, { baseMs: 100, maxMs: 5000 }), 100);
  assert.equal(backoffDelay(2, { baseMs: 100, maxMs: 5000 }), 200);
  assert.equal(backoffDelay(3, { baseMs: 100, maxMs: 5000 }), 400);
  assert.equal(backoffDelay(20, { baseMs: 100, maxMs: 5000 }), 5000);
});

test("supervisorStatus reports stopped/stale/running honestly", () => {
  const root = tempRoot();
  const { heartbeatPath } = paths(root);
  assert.equal(supervisorStatus(heartbeatPath).status, "stopped");
  writeHeartbeat(heartbeatPath, { pid: process.pid, status: "running", restarts: 0 });
  assert.equal(supervisorStatus(heartbeatPath, { freshMs: 60000 }).status, "running");
  writeHeartbeat(heartbeatPath, { pid: 2147480000, status: "running", restarts: 0 });
  assert.equal(supervisorStatus(heartbeatPath, { freshMs: 60000 }).status, "stale");
});

test("supervisor restarts a crashing child up to maxRestarts, then stops", async () => {
  const root = tempRoot();
  const { lockPath, heartbeatPath } = paths(root);
  let spawns = 0;
  const result = await runSupervisor({
    lockPath,
    heartbeatPath,
    maxRestarts: 3,
    baseMs: 1,
    maxMs: 5,
    spawnChild: () => {
      spawns += 1;
      return crashingChild();
    }
  });
  assert.equal(result.status, "stopped");
  assert.equal(result.stopReason, "max_restarts_exhausted");
  assert.equal(result.restarts, 3);
  assert.equal(spawns, 4); // 1 initial + 3 restarts
  // Heartbeat shows stopped; lock released.
  assert.equal(supervisorStatus(heartbeatPath).heartbeat.status, "stopped");
  assert.equal(readLock(lockPath), null);
});

test("supervisor refuses to start when the lock is already held", async () => {
  const root = tempRoot();
  const { lockPath, heartbeatPath } = paths(root);
  acquireLock(lockPath); // held by this live process
  const result = await runSupervisor({ lockPath, heartbeatPath, maxRestarts: 1, spawnChild: crashingChild });
  assert.equal(result.status, "already_running");
  releaseLock(lockPath);
});

test("supervisor stops gracefully on abort and releases the lock", async () => {
  const root = tempRoot();
  const { lockPath, heartbeatPath } = paths(root);
  const controller = new AbortController();
  const run = runSupervisor({
    lockPath,
    heartbeatPath,
    maxRestarts: 100,
    baseMs: 1,
    signal: controller.signal,
    spawnChild: longLivedChild
  });
  setTimeout(() => controller.abort(), 20);
  const result = await run;
  assert.equal(result.stopReason, "aborted");
  assert.equal(readLock(lockPath), null);
});

test("supervisor really spawns and restarts a short-lived child process", async () => {
  const root = tempRoot();
  const { lockPath, heartbeatPath } = paths(root);
  let spawns = 0;
  const result = await runSupervisor({
    lockPath,
    heartbeatPath,
    maxRestarts: 2,
    baseMs: 1,
    maxMs: 5,
    spawnChild: () => {
      spawns += 1;
      return spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
    }
  });
  assert.equal(result.restarts, 2);
  assert.equal(spawns, 3); // real processes spawned
  assert.equal(result.status, "stopped");
});

test("stopDaemon reports not_running when no live holder", () => {
  const root = tempRoot();
  const { lockPath } = paths(root);
  assert.equal(stopDaemon({ lockPath }).status, "not_running");
});
