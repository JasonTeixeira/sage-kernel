import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createFullStressMatrix } from "../packages/testing/stress-matrix.mjs";

// Queue stress reads the repo's packages/db/schema.sql, so use the repo root
// (save:false keeps the run from writing evidence).
const root = path.resolve(import.meta.dirname, "..");

test("the stress matrix runs against a real local server by default (no fake fetch)", async () => {
  const matrix = await createFullStressMatrix({ root, save: false });
  assert.equal(matrix.fetchMode, "real-local-server");
  assert.equal(matrix.dashboard.failureRate, 0);
  assert.equal(matrix.dashboard.status, "passed");
  assert.equal(matrix.status, "passed");
});

test("a broken server is detected (fail-closed), not masked as passing", async () => {
  const matrix = await createFullStressMatrix({
    root,
    save: false,
    killRestartProof: { status: "passed", events: [] },
    fetchImpl: async () => ({ ok: false, status: 500, text: async () => "error" })
  });
  assert.equal(matrix.fetchMode, "injected");
  assert.ok(matrix.dashboard.failureRate > 0);
  assert.equal(matrix.status, "failed");
});

test("captures real latency percentiles and a latency-budget chaos check", async () => {
  const matrix = await createFullStressMatrix({ root, save: false });
  assert.ok(matrix.latency, "latency section expected");
  assert.equal(typeof matrix.latency.p50, "number");
  assert.equal(typeof matrix.latency.p95, "number");
  assert.equal(typeof matrix.latency.p99, "number");
  assert.ok(matrix.latency.p99 >= matrix.latency.p50, "p99 >= p50");
  const budget = matrix.chaos.find((c) => c.id === "latency-budget");
  assert.ok(budget);
  assert.equal(budget.status, "passed");
});

test("ci-linux-parity is not_applicable off linux and excluded from the rollup", async () => {
  const matrix = await createFullStressMatrix({ root, save: false });
  const parity = matrix.chaos.find((c) => c.id === "ci-linux-parity");
  assert.ok(parity);
  if (process.platform !== "linux") {
    assert.equal(parity.status, "not_applicable");
    // Matrix still passes despite the not_applicable parity check.
    assert.equal(matrix.status, "passed");
  } else {
    assert.equal(parity.status, "passed");
  }
});
