import test from "node:test";
import assert from "node:assert/strict";
import {
  chaosLeaseContention,
  chaosStaleLeaseTakeover,
  chaosDeadHolderTakeover,
  chaosCorruptLockRecovery,
  chaosLedgerPartialWriteDetected,
  chaosDagFailClosed,
  chaosDurableResume,
  chaosConcurrentRunIsolation,
  chaosForkedLeaseContention,
  runChaosMatrix
} from "../packages/orchestration/chaos.mjs";

test("forked-process lease contention: exactly ONE of N real OS processes wins the stale takeover", async () => {
  const r = await chaosForkedLeaseContention({ workers: 12 });
  assert.equal(r.status, "passed", JSON.stringify(r.evidence));
  assert.equal(r.evidence.wins, 1);
  assert.equal(r.evidence.losses, r.evidence.workers - 1);
});

test("lease contention: a second holder is refused while the first holds it", () => {
  const r = chaosLeaseContention();
  assert.equal(r.status, "passed");
  assert.equal(r.evidence.second, false);
  assert.equal(r.evidence.reacquiredAfterRelease, true);
});

test("stale lease takeover: an expired lease is taken over", () => {
  const r = chaosStaleLeaseTakeover();
  assert.equal(r.status, "passed");
  assert.equal(r.evidence.tookOverStale, true);
});

test("dead holder takeover: a lock owned by a dead pid is reclaimed", () => {
  assert.equal(chaosDeadHolderTakeover().status, "passed");
});

test("corrupt lock recovery: a truncated lock file does not wedge acquisition", () => {
  assert.equal(chaosCorruptLockRecovery().status, "passed");
});

test("ledger partial write is detected as tampered, never silently accepted", () => {
  const r = chaosLedgerPartialWriteDetected();
  assert.equal(r.status, "passed");
  assert.equal(r.evidence.cleanStatus, "verified");
  assert.equal(r.evidence.corruptedStatus, "tampered");
});

test("DAG fails closed: a thrown node skips its dependents", async () => {
  const r = await chaosDagFailClosed();
  assert.equal(r.status, "passed");
  assert.equal(r.evidence.statuses.c, "skipped");
  assert.equal(r.evidence.ranC, false);
});

test("durable resume skips already-passed steps (real skip, not re-run)", () => {
  const r = chaosDurableResume();
  assert.equal(r.status, "passed");
  assert.deepEqual(r.evidence.secondPass, ["b", "c"]);
  assert.equal(r.evidence.counter.a, 1);
});

test("concurrent run isolation: a second run cannot start while the first holds the run lease", () => {
  const r = chaosConcurrentRunIsolation();
  assert.equal(r.status, "passed");
  assert.equal(r.evidence.runB, false);
});

test("the full chaos matrix passes all scenarios", async () => {
  const matrix = await runChaosMatrix();
  assert.equal(matrix.status, "passed", JSON.stringify(matrix.scenarios.filter((s) => s.status !== "passed")));
  assert.equal(matrix.passed, matrix.total);
  assert.ok(matrix.total >= 8);
});
