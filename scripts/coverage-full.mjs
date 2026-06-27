#!/usr/bin/env node
// Runs the coverage suite AND the per-critical-file branch ratchet in one gate, so
// `release:check` locally catches the exact regression CI catches. Previously
// release:check ran only `test:coverage` (global thresholds) but not
// `coverage:critical` (per-file floors), which let a per-file regression pass
// locally and fail in CI. This closes that gap.
import { spawnSync } from "node:child_process";
import { evaluateCriticalCoverage } from "./coverage-critical-gate.mjs";

const root = process.cwd();
// Reuse the exact coverage command (global thresholds enforced via its flags).
const run = spawnSync("npm", ["run", "test:coverage"], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 64 });
const output = `${run.stdout || ""}${run.stderr || ""}`;
process.stdout.write(output);

if (run.status !== 0) {
  console.error("\ncoverage:full FAILED — global coverage thresholds not met.");
  process.exit(1);
}

const critical = evaluateCriticalCoverage(output);
const failures = critical.checks.filter((c) => c.status !== "passed");
if (failures.length) {
  console.error("\ncoverage:full FAILED — critical-file branch floors not met:");
  for (const f of failures) console.error(`  ${f.file}: branch ${f.branchPct} < floor ${f.floor}`);
  process.exit(1);
}
console.error(`\ncoverage:full passed — global thresholds + ${critical.checks.length} critical-file floors green.`);
process.exit(0);
