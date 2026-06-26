// Performance gate (cat 17): proves the incremental analysis cache works on the
// real repo — a warm run re-analyzes 0 unchanged files and yields identical
// findings to a cold run — and that both runs stay within a wall-clock budget.
import fs from "node:fs";
import path from "node:path";
import { scanSastIncremental } from "../packages/perf/incremental-sast.mjs";
import { checkIncrementalGain, checkLatencyBudgets } from "../packages/perf/budget.mjs";

const root = process.cwd();

function timed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

// Cold run with an empty cache (worst case: analyze everything).
const cold = timed(() => scanSastIncremental({ root, cache: {} }));
// Warm run reusing the cold cache (unchanged tree -> all hits).
const warm = timed(() => scanSastIncremental({ root, cache: cold.value.cache }));

const gain = checkIncrementalGain(cold.value, warm.value);
// Generous budgets: catch order-of-magnitude regressions, not machine jitter.
const budgets = checkLatencyBudgets(
  [{ name: "cold-scan", ms: cold.ms }, { name: "warm-scan", ms: warm.ms }],
  { "cold-scan": 30000, "warm-scan": 15000 }
);

const speedup = warm.ms > 0 ? Number((cold.ms / warm.ms).toFixed(2)) : null;
const status = gain.status === "passed" && budgets.status === "passed" ? "passed" : "failed";

const report = {
  type: "perf-incremental",
  status,
  filesScanned: cold.value.filesScanned,
  coldMs: Number(cold.ms.toFixed(1)),
  warmMs: Number(warm.ms.toFixed(1)),
  speedup,
  warmHits: warm.value.perf.hits,
  warmMissRate: warm.value.perf.missRate,
  gain,
  budgets,
  generatedAt: new Date().toISOString()
};
const target = path.join(root, ".sage-kernel/evidence/perf-incremental-latest.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({ status, filesScanned: report.filesScanned, coldMs: report.coldMs, warmMs: report.warmMs, speedup, warmMissRate: report.warmMissRate, gain: gain.reasons, budgets: budgets.checks }, null, 2));
process.exit(status === "passed" ? 0 : 1);
