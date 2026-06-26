import test from "node:test";
import assert from "node:assert/strict";
import { SEEDED_BUGS, runCloseLoop, runAutonomyHarness } from "../packages/autonomy/harness.mjs";

test("every seeded bug is genuinely detected as broken by a real engine", () => {
  for (const bug of SEEDED_BUGS) {
    assert.equal(bug.isHealthy(bug.broken), false, `bug ${bug.id} is not actually broken`);
  }
});

test("the known-good fixer closes every seeded bug end-to-end (harness mechanics = correct)", () => {
  const report = runAutonomyHarness();
  assert.equal(report.detectRate, 1);
  assert.equal(report.closeRate, 1);
  assert.equal(report.rolledBack, 0);
  assert.equal(report.noFakeClose, true);
  // Each closed bug's final source genuinely passes its real detector.
  for (const r of report.results) assert.equal(r.healthyFinal, true);
});

test("a no-op fixer closes nothing and rolls back everything (fail-closed, no debt)", () => {
  const report = runAutonomyHarness({ fixer: (bug) => bug.broken, fixerName: "noop" });
  assert.equal(report.closeRate, 0);
  assert.equal(report.rolledBack, report.total);
  assert.equal(report.noFakeClose, true);
  // Rolled-back bugs are left exactly as found (no half-applied debt).
  for (const r of report.results) {
    assert.equal(r.closed, false);
    const bug = SEEDED_BUGS.find((b) => b.id === r.id);
    assert.equal(r.finalSource, bug.broken);
  }
});

test("a fixer that throws is treated as a failed (rolled-back) close, never a crash", () => {
  const report = runAutonomyHarness({ fixer: () => { throw new Error("model timeout"); }, fixerName: "throwing" });
  assert.equal(report.closeRate, 0);
  assert.equal(report.rolledBack, report.total);
});

test("a fixer that produces a still-broken result does NOT count as closed", () => {
  const bug = SEEDED_BUGS.find((b) => b.category === "security");
  const r = runCloseLoop(bug, (b) => b.broken.replace("execSync", "execSync /*noop*/"));
  assert.equal(r.closed, false);
  assert.equal(r.rolledBack, true);
});
