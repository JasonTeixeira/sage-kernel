import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  __workflowEngineTestInternals,
  createWorkflowEngineFixture,
  formatWorkflowEngineOutput,
  runWorkflow,
  validateWorkflowDefinition
} from "../packages/workflows/engine.mjs";

const root = new URL("..", import.meta.url).pathname;

test("workflow engine validates state-machine definitions", () => {
  const valid = validateWorkflowDefinition({
    id: "fixture",
    objective: "Prove deterministic workflow validation.",
    steps: [
      { id: "inspect", type: "inspect" },
      { id: "test", type: "test", command: "npm test" },
      { id: "review", type: "review" }
    ]
  });

  assert.equal(valid.status, "passed");
  assert.equal(valid.checked.steps, 3);
  assert.deepEqual(valid.states, ["proposed", "planned", "running", "verifying", "reviewing", "passed"]);

  const invalid = validateWorkflowDefinition({
    id: "../bad",
    steps: [
      { id: "x", type: "unknown" },
      { id: "x", type: "test" }
    ]
  });
  assert.equal(invalid.status, "failed");
  assert.match(invalid.failures.join("\n"), /Invalid workflow id/);
  assert.match(invalid.failures.join("\n"), /Unknown step type/);
  assert.match(invalid.failures.join("\n"), /Duplicate step id/);
});

test("workflow engine runs steps, retries with repair, and records audit trail", () => {
  const calls = [];
  const run = runWorkflow({
    id: "repair_loop",
    objective: "Fix a controlled failing test.",
    retryLimit: 1,
    steps: [
      { id: "inspect", type: "inspect" },
      { id: "unit", type: "test", command: "npm test" },
      { id: "review", type: "review" }
    ]
  }, {
    root,
    runner(command) {
      calls.push(command);
      return calls.length === 1
        ? { command, status: 1, stdout: "", stderr: "expected true got false" }
        : { command, status: 0, stdout: "ok", stderr: "" };
    },
    repairer(failure) {
      return { status: "repaired", summary: `patched after ${failure.step.id}` };
    }
  });

  assert.equal(run.status, "passed");
  assert.equal(run.state, "passed");
  assert.equal(run.steps.find((step) => step.id === "unit").attempts, 2);
  assert.equal(run.repairs.length, 1);
  assert.equal(run.audit.some((event) => event.type === "workflow.step.retry"), true);
  assert.equal(run.audit.some((event) => event.type === "workflow.repair.applied"), true);
  assert.equal(run.rollback.length, 0);
});

