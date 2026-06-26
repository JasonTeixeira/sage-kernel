// P13: the long-horizon autonomous driver. Given a single objective, it
// decomposes it into a task DAG, drives each task through the proof-first operate
// loop (in dependency order, skipping tasks already backed by a passing proof),
// and loops to whole-goal acceptance — with TYPED stop reasons instead of
// open-ended churn. Every task and the goal itself are anchored in the ledger, so
// a re-run is idempotent (already-satisfied tasks are not redone).
//
// Nothing here is a model: runTask is injected (defaults to the operate loop),
// the same way the rest of the kernel stays provider-agnostic.

import { runOperate } from "../operate/operate.mjs";
import { recordProof, listProofs } from "../proof/ledger.mjs";
import { decomposeGoal } from "./decompose-goal.mjs";

export const STOP_REASONS = Object.freeze({
  COMPLETED: "completed",
  BLOCKED_UNSATISFIABLE: "blocked_unsatisfiable",
  BLOCKED_TASK_FAILED: "blocked_task_failed",
  NEEDS_APPROVAL: "needs_approval",
  MAX_ROUNDS: "max_rounds"
});

// Order tasks so every dependency precedes its dependents. Returns null on cycle
// (an unsatisfiable goal — you cannot complete a circular plan).
function topoOrder(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map(); // id -> 0 unvisited, 1 visiting, 2 done
  const order = [];
  let cyclic = false;
  const visit = (id) => {
    if (cyclic) return;
    const s = state.get(id) || 0;
    if (s === 2) return;
    if (s === 1) { cyclic = true; return; }
    state.set(id, 1);
    for (const dep of byId.get(id)?.deps || []) {
      if (byId.has(dep)) visit(dep);
    }
    state.set(id, 2);
    order.push(byId.get(id));
  };
  for (const t of tasks) visit(t.id);
  return cyclic ? null : order;
}

// Has this task already been driven to a passing proof? (idempotent resume)
function taskAlreadySatisfied(root, goalId, taskId) {
  return listProofs({ root }).some(
    (p) => p.tool === `goal:task:${goalId}:${taskId}` && p.status === "passed"
  );
}

// Default task driver: run the full operate loop for the task's goal/criteria.
async function operateRunTask({ task, root, repairer, approve }) {
  const result = await runOperate({
    root,
    goal: task.goal || task.id,
    acceptanceCriteria: task.acceptanceCriteria || [task.goal || task.id],
    files: task.files || [],
    repairer,
    approve
  });
  return result;
}

export async function driveGoal(options = {}) {
  const root = options.root || process.cwd();
  const objective = options.objective;
  if (!objective || !String(objective).trim()) throw new Error("driveGoal requires an objective");
  const goalId = options.goalId || `goal_${String(objective).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
  // Default decomposition is now the real structural decomposer (objective ->
  // clauses + profile gaps -> task DAG), not a trivial single task. Callers can
  // still inject a custom decompose (e.g. a model-backed one) or pass tasks.
  const decompose = options.decompose || ((ctx) => decomposeGoal({ objective: ctx.objective, root: ctx.root, projectPath: options.projectPath, modelDecompose: options.modelDecompose }));
  const runTask = options.runTask || operateRunTask;
  const maxRounds = options.maxRounds ?? 1; // each round drives the full DAG once
  const approve = options.approve === true;

  const tasks = await decompose({ objective, root });
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return finish(root, goalId, objective, STOP_REASONS.BLOCKED_UNSATISFIABLE, [], "decomposition produced no tasks");
  }
  const ordered = topoOrder(tasks);
  if (!ordered) {
    return finish(root, goalId, objective, STOP_REASONS.BLOCKED_UNSATISFIABLE, [], "task DAG has a dependency cycle");
  }

  const driven = [];
  for (let round = 0; round < maxRounds; round += 1) {
    let progressed = false;
    for (const task of ordered) {
      if (taskAlreadySatisfied(root, goalId, task.id)) {
        if (!driven.find((d) => d.id === task.id)) driven.push({ id: task.id, status: "passed", skipped: true });
        continue;
      }
      // A high-risk task may require explicit approval before the driver acts.
      if (task.requiresApproval && !approve) {
        return finish(root, goalId, objective, STOP_REASONS.NEEDS_APPROVAL, driven, `task "${task.id}" requires approval`);
      }
      const result = await runTask({ task, root, repairer: options.repairer, approve });
      const status = result?.status || "failed";
      recordProof(
        { tool: `goal:task:${goalId}:${task.id}`, status: status === "passed" ? "passed" : "failed", input: { task: task.id }, output: { status }, verifier: "drive-goal" },
        { root }
      );
      driven.push({ id: task.id, status, proofGraph: result?.proofGraphValidation?.status });
      progressed = true;
      if (status !== "passed") {
        // A task that declares itself unsatisfiable (e.g. impossible acceptance)
        // stops the whole goal with a precise reason rather than looping forever.
        const reason = result?.unsatisfiable ? STOP_REASONS.BLOCKED_UNSATISFIABLE : STOP_REASONS.BLOCKED_TASK_FAILED;
        return finish(root, goalId, objective, reason, driven, `task "${task.id}" did not pass (${status})`);
      }
    }
    if (!progressed) break; // everything was already satisfied
  }

  const allPassed = ordered.every((t) => driven.find((d) => d.id === t.id && d.status === "passed"));
  if (!allPassed) {
    return finish(root, goalId, objective, STOP_REASONS.MAX_ROUNDS, driven, "max rounds reached before all tasks passed");
  }
  return finish(root, goalId, objective, STOP_REASONS.COMPLETED, driven, "all tasks passed; goal accepted");
}

function finish(root, goalId, objective, stopReason, tasks, detail) {
  const completed = stopReason === STOP_REASONS.COMPLETED;
  const proof = recordProof(
    { tool: "goal:drive", status: completed ? "passed" : "blocked_not_verified", input: { goalId, objective }, output: { stopReason, tasks: tasks.length }, verifier: "drive-goal" },
    { root }
  );
  return { goalId, objective, stopReason, completed, detail, tasks, proofId: proof.proofId };
}
