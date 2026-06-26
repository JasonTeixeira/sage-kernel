// Bounded-concurrency execution pool. Replaces sequential "concurrency" claims
// with a real worker pool that runs up to `limit` tasks simultaneously and
// records each task's start/finish, so observed peak concurrency is provable.

export async function runConcurrent(tasks, options = {}) {
  const limit = Math.max(1, options.limit ?? 4);
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      const startedAt = Date.now();
      try {
        results[index] = { index, status: "fulfilled", value: await tasks[index](), startedAt, finishedAt: Date.now() };
      } catch (error) {
        results[index] = { index, status: "rejected", reason: String(error?.message || error), startedAt, finishedAt: Date.now() };
      }
    }
  }
  const poolSize = Math.min(limit, tasks.length || 1);
  await Promise.all(Array.from({ length: poolSize }, worker));
  return results;
}

// Peak number of tasks that were running simultaneously (sweep-line over the
// recorded intervals). A value > 1 proves real parallel execution occurred.
export function maxConcurrencyObserved(results) {
  const events = [];
  for (const result of results) {
    if (!result) continue;
    events.push([result.startedAt, 1]);
    events.push([result.finishedAt, -1]);
  }
  // Half-open intervals: at equal timestamps process ends (-1) before starts
  // (+1) so a task ending exactly when another starts is not counted as overlap.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let peak = 0;
  for (const [, delta] of events) {
    current += delta;
    if (current > peak) peak = current;
  }
  return peak;
}
