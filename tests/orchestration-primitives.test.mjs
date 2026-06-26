import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireLease, releaseLease, renewLease, isLeaseHeld } from "../packages/orchestration/lease.mjs";
import { runConcurrent, maxConcurrencyObserved } from "../packages/orchestration/concurrent.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sage-lease-"));

test("a held lease blocks a second acquisition until released", () => {
  const root = tmp();
  const a = acquireLease(root, "orchestration");
  assert.equal(a.acquired, true);
  const b = acquireLease(root, "orchestration");
  assert.equal(b.acquired, false);
  assert.equal(b.heldBy.leaseId, a.leaseId);
  assert.equal(releaseLease(root, "orchestration", a.leaseId), true);
  const c = acquireLease(root, "orchestration");
  assert.equal(c.acquired, true);
});

test("an expired lease can be taken over", () => {
  const root = tmp();
  const a = acquireLease(root, "job", { ttlMs: 1000, now: 0 });
  assert.equal(a.acquired, true);
  const stillHeld = acquireLease(root, "job", { now: 500 });
  assert.equal(stillHeld.acquired, false);
  const takeover = acquireLease(root, "job", { now: 2000 });
  assert.equal(takeover.acquired, true);
  assert.equal(takeover.tookOverStale, true);
});

test("renew extends expiry; isLeaseHeld reflects TTL", () => {
  const root = tmp();
  const a = acquireLease(root, "j", { ttlMs: 100, now: 0 });
  assert.equal(isLeaseHeld(root, "j", { now: 50 }), true);
  assert.equal(isLeaseHeld(root, "j", { now: 200 }), false);
  const renewed = renewLease(root, "j", a.leaseId, { ttlMs: 100, now: 150 });
  assert.equal(renewed.expiresAt, 250);
  assert.equal(isLeaseHeld(root, "j", { now: 200 }), true);
});

test("runConcurrent runs tasks in parallel (peak concurrency > 1)", async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tasks = Array.from({ length: 4 }, (_, i) => async () => { await sleep(25); return i; });
  const results = await runConcurrent(tasks, { limit: 4 });
  assert.equal(results.length, 4);
  assert.equal(results.every((r) => r.status === "fulfilled"), true);
  assert.ok(maxConcurrencyObserved(results) > 1, "expected real overlap");
});

test("runConcurrent respects the limit and captures rejections", async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tasks = [
    async () => { await sleep(15); return 1; },
    async () => { await sleep(15); throw new Error("boom"); },
    async () => { await sleep(15); return 3; }
  ];
  const results = await runConcurrent(tasks, { limit: 1 });
  assert.equal(maxConcurrencyObserved(results), 1, "limit:1 must run sequentially");
  assert.equal(results[1].status, "rejected");
  assert.match(results[1].reason, /boom/);
});
