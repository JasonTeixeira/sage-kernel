import test from "node:test";
import assert from "node:assert/strict";

import { validateStatusHonesty } from "../packages/audit/status-honesty.mjs";
import { createBenchmarkReport, createExternalComparisonReport } from "../packages/score/scoreboard.mjs";
import { createFullStressMatrix } from "../packages/testing/stress-matrix.mjs";

const root = new URL("..", import.meta.url).pathname;

test("status honesty validator rejects passed reports with unverified proof language", () => {
  const report = validateStatusHonesty({
    status: "passed",
    checks: [
      { id: "ui-proof", status: "blocked_not_verified" },
      { id: "restart", status: "passed", note: "Simulated by local shortcut." }
    ]
  }, { label: "dishonest" });

  assert.equal(report.status, "failed");
  assert.equal(report.failures.length >= 2, true);
});

test("status honesty allows blocked reports and executable benchmark proof", () => {
  assert.equal(validateStatusHonesty(createExternalComparisonReport()).status, "passed");
  assert.equal(validateStatusHonesty(createBenchmarkReport({ root })).status, "passed");
  assert.equal(createBenchmarkReport({ root }).status, "passed");
});

test("full stress matrix fails honestly when kill/restart recovery fails", async () => {
  const matrix = await createFullStressMatrix({
    root,
    save: false,
    killRestartProof: { status: "failed", events: [], error: "forced failure" }
  });
  assert.equal(matrix.status, "failed");
  assert.equal(matrix.chaos.find((item) => item.id === "kill-restart").status, "failed");
  assert.equal(validateStatusHonesty(matrix, { label: "stress.matrix" }).status, "passed");
});
