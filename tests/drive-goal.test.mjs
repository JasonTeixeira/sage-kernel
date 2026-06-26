import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { driveGoal, STOP_REASONS } from "../packages/companion/drive-goal.mjs";
import { listProofs } from "../packages/proof/ledger.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-goal-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "g", type: "module" }));
  return dir;
}

// A deterministic stand-in for a model-driven task run. Records which tasks it
// was asked to do so we can assert ordering and idempotency.
function recordingRunner(behavior = {}) {
  const calls = [];
  const runTask = async ({ task }) => {
    calls.push(task.id);
    const b = behavior[task.id] || { status: "passed" };
    return { status: b.status, unsatisfiable: b.unsatisfiable, proofGraphValidation: { status: "passed" } };
  };
  return { runTask, calls };
}

const threeTaskDecompose = async () => [
  { id: "schema", goal: "design schema" },
  { id: "api", goal: "build api", deps: ["schema"] },
  { id: "ui", goal: "build ui", deps: ["api"] }
];

test("drives a 3-task DAG to completion in dependency order, anchoring a proof per task", async () => {
  const dir = tmp();
  try {
    const { runTask, calls } = recordingRunner();
    const res = await driveGoal({ root: dir, objective: "ship feature", decompose: threeTaskDecompose, runTask });
    assert.equal(res.stopReason, STOP_REASONS.COMPLETED);
    assert.equal(res.completed, true);
    assert.deepEqual(calls, ["schema", "api", "ui"], "tasks must run in topological order");
    // each task + the goal is anchored in the ledger
    const proofs = listProofs({ root: dir });
    for (const id of ["schema", "api", "ui"]) {
      assert.ok(proofs.some((p) => p.tool.endsWith(`:${id}`) && p.status === "passed"), `missing proof for ${id}`);
    }
    assert.ok(proofs.some((p) => p.tool === "goal:drive" && p.status === "passed"), "goal proof must be passed");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("typed stop on an UNSATISFIABLE task (no infinite churn)", async () => {
  const dir = tmp();
  try {
    const { runTask, calls } = recordingRunner({ api: { status: "failed", unsatisfiable: true } });
    const res = await driveGoal({ root: dir, objective: "ship feature", decompose: threeTaskDecompose, runTask });
    assert.equal(res.stopReason, STOP_REASONS.BLOCKED_UNSATISFIABLE);
    assert.equal(res.completed, false);
    assert.deepEqual(calls, ["schema", "api"], "must stop at the unsatisfiable task, not drive ui");
    assert.ok(listProofs({ root: dir }).some((p) => p.tool === "goal:drive" && p.status === "blocked_not_verified"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a plain task failure stops with BLOCKED_TASK_FAILED (distinct from unsatisfiable)", async () => {
  const dir = tmp();
  try {
    const { runTask } = recordingRunner({ schema: { status: "failed" } });
    const res = await driveGoal({ root: dir, objective: "x", decompose: threeTaskDecompose, runTask });
    assert.equal(res.stopReason, STOP_REASONS.BLOCKED_TASK_FAILED);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("idempotent re-run: already-satisfied tasks are SKIPPED, not redone", async () => {
  const dir = tmp();
  try {
    const first = recordingRunner();
    await driveGoal({ root: dir, objective: "ship feature", decompose: threeTaskDecompose, runTask: first.runTask });
    assert.deepEqual(first.calls, ["schema", "api", "ui"]);
    const second = recordingRunner();
    const res = await driveGoal({ root: dir, objective: "ship feature", decompose: threeTaskDecompose, runTask: second.runTask });
    assert.equal(res.stopReason, STOP_REASONS.COMPLETED);
    assert.deepEqual(second.calls, [], "a re-run must drive zero tasks (all already proven)");
    assert.ok(res.tasks.every((t) => t.skipped), "all tasks reported as skipped");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a dependency CYCLE is rejected as unsatisfiable (never starts driving)", async () => {
  const dir = tmp();
  try {
    const cyclic = async () => [
      { id: "a", goal: "a", deps: ["b"] },
      { id: "b", goal: "b", deps: ["a"] }
    ];
    const { runTask, calls } = recordingRunner();
    const res = await driveGoal({ root: dir, objective: "x", decompose: cyclic, runTask });
    assert.equal(res.stopReason, STOP_REASONS.BLOCKED_UNSATISFIABLE);
    assert.deepEqual(calls, [], "a cyclic plan must not drive any task");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("kernel.goal.drive MCP tool returns a typed stop on a cyclic DAG (dispatch wired)", async () => {
  const dir = tmp();
  try {
    const res = await callKernelTool(dir, "kernel.goal.drive", {
      objective: "x",
      tasks: [{ id: "a", goal: "a", deps: ["b"] }, { id: "b", goal: "b", deps: ["a"] }]
    });
    assert.equal(res.stopReason, STOP_REASONS.BLOCKED_UNSATISFIABLE);
    assert.equal(res.completed, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a task that requires approval stops with NEEDS_APPROVAL unless approved", async () => {
  const dir = tmp();
  try {
    const decompose = async () => [{ id: "deploy", goal: "deploy", requiresApproval: true }];
    const { runTask, calls } = recordingRunner();
    const blocked = await driveGoal({ root: dir, objective: "x", decompose, runTask });
    assert.equal(blocked.stopReason, STOP_REASONS.NEEDS_APPROVAL);
    assert.deepEqual(calls, [], "must not act on an approval-gated task without approval");
    const approved = await driveGoal({ root: dir, objective: "x", decompose, runTask, approve: true });
    assert.equal(approved.stopReason, STOP_REASONS.COMPLETED);
    assert.deepEqual(calls, ["deploy"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
