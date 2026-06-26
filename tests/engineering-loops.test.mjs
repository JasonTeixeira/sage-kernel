import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listLoops, getLoop, validateRegistry, loopPlan } from "../packages/loops/registry.mjs";
import {
  classifyGoalToLoop,
  selectLoop,
  recordLoopOverride,
  getLoopOverride,
  clearLoopOverride
} from "../packages/loops/selector.mjs";
import { runLoop } from "../packages/loops/run-loop.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

function tempProject(name = "loops-fixture") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-loops-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name, scripts: { test: "node --test" } }));
  return root;
}

const pass = () => async () => ({ status: "passed" });

// --- registry ---

test("the loop registry is valid and exposes the four loops", () => {
  assert.equal(validateRegistry().valid, true);
  const ids = listLoops().map((loop) => loop.id);
  for (const id of ["refactor-clean", "bugfix", "feature", "hardening-audit"]) assert.ok(ids.includes(id));
});

test("required gates are a subset of phases for every loop", () => {
  for (const loop of listLoops()) {
    const def = getLoop(loop.id);
    for (const gate of def.requiredGates) assert.ok(def.phases.includes(gate), `${loop.id}: ${gate}`);
  }
});

test("loopPlan injects high-risk gates only for risk-aware loops", () => {
  const feature = getLoop("feature");
  assert.ok(loopPlan(feature, "high").includes("security-proof"));
  assert.ok(!loopPlan(feature, "low").includes("security-proof"));
  const refactor = getLoop("refactor-clean");
  assert.ok(!loopPlan(refactor, "high").includes("security-proof")); // not risk-aware
});

// --- selector ---

test("classifyGoalToLoop maps intent keywords to loops", () => {
  assert.equal(classifyGoalToLoop("fix the failing login bug"), "bugfix");
  assert.equal(classifyGoalToLoop("refactor and remove dead code"), "refactor-clean");
  assert.equal(classifyGoalToLoop("audit the security posture"), "hardening-audit");
  assert.equal(classifyGoalToLoop("add a new export endpoint"), "feature");
  assert.equal(classifyGoalToLoop("something vague"), "feature");
});

test("classifyGoalToLoop maps the extended loop library intents", () => {
  assert.equal(classifyGoalToLoop("production is down, P1 incident"), "incident-response");
  assert.equal(classifyGoalToLoop("migrate the auth module to TypeScript"), "migration");
  assert.equal(classifyGoalToLoop("bump the outdated dependencies"), "dependency-upgrade");
  assert.equal(classifyGoalToLoop("optimize the slow checkout latency"), "performance-tuning");
  assert.equal(classifyGoalToLoop("harden the SQL injection in the API"), "security-hardening");
  assert.equal(classifyGoalToLoop("start a new app from scratch"), "greenfield");
  // Regression: audit must stay hardening-audit, not security-hardening.
  assert.equal(classifyGoalToLoop("audit the security posture"), "hardening-audit");
});

test("the loop library registers all 10 engineering loops and validates", () => {
  const ids = listLoops().map((loop) => loop.id);
  for (const id of ["refactor-clean", "bugfix", "feature", "hardening-audit", "migration", "incident-response", "performance-tuning", "security-hardening", "greenfield", "dependency-upgrade"]) {
    assert.ok(ids.includes(id), `missing loop: ${id}`);
  }
  assert.equal(validateRegistry().valid, true);
});

test("selectLoop precedence: explicit > learned > classified", () => {
  const root = tempProject();
  assert.equal(selectLoop({ root, goal: "fix bug", loop: "feature" }).source, "explicit");
  assert.equal(selectLoop({ root, goal: "fix bug" }).source, "classified");
  recordLoopOverride({ root, loop: "refactor-clean", reason: "house default" });
  const learned = selectLoop({ root, goal: "fix bug" });
  assert.equal(learned.source, "learned");
  assert.equal(learned.loop, "refactor-clean");
});

test("loop overrides persist and clear", () => {
  const root = tempProject();
  recordLoopOverride({ root, loop: "bugfix" });
  assert.equal(getLoopOverride({ root }).loop, "bugfix");
  assert.equal(clearLoopOverride({ root }), true);
  assert.equal(getLoopOverride({ root }), null);
});

test("recordLoopOverride rejects an unknown loop id", () => {
  const root = tempProject();
  assert.throws(() => recordLoopOverride({ root, loop: "not-a-loop" }), /Unknown loop id/);
});

// --- runLoop end to end ---

test("runLoop completes the refactor-clean loop with required gates met", async () => {
  const root = tempProject();
  const report = await runLoop({
    root,
    goal: "refactor and clean the module",
    files: ["docs/x.md"],
    gateRunners: { "dead-code": pass(), "impacted-tests": pass(), "code-review": pass() }
  });
  assert.equal(report.loopSelection.loop, "refactor-clean");
  assert.equal(report.loopSelection.source, "classified");
  assert.equal(report.status, "passed");
  assert.equal(report.loop.stopReason, "completed");
  assert.equal(report.loop.requiredGatesMet, true);
});

test("runLoop reports required_gate_failed when a required gate fails", async () => {
  const root = tempProject();
  const report = await runLoop({
    root,
    goal: "refactor the module",
    files: ["docs/x.md"],
    maxRepairAttempts: 0,
    gateRunners: { "dead-code": pass(), "impacted-tests": async () => ({ status: "failed" }), "code-review": pass() }
  });
  assert.equal(report.loop.requiredGatesMet, false);
  assert.equal(report.loop.stopReason, "required_gate_failed");
});

test("runLoop auto-selects bugfix from the goal", async () => {
  const root = tempProject();
  const report = await runLoop({
    root,
    goal: "fix the crashing parser bug",
    files: ["docs/x.md"],
    gateRunners: { "impacted-tests": pass(), "code-review": pass() }
  });
  assert.equal(report.loopSelection.loop, "bugfix");
});

test("runLoop respects a learned loop override", async () => {
  const root = tempProject();
  recordLoopOverride({ root, loop: "refactor-clean", reason: "house default" });
  const report = await runLoop({
    root,
    goal: "add a feature",
    files: ["docs/x.md"],
    gateRunners: { "dead-code": pass(), "impacted-tests": pass(), "code-review": pass() }
  });
  assert.equal(report.loopSelection.loop, "refactor-clean");
  assert.equal(report.loopSelection.source, "learned");
});

// --- MCP ---

test("MCP loop tools list, select, learn, and run through the dispatcher", async () => {
  const root = tempProject();
  const list = await callKernelTool(root, "kernel.loops.list", {});
  assert.ok(list.some((loop) => loop.id === "feature"));

  const selected = await callKernelTool(root, "kernel.loops.select", { goal: "fix a bug" });
  assert.equal(selected.loop, "bugfix");

  const learned = await callKernelTool(root, "kernel.loops.learn", { loop: "refactor-clean", reason: "default" });
  assert.equal(learned.override.loop, "refactor-clean");

  const run = await callKernelTool(root, "kernel.loops.run", {
    goal: "tidy up",
    files: ["docs/x.md"]
  });
  assert.equal(run.loopSelection.loop, "refactor-clean"); // learned override wins
});
