// Chaos / fault-injection gate (cat 19). Runs the resilience scenarios and exits
// non-zero if any recovery invariant is violated. Writes evidence for the ledger.
import fs from "node:fs";
import path from "node:path";
import { runChaosMatrix } from "../packages/orchestration/chaos.mjs";

const root = process.cwd();
const report = await runChaosMatrix();
const target = path.join(root, ".sage-kernel/evidence/chaos-matrix-latest.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({ status: report.status, passed: report.passed, total: report.total, scenarios: report.scenarios.map((s) => ({ scenario: s.scenario, status: s.status })) }, null, 2));
process.exit(report.status === "passed" ? 0 : 1);
