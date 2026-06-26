import test from "node:test";
import assert from "node:assert/strict";
import { benchmark, runBenchmarks, detectRegressions } from "../packages/testing/benchmark-harness.mjs";
import { benchmarkCases } from "../scripts/bench.mjs";

test("benchmark measures ms/op and reports ops/sec", async () => {
  const result = await benchmark("noop", () => {}, { iterations: 50 });
  assert.equal(result.iterations, 50);
  assert.ok(result.msPerOp >= 0);
  assert.ok(result.withinBudget); // no budget -> always within
});

test("runBenchmarks fails when a case exceeds its budget", async () => {
  const slow = async () => { let x = 0; for (let i = 0; i < 200000; i += 1) x += i; return x; };
  const report = await runBenchmarks([
    { name: "fast", fn: () => {}, iterations: 20, budgetMsPerOp: 1000 },
    { name: "impossible", fn: slow, iterations: 20, budgetMsPerOp: 0 }
  ]);
  assert.equal(report.status, "failed");
  assert.equal(report.results.find((r) => r.name === "fast").withinBudget, true);
  assert.equal(report.results.find((r) => r.name === "impossible").withinBudget, false);
});

test("benchmarkCases defines runnable kernel benchmarks within generous budgets", async () => {
  const cases = benchmarkCases(process.cwd());
  assert.ok(cases.length >= 3);
  assert.ok(cases.every((c) => typeof c.name === "string" && typeof c.fn === "function"));
  const report = await runBenchmarks(cases);
  assert.equal(report.status, "passed", JSON.stringify(report.results));
});

test("detectRegressions flags operations that slowed beyond tolerance", () => {
  const baseline = [{ name: "op", msPerOp: 1 }];
  assert.equal(detectRegressions([{ name: "op", msPerOp: 1.5 }], baseline, 3).status, "passed");
  const regressed = detectRegressions([{ name: "op", msPerOp: 5 }], baseline, 3);
  assert.equal(regressed.status, "failed");
  assert.equal(regressed.regressions[0].factor, 5);
});
