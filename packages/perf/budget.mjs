// Per-gate latency budgets + incremental-speedup gate (cat 17). Turns "the tool
// is fast" into an enforced, measurable fact: each measured stage has a wall-clock
// budget, and a warm (cached) run must do strictly less work than a cold run.

export function checkLatencyBudgets(timings = [], budgets = {}) {
  const checks = timings.map((t) => {
    const budgetMs = budgets[t.name] ?? null;
    return {
      name: t.name,
      ms: t.ms,
      budgetMs,
      status: budgetMs == null ? "unbudgeted" : t.ms <= budgetMs ? "passed" : "failed"
    };
  });
  const failed = checks.filter((c) => c.status === "failed");
  return { status: failed.length === 0 ? "passed" : "failed", checks };
}

// A warm run is only "incremental" if it re-analyzed fewer files than the cold run
// (cache hits > 0 and missRate dropped). On an unchanged tree the warm miss-rate
// must be 0. This catches a cache that silently stopped working.
export function checkIncrementalGain(cold, warm) {
  const reasons = [];
  if (!(cold.perf.missRate >= 0.99)) reasons.push(`cold run should miss ~all files, got missRate=${cold.perf.missRate}`);
  if (!(warm.perf.hits > 0)) reasons.push("warm run produced no cache hits");
  if (!(warm.perf.missRate === 0)) reasons.push(`warm run on unchanged tree should miss 0, got missRate=${warm.perf.missRate}`);
  if (warm.findings.length !== cold.findings.length) reasons.push(`warm/cold finding count diverged: ${warm.findings.length} != ${cold.findings.length}`);
  return { status: reasons.length === 0 ? "passed" : "failed", reasons };
}
