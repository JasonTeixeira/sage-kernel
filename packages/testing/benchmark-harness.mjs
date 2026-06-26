// Micro-benchmark harness with per-operation budgets. Measures ms/op with
// process.hrtime (warmup excluded) and flags budget breaches. Budgets are
// deliberately generous — this catches catastrophic (order-of-magnitude)
// regressions, not machine-speed jitter, so it is advisory rather than a tight
// CI gate.

export async function benchmark(name, fn, options = {}) {
  const iterations = Math.max(1, options.iterations ?? 100);
  const warmup = Math.min(options.warmup ?? 5, iterations);
  for (let i = 0; i < warmup; i += 1) await fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) await fn();
  const elapsedNs = Number(process.hrtime.bigint() - start);
  const msPerOp = elapsedNs / 1e6 / iterations;
  const budget = options.budgetMsPerOp ?? null;
  return {
    name,
    iterations,
    msPerOp: Number(msPerOp.toFixed(4)),
    opsPerSec: msPerOp > 0 ? Math.round(1000 / msPerOp) : null,
    budgetMsPerOp: budget,
    withinBudget: budget == null ? true : msPerOp <= budget
  };
}

export async function runBenchmarks(cases = [], options = {}) {
  const results = [];
  for (const item of cases) {
    results.push(await benchmark(item.name, item.fn, { iterations: item.iterations ?? options.iterations, budgetMsPerOp: item.budgetMsPerOp }));
  }
  return {
    status: results.every((result) => result.withinBudget) ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    results
  };
}

// Compare a fresh run to a saved baseline; flag operations that regressed beyond
// `tolerance` (default 3x slower) — generous to absorb machine variance.
export function detectRegressions(current = [], baseline = [], tolerance = 3) {
  const baseByName = new Map(baseline.map((entry) => [entry.name, entry]));
  const regressions = [];
  for (const result of current) {
    const prior = baseByName.get(result.name);
    if (prior && prior.msPerOp > 0 && result.msPerOp > prior.msPerOp * tolerance) {
      regressions.push({ name: result.name, baselineMsPerOp: prior.msPerOp, currentMsPerOp: result.msPerOp, factor: Number((result.msPerOp / prior.msPerOp).toFixed(2)) });
    }
  }
  return { status: regressions.length === 0 ? "passed" : "failed", regressions };
}
