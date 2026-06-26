#!/usr/bin/env node
// Unattended-safe autonomous improvement loop. Points a live worker model
// (SAGE_AGENT_COMMAND) at the kernel's own capabilities; gauntlet-passing changes
// become reviewable PATCHES in the approval queue and the tree is restored clean.
// NEVER commits. Review with: npm run approvals -- list / apply <id>.
//
//   SAGE_AGENT_COMMAND="node providers/claude-agent.mjs" \
//     node scripts/improve-loop.mjs --targets security-generalization,profile-accuracy-fresh
import { spawnSync } from "node:child_process";
import { CAPABILITY_REGISTRY, assessCategory } from "../packages/companion/capability-registry.mjs";
import { runImproveLoop } from "../packages/companion/improve-loop.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const targetArg = (() => { const i = args.indexOf("--targets"); return i >= 0 ? args[i + 1] : null; })();
const agentCommand = process.env.SAGE_AGENT_COMMAND;
if (!agentCommand) { console.error("set SAGE_AGENT_COMMAND (e.g. 'node providers/claude-agent.mjs')"); process.exit(2); }

// Default targets: deterministic, source-improvable capabilities (skip live-only).
const improvable = CAPABILITY_REGISTRY.filter((c) => c.command || c.commandFor).map((c) => c.id);
const targets = targetArg ? targetArg.split(",").map((s) => s.trim()).filter(Boolean) : improvable;

const run = (cmd) => spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8", timeout: 1_200_000, maxBuffer: 1024 * 1024 * 64 });

async function measureAll() {
  const out = [];
  for (const cat of CAPABILITY_REGISTRY) {
    if (cat.commandFor) run(cat.commandFor(1));
    else if (cat.command) run(cat.command);
    else continue;
    out.push(assessCategory(cat, root, {}));
  }
  return out;
}

const applyChange = async ({ targetId }) => {
  const cat = CAPABILITY_REGISTRY.find((c) => c.id === targetId);
  const diagnosis = { category: targetId, instruction: `Improve "${targetId}". ${cat?.improveHint || ""} Smallest correct GENERALIZABLE engine change; do not weaken tests/corpora; if you cannot improve it cleanly, make no change.`, impactedFiles: [] };
  spawnSync(agentCommand, ["improve"], { cwd: root, shell: true, encoding: "utf8", timeout: 1_200_000, env: { ...process.env, SAGE_DIAGNOSIS_JSON: JSON.stringify(diagnosis) }, maxBuffer: 1024 * 1024 * 32 });
};

const runTests = async () => spawnSync("node", ["--test", "tests/"], { cwd: root, encoding: "utf8", timeout: 1_200_000, maxBuffer: 1024 * 1024 * 64 }).status === 0;

const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const res = await runImproveLoop({ root, targets, applyChange, measureAll, runTests, stamp });

console.error(`\nimprove-loop done (NO commits). pending=${res.pending.length} reverted=${res.reverted.length} no_change=${res.noChange.length}`);
for (const p of res.pending) console.error(`  PENDING ${p.id}: ${p.targetId} ${p.targetBefore}->${p.targetAfter}  patch: ${p.patchFile}`);
for (const r of res.reverted) console.error(`  reverted ${r.targetId} (${r.reason})`);
console.log(JSON.stringify({ pending: res.pending.length, reverted: res.reverted.length, noChange: res.noChange.length, committed: res.committed }));
