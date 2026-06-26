#!/usr/bin/env node
// Live autonomous source-improvement on the kernel itself. A worker model
// (SAGE_AGENT_COMMAND) edits source to raise a target capability; the change is
// kept ONLY if it clears the full gauntlet (target improves, nothing regresses,
// full test suite green), else it is SCOPED-reverted. Every outcome is journaled.
//
//   SAGE_AGENT_COMMAND="node providers/claude-agent.mjs" \
//     node scripts/autonomous-improve.mjs --target security-generalization
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CAPABILITY_REGISTRY, assessCategory } from "../packages/companion/capability-registry.mjs";
import { improveOnce } from "../packages/companion/source-improve.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const targetId = (() => { const i = args.indexOf("--target"); return i >= 0 ? args[i + 1] : null; })();
const agentCommand = process.env.SAGE_AGENT_COMMAND;
if (!agentCommand) { console.error("set SAGE_AGENT_COMMAND (e.g. 'node providers/claude-agent.mjs')"); process.exit(2); }

const run = (cmd) => spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8", timeout: 1_200_000, maxBuffer: 1024 * 1024 * 64 });

// Measure all DETERMINISTIC categories from fresh evidence (live categories are
// unaffected by a source rule edit and skipped to save model calls).
async function measureAll() {
  const out = [];
  for (const cat of CAPABILITY_REGISTRY) {
    if (cat.commandFor) run(cat.commandFor(1));
    else if (cat.command) run(cat.command);
    else continue; // skip live-only categories
    out.push(assessCategory(cat, root, {}));
  }
  return out;
}

const target = CAPABILITY_REGISTRY.find((c) => c.id === targetId);
if (!target) { console.error(`unknown target. choose from: ${CAPABILITY_REGISTRY.map((c) => c.id).join(", ")}`); process.exit(2); }

const applyChange = async ({ targetId: id }) => {
  const cat = CAPABILITY_REGISTRY.find((c) => c.id === id);
  const diagnosis = {
    category: id,
    instruction: `Improve the "${id}" capability of THIS repo. ${cat.improveHint} Make the smallest correct, GENERALIZABLE change to the engine source (not the test/corpus). Do not weaken tests or the corpus. If you cannot improve it without causing false positives or regressions, make no change.`,
    impactedFiles: []
  };
  const env = { ...process.env, SAGE_DIAGNOSIS_JSON: JSON.stringify(diagnosis) };
  spawnSync(agentCommand, ["improve"], { cwd: root, shell: true, encoding: "utf8", timeout: 1_200_000, env, maxBuffer: 1024 * 1024 * 32 });
};

const runTests = async () => spawnSync("node", ["--test", "tests/"], { cwd: root, encoding: "utf8", timeout: 1_200_000, maxBuffer: 1024 * 1024 * 64 }).status === 0;

const result = await improveOnce({ root, targetId, applyChange, measureAll, runTests });

const dir = path.join(root, ".sage-kernel/autonomy");
fs.mkdirSync(dir, { recursive: true });
fs.appendFileSync(path.join(dir, "improve-journal.jsonl"), `${JSON.stringify({ ...result, targetId, at: new Date().toISOString() })}\n`);
console.error(`\nimprove(${targetId}): ${result.decision} — ${result.reason} (target ${result.targetBefore} -> ${result.targetAfter ?? "n/a"}; touched ${result.touched.length})`);
console.log(JSON.stringify({ decision: result.decision, reason: result.reason, targetBefore: result.targetBefore, targetAfter: result.targetAfter }));
process.exit(result.decision === "kept" || result.decision === "no_change" ? 0 : 1);
