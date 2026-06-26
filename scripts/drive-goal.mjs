#!/usr/bin/env node
// P13 CLI: drive a single objective to completion through the proof-first loop.
//
//   node scripts/drive-goal.mjs "ship the export feature" [--approve]
//
// Decomposition defaults to a single task; supply a richer decomposer via the
// kernel.goal.drive MCP tool or by importing driveGoal directly. Typed stop
// reasons are printed so an operator (or an outer loop) knows exactly why it
// stopped: completed / blocked_unsatisfiable / blocked_task_failed /
// needs_approval / max_rounds.
import { driveGoal } from "../packages/companion/drive-goal.mjs";

const args = process.argv.slice(2);
const approve = args.includes("--approve");
const objective = args.find((a) => !a.startsWith("--"));
if (!objective) {
  console.error('usage: node scripts/drive-goal.mjs "<objective>" [--approve]');
  process.exit(2);
}

const res = await driveGoal({ objective, approve });
console.log(`goal: ${res.objective}`);
console.log(`stop: ${res.stopReason} — ${res.detail}`);
for (const t of res.tasks) console.log(`  - ${t.id}: ${t.status}${t.skipped ? " (skipped, already proven)" : ""}`);
console.log(`proof: ${res.proofId}`);
process.exit(res.completed ? 0 : 1);
