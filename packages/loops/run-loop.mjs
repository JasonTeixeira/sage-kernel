// runLoop — selects the best engineering loop for a goal (explicit > learned >
// classified) and runs it through the single operate executor, passing the
// loop's phases as the plan and its required-before-exit gates. The executor
// records proofs, builds the proof graph, firewalls claims, and reports a typed
// stop reason.

import { runOperate } from "../operate/operate.mjs";
import { getLoop, loopPlan } from "./registry.mjs";
import { selectLoop } from "./selector.mjs";
import { classifyDiff, changedFiles } from "../risk/diff-classifier.mjs";
import { recordOutcome } from "../learning/outcomes.mjs";

export async function runLoop(options = {}) {
  const root = options.root || process.cwd();
  const goal = options.goal || "";
  const selection = selectLoop({ root, goal, loop: options.loop });
  const def = getLoop(selection.loop);
  if (!def) throw new Error(`Unknown loop: ${selection.loop}`);

  const files = options.files || changedFiles(root);
  const risk = classifyDiff(files);
  const plan = loopPlan(def, risk.riskLevel);

  const report = await runOperate({
    root,
    goal: goal || def.title,
    acceptanceCriteria: options.acceptanceCriteria || [`Loop ${def.id}: ${def.whenToUse}`],
    files,
    approve: options.approve,
    gateRunners: options.gateRunners,
    repairer: options.repairer,
    maxRepairAttempts: options.maxRepairAttempts,
    plan,
    loopId: def.id,
    loopSource: selection.source,
    requiredGates: def.requiredGates
  });

  // Record the outcome so future selection learns which loop works for this repo.
  recordOutcome(
    { loop: def.id, status: report.status, repairs: (report.gates || []).filter((gate) => gate.repair).length },
    { root }
  );

  return {
    ...report,
    loopSelection: {
      loop: def.id,
      title: def.title,
      source: selection.source,
      reason: selection.reason,
      mutates: def.mutates,
      stopConditions: def.stopConditions
    }
  };
}
