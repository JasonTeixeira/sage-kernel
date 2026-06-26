import test from "node:test";
import assert from "node:assert/strict";
import { runImproveLoop } from "../packages/companion/improve-loop.mjs";

// In-memory git fake + injected IO so we can assert the SAFETY invariant without
// touching the real repo: gauntlet-passing changes become queued patches and the
// tree is restored clean; nothing is ever committed.
function harness() {
  const dirty = new Set();
  const reverted = [];
  const removed = [];
  const writes = [];
  const appends = [];
  return {
    gitOps: {
      dirty: () => new Set(dirty),
      isTracked: () => false,
      revert: (f) => { reverted.push(f); dirty.delete(f); },
      remove: (f) => { removed.push(f); dirty.delete(f); },
      diff: () => "PATCH-CONTENT"
    },
    addDirty: (f) => dirty.add(f),
    dirty, reverted, removed, writes, appends,
    writeFile: (p, c) => writes.push({ p, c }),
    appendLine: (p, c) => appends.push({ p, c })
  };
}

const measurePair = (before, after) => { let n = 0; return async () => (n++ === 0 ? before : after); };

test("a gauntlet-passing change is QUEUED as a patch and the tree is restored clean (never committed)", async () => {
  const h = harness();
  const res = await runImproveLoop({
    root: "/x", targets: ["t"], gitOps: h.gitOps, stamp: "S",
    writeFile: h.writeFile, appendLine: h.appendLine,
    applyChange: async () => { h.addDirty("src/fix.mjs"); },
    measureAll: measurePair([{ id: "t", score: 80, proven: true }], [{ id: "t", score: 95, proven: true }]),
    runTests: async () => true
  });
  assert.equal(res.committed, false, "the loop must NEVER commit");
  assert.equal(res.pending.length, 1, "kept change must be queued for approval");
  assert.equal(res.pending[0].targetAfter, 95);
  assert.ok(h.writes.some((w) => w.p.endsWith(".patch") && w.c === "PATCH-CONTENT"), "patch snapshot written");
  assert.ok(h.appends.some((a) => a.p.endsWith("pending-approval.jsonl")), "queue entry appended");
  assert.deepEqual(h.removed, ["src/fix.mjs"], "working tree restored clean (untracked new file removed)");
  assert.equal(h.dirty.size, 0, "no leftover dirty files");
});

test("a regressing change is reverted, NOT queued", async () => {
  const h = harness();
  const res = await runImproveLoop({
    root: "/x", targets: ["t"], gitOps: h.gitOps, stamp: "S",
    writeFile: h.writeFile, appendLine: h.appendLine,
    applyChange: async () => { h.addDirty("src/bad.mjs"); },
    measureAll: measurePair([{ id: "t", score: 80, proven: true }, { id: "o", score: 90, proven: true }], [{ id: "t", score: 95, proven: true }, { id: "o", score: 70, proven: true }]),
    runTests: async () => true
  });
  assert.equal(res.pending.length, 0);
  assert.equal(res.reverted.length, 1);
  assert.equal(res.reverted[0].reason, "regression");
  assert.equal(res.committed, false);
});

test("a no-op worker is recorded as no_change, queue untouched", async () => {
  const h = harness();
  const res = await runImproveLoop({
    root: "/x", targets: ["t"], gitOps: h.gitOps, stamp: "S",
    writeFile: h.writeFile, appendLine: h.appendLine,
    applyChange: async () => {},
    measureAll: async () => [{ id: "t", score: 80, proven: true }],
    runTests: async () => true
  });
  assert.equal(res.noChange.length, 1);
  assert.equal(res.pending.length, 0);
  assert.equal(h.writes.length, 0);
});
