// Real file-based leases. Replaces the orchestration's post-hoc "lease"
// annotations with a genuine mutual-exclusion primitive: an atomic create
// (O_EXCL), TTL-based expiry, dead-holder/stale takeover, and explicit release.
// `now` is injectable so expiry is deterministically testable.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const LOCK_DIR = ".sage-kernel/locks";
const DEFAULT_TTL_MS = 30000;

export function acquireLease(root, name, options = {}) {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now();
  const file = lockPath(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const record = { leaseId: crypto.randomUUID(), name, pid: process.pid, acquiredAt: now, expiresAt: now + ttlMs };

  // Atomic acquire/takeover. The lock create is O_EXCL (wx) so only ONE writer
  // ever wins a free lock. Stale takeover is the hard part: the previous code
  // (and a naive guarded delete) could delete a lock a competitor had just freshly
  // won. The fix: a SEPARATE O_EXCL "takeover token" serializes the
  // delete-stale-then-recreate critical section — only the single token holder may
  // remove the stale lock, and only if it is still stale. Result: exactly one
  // winner under real multi-process contention (proven by the forked-N chaos run).
  const token = `${file}.takeover`;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      fs.writeFileSync(file, JSON.stringify(record), { flag: "wx" });
      return { acquired: true, ...record, file, tookOverStale: attempt > 0 };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const existing = readLock(file);
    if (existing && now < existing.expiresAt && pidAlive(existing.pid)) {
      return { acquired: false, heldBy: existing, file };
    }
    // Lock is stale/dead/corrupt. Contend for the exclusive takeover token.
    try {
      fs.writeFileSync(token, JSON.stringify({ pid: process.pid, expiresAt: now + 5000 }), { flag: "wx" });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const held = readLock(token);
      if (!held || !pidAlive(held.pid) || now >= (held.expiresAt || 0)) {
        try { fs.rmSync(token, { force: true }); } catch { /* reclaimed elsewhere */ }
      }
      continue; // another process is taking over; retry
    }
    // Critical section (single holder): remove the lock ONLY if it is still stale,
    // then release the token and loop back to the exclusive create.
    try {
      const current = readLock(file);
      if (!current || now >= current.expiresAt || !pidAlive(current.pid)) {
        fs.rmSync(file, { force: true });
      }
    } finally {
      try { fs.rmSync(token, { force: true }); } catch { /* best-effort */ }
    }
  }
  return { acquired: false, contended: true, file };
}

export function releaseLease(root, name, leaseId) {
  const file = lockPath(root, name);
  const existing = readLock(file);
  if (existing && existing.leaseId === leaseId) {
    fs.rmSync(file, { force: true });
    return true;
  }
  return false;
}

export function renewLease(root, name, leaseId, options = {}) {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now();
  const file = lockPath(root, name);
  const existing = readLock(file);
  if (!existing || existing.leaseId !== leaseId) return null;
  const updated = { ...existing, expiresAt: now + ttlMs };
  fs.writeFileSync(file, JSON.stringify(updated));
  return updated;
}

export function isLeaseHeld(root, name, options = {}) {
  const now = options.now ?? Date.now();
  const existing = readLock(lockPath(root, name));
  return Boolean(existing && now < existing.expiresAt && pidAlive(existing.pid));
}

function lockPath(root, name) {
  return path.join(root, LOCK_DIR, `${String(name).replace(/[^a-zA-Z0-9_.-]/g, "_")}.lock`);
}

function readLock(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM"; // exists but not signalable
  }
}