test("workflow engine blocks approval-gated steps and rolls back completed steps on failure", () => {
  const blocked = runWorkflow({
    id: "approval_loop",
    steps: [{ id: "release", type: "release", command: "npm publish", requiresApproval: true }]
  }, {
    root,
    approvals: []
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.state, "blocked");
  assert.match(blocked.nextActions[0], /approval/i);

  const rolledBack = runWorkflow({
    id: "rollback_loop",
    steps: [
      { id: "build", type: "command", command: "npm run build", rollback: "git checkout -- generated" },
      { id: "prove", type: "test", command: "npm test" }
    ]
  }, {
    root,
    runner(command) {
      return command === "npm test"
        ? { command, status: 2, stdout: "", stderr: "boom" }
        : { command, status: 0, stdout: "ok", stderr: "" };
    }
  });

  assert.equal(rolledBack.status, "failed");
  assert.equal(rolledBack.state, "failed");
  assert.deepEqual(rolledBack.rollback.map((entry) => entry.command), ["git checkout -- generated"]);
  assert.equal(rolledBack.audit.some((event) => event.type === "workflow.rollback.executed"), true);
});

test("workflow engine fixture proves controlled bug repair end to end", () => {
  const proof = createWorkflowEngineFixture({ root });

  assert.equal(proof.status, "passed");
  assert.equal(proof.before.status, "failed");
  assert.equal(proof.after.status, "passed");
  assert.equal(proof.workflow.repairs.length, 1);
  assert.equal(fs.readFileSync(path.join(proof.fixtureRoot, "src/math.mjs"), "utf8").includes("return 2"), true);
});

test("workflow engine CLI exposes validation and fixture proof", () => {
  const validate = spawnSync("node", ["bin/sage.mjs", "workflow", "validate", "--json"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(validate.status, 0, validate.stderr || validate.stdout);
  assert.equal(JSON.parse(validate.stdout).status, "passed");

  const prove = spawnSync("node", ["bin/sage.mjs", "workflow", "prove", "--json"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(prove.status, 0, prove.stderr || prove.stdout);
  assert.equal(JSON.parse(prove.stdout).status, "passed");

  assert.match(formatWorkflowEngineOutput(JSON.parse(prove.stdout)), /Workflow engine proof passed/);
});

test("workflow engine covers defensive branches and explicit workflow file runs", () => {
  const invalidRun = runWorkflow({ id: "bad workflow", steps: [] }, { root });
  assert.equal(invalidRun.status, "failed");
  assert.equal(invalidRun.state, "failed");
  assert.match(invalidRun.nextActions.join("\n"), /Invalid workflow id/);

  const auditEvents = [];
  const approved = runWorkflow({
    id: "approved_loop",
    retryLimit: "bogus",
    steps: [
      { id: "gate", type: "approval", requiresApproval: true, approvalId: "approval_gate" },
      { id: "docs", type: "docs", command: "npm run docs", retries: 2, rollback: ["undo docs", "undo cache"] }
    ]
  }, {
    root,
    approvals: [{ id: "approval_gate" }],
    auditSink(event) {
      auditEvents.push(event);
    },
    runner(command) {
      return command === "npm run docs"
        ? { status: 0, stdout: "docs ok", stderr: "" }
        : { status: 0, stdout: `rolled back ${command}`, stderr: "" };
    }
  });
  assert.equal(approved.status, "passed");
  assert.equal(approved.steps[0].status, "passed");
  assert.equal(auditEvents.length > 0, true);

  const noRepair = runWorkflow({
    id: "no_repair_loop",
    steps: [{ id: "security", type: "security", command: "npm run security:scan", retries: 1 }]
  }, {
    root,
    runner(command) {
      return { command, status: 9, stdout: "out", stderr: "" };
    }
  });
  assert.equal(noRepair.status, "failed");
  assert.match(noRepair.nextActions.join("\n"), /Failure signal: out/);

  const workflowFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sage-workflow-file-")), "workflow.json");
  fs.writeFileSync(workflowFile, JSON.stringify({
    id: "file_workflow",
    steps: [{ id: "inspect", type: "inspect" }]
  }));
  const cli = spawnSync("node", ["bin/sage.mjs", "workflow", "run", workflowFile, "--json"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.equal(JSON.parse(cli.stdout).status, "passed");

  assert.match(formatWorkflowEngineOutput({ status: "passed", id: "", state: "" }), /workflow/);
  assert.equal(__workflowEngineTestInternals.requiresCommand({ type: "inspect" }), false);
  assert.equal(__workflowEngineTestInternals.requiresCommand({ type: "release" }), true);
  assert.equal(__workflowEngineTestInternals.proofCommandResult("x", { status: 0 }).status, "passed");
  assert.equal(__workflowEngineTestInternals.proofCommandResult("x", { status: 1 }).status, "failed");
});

test("workflow engine covers approval variants, rollback arrays, and formatter branches", () => {
  const validation = validateWorkflowDefinition({
    id: "missing_command",
    steps: [{ id: "release", type: "release" }]
  });
  assert.equal(validation.status, "failed");
  assert.match(validation.failures.join("\n"), /requires a command/);

  const approvedByStep = runWorkflow({
    id: "approved_by_step",
    steps: [{ id: "approval_step", type: "approval", requiresApproval: true }]
  }, {
    root,
    approvals: ["approval_step"]
  });
  assert.equal(approvedByStep.status, "passed");

  const rollbackArray = runWorkflow({
    id: "rollback_array",
    steps: [
      { id: "generate", type: "command", command: "generate", rollback: ["rollback one", "rollback two"] },
      { id: "test", type: "test", command: "fail" }
    ]
  }, {
    root,
    runner(command) {
      return command === "fail"
        ? { command, status: 1, stdout: "", stderr: "" }
        : { command, status: 0, stdout: "", stderr: "" };
    }
  });
  assert.deepEqual(rollbackArray.rollback.map((entry) => entry.command), ["rollback one", "rollback two"]);
  assert.match(rollbackArray.nextActions.join("\n"), /Step failed: test/);

  const badWorkflowCli = spawnSync("node", ["bin/sage.mjs", "workflow", "unknown"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(badWorkflowCli.status, 1);
  assert.match(badWorkflowCli.stderr, /Unknown workflow subcommand/);

  const validOutput = validateWorkflowDefinition({ id: "ok", steps: [{ id: "inspect", type: "inspect" }] });
  assert.match(formatWorkflowEngineOutput(validOutput), /Workflow engine validation passed/);
  assert.match(formatWorkflowEngineOutput(validOutput, { json: true }), /"status": "passed"/);
  assert.equal(__workflowEngineTestInternals.compactStates(["proposed", "planned", "planned", "", null, "passed"]).join(","), "proposed,planned,passed");
  assert.equal(__workflowEngineTestInternals.normalizeCommandResult("x", { stdout: null, stderr: null }).status, 1);
});
