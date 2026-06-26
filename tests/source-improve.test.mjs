import test from "node:test";
import assert from "node:assert/strict";
import { improveOnce } from "../packages/companion/source-improve.mjs";

// In-memory git fake: tracks a dirty set, a tracked set, and records revert/remove
// calls so we can assert the revert is SCOPED to exactly the worker's files.
function fakeGit(initialDirty = []) {
  const dirty = new Set(initialDirty);
  const tracked = new Set(["src/known.mjs"]);
  const reverted = [];
  const removed = [];
  return {
    ops: {
      dirty: () => new Set(dirty),
      isTracked: (f) => tracked.has(f),
      revert: (f) => { reverted.push(f); dirty.delete(f); },
      remove: (f) => { removed.push(f); dirty.delete(f); }
    },
    addDirty: (f) => dirty.add(f),
    track: (f) => tracked.add(f),
    reverted, removed
  };
}

const scorecard = (target, other) => async () => [{ id: "t", score: target, proven: true }, { id: "o", score: other, proven: true }];

test("KEEP: improvement that passes the full gauntlet is retained (no revert)", async () => {
  const g = fakeGit();
  let measured = 0;
  const measureAll = async () => (measured++ === 0 ? [{ id: "t", score: 80, proven: true }, { id: "o", score: 90, proven: true }] : [{ id: "t", score: 95, proven: true }, { id: "o", score: 90, proven: true }]);
  const res = await improveOnce({
    targetId: "t",
    applyChange: async () => { g.addDirty("src/new.mjs"); },
    measureAll, runTests: async () => true, gitOps: g.ops
  });
  assert.equal(res.decision, "kept");
  assert.deepEqual(g.reverted, []);
  assert.deepEqual(g.removed, []);
});

test("REVERT on red tests — scoped to the worker's NEW (untracked) file only", async () => {
  const g = fakeGit();
  const res = await improveOnce({
    targetId: "t",
    applyChange: async () => { g.addDirty("src/new.mjs"); },
    measureAll: scorecard(95, 90), // would improve, but tests are red
    runTests: async () => false, gitOps: g.ops
  });
  assert.equal(res.decision, "reverted");
  assert.equal(res.reason, "tests_red");
  assert.deepEqual(g.removed, ["src/new.mjs"], "new untracked file must be removed");
  assert.deepEqual(g.reverted, []);
});

test("REVERT on regression in another category", async () => {
  const g = fakeGit();
  let n = 0;
  const measureAll = async () => (n++ === 0 ? [{ id: "t", score: 80, proven: true }, { id: "o", score: 90, proven: true }] : [{ id: "t", score: 95, proven: true }, { id: "o", score: 70, proven: true }]);
  g.track("src/known.mjs");
  const res = await improveOnce({
    targetId: "t",
    applyChange: async () => { g.addDirty("src/known.mjs"); },
    measureAll, runTests: async () => true, gitOps: g.ops
  });
  assert.equal(res.decision, "reverted");
  assert.equal(res.reason, "regression");
  assert.deepEqual(g.reverted, ["src/known.mjs"], "tracked file must be git-reverted, not deleted");
});

test("REVERT on no improvement (target unchanged)", async () => {
  const g = fakeGit();
  const res = await improveOnce({
    targetId: "t",
    applyChange: async () => { g.addDirty("src/new.mjs"); },
    measureAll: scorecard(80, 90), // target stays 80 both times
    runTests: async () => true, gitOps: g.ops
  });
  assert.equal(res.decision, "reverted");
  assert.equal(res.reason, "no_improvement");
});

test("SCOPED revert never touches pre-existing dirty files (in-flight work is safe)", async () => {
  const g = fakeGit(["src/inflight.mjs"]); // already dirty before the worker runs
  const res = await improveOnce({
    targetId: "t",
    applyChange: async () => { g.addDirty("src/worker.mjs"); },
    measureAll: scorecard(80, 90), runTests: async () => true, gitOps: g.ops
  });
  assert.equal(res.decision, "reverted");
  assert.deepEqual([...res.touched], ["src/worker.mjs"], "only the worker's file is in scope");
  assert.ok(!g.removed.includes("src/inflight.mjs") && !g.reverted.includes("src/inflight.mjs"), "pre-existing dirty file must be untouched");
});

test("adversarial refutation forces a revert even when metrics improve", async () => {
  const g = fakeGit();
  let n = 0;
  const measureAll = async () => (n++ === 0 ? [{ id: "t", score: 80, proven: true }] : [{ id: "t", score: 95, proven: true }]);
  const res = await improveOnce({
    targetId: "t",
    applyChange: async () => { g.addDirty("src/new.mjs"); },
    measureAll, runTests: async () => true,
    adversarialVerify: async () => false, // skeptic refutes
    gitOps: g.ops
  });
  assert.equal(res.decision, "reverted");
  assert.equal(res.reason, "refuted");
});

test("no_change when the worker edits nothing", async () => {
  const g = fakeGit();
  const res = await improveOnce({
    targetId: "t",
    applyChange: async () => {}, measureAll: scorecard(80, 90), runTests: async () => true, gitOps: g.ops
  });
  assert.equal(res.decision, "no_change");
});
