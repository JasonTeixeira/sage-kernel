import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decomposeGoal } from "../packages/companion/decompose-goal.mjs";
import { driveGoal, STOP_REASONS } from "../packages/companion/drive-goal.mjs";
import { listProofs } from "../packages/proof/ledger.mjs";

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-decomp-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "d", type: "module" }));
  return dir;
}

test("decomposes a multi-clause objective into a real DAG (implement -> test/secure -> verify)", async () => {
  const dir = tmp();
  try {
    const tasks = await decomposeGoal({
      objective: "build the export API and add unit tests and run a security review",
      root: dir
    });
    const ids = tasks.map((t) => t.id);
    assert.ok(tasks.length >= 4, `expected several tasks, got ${ids.join(", ")}`);
    const impl = tasks.find((t) => t.phase === "implement");
    const testTask = tasks.find((t) => t.phase === "test");
    const secure = tasks.find((t) => t.phase === "secure");
    const verify = tasks.find((t) => t.phase === "verify");
    assert.ok(impl && testTask && secure && verify, `missing phases: ${tasks.map((t) => t.phase).join(",")}`);
    // dependency edges are concrete task ids, and resolve to the implement task
    assert.ok(testTask.deps.includes(impl.id), "test must depend on implement");
    assert.ok(secure.deps.includes(impl.id), "security must depend on implement");
    // verify gates on everything
    for (const t of tasks) if (t.id !== verify.id) assert.ok(verify.deps.includes(t.id), `verify must depend on ${t.id}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a deploy/release clause becomes an approval-gated task", async () => {
  const dir = tmp();
  try {
    const tasks = await decomposeGoal({ objective: "implement billing then deploy to production", root: dir });
    const release = tasks.find((t) => t.phase === "release");
    assert.ok(release, "expected a release task");
    assert.equal(release.requiresApproval, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("end-to-end: a decomposed multi-task goal drives to completion with a proof per task", async () => {
  const dir = tmp();
  try {
    const driven = [];
    const runTask = async ({ task }) => { driven.push(task.id); return { status: "passed", proofGraphValidation: { status: "passed" } }; };
    const res = await driveGoal({ root: dir, objective: "build the parser and add unit tests", runTask });
    assert.equal(res.stopReason, STOP_REASONS.COMPLETED, res.detail);
    assert.ok(res.tasks.length >= 3, "multi-task goal");
    // every driven task is anchored as a passing proof; goal proof is passing
    const proofs = listProofs({ root: dir });
    for (const t of res.tasks) {
      assert.ok(proofs.some((p) => p.tool.startsWith("goal:task:") && p.tool.endsWith(`:${t.id}`) && p.status === "passed"), `missing proof for ${t.id}`);
    }
    assert.ok(proofs.some((p) => p.tool === "goal:drive" && p.status === "passed"));
    // verify task ran LAST (its deps gate it)
    assert.equal(driven[driven.length - 1], "verify-goal");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("an injected model decomposer overrides the structural default", async () => {
  const dir = tmp();
  try {
    const modelDecompose = async () => [{ id: "a", goal: "a" }, { id: "b", goal: "b", deps: ["a"] }];
    const tasks = await decomposeGoal({ objective: "anything", root: dir, modelDecompose });
    assert.deepEqual(tasks.map((t) => t.id), ["a", "b"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
