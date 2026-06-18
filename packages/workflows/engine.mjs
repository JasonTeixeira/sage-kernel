import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const WORKFLOW_STATES = [
  "proposed",
  "planned",
  "approved",
  "running",
  "verifying",
  "reviewing",
  "fixing",
  "blocked",
  "failed",
  "passed",
  "released"
];

export const STEP_TYPES = [
  "inspect",
  "plan",
  "command",
  "test",
  "review",
  "security",
  "stress",
  "docs",
  "memory",
  "approval",
  "rollback",
  "release"
];

const STATE_BY_TYPE = {
  inspect: "running",
  plan: "planned",
  command: "running",
  test: "verifying",
  review: "reviewing",
  security: "verifying",
  stress: "verifying",
  docs: "running",
  memory: "running",
  approval: "approved",
  rollback: "running",
  release: "released"
};

export function validateWorkflowDefinition(definition = {}) {
  const failures = [];
  const id = definition.id || "";
  const steps = Array.isArray(definition.steps) ? definition.steps : [];
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(id)) failures.push("Invalid workflow id.");
  if (steps.length === 0) failures.push("Workflow must include at least one step.");
  const seen = new Set();
  for (const step of steps) {
    if (!step?.id || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(step.id)) failures.push("Invalid step id.");
    if (seen.has(step?.id)) failures.push(`Duplicate step id: ${step.id}`);
    seen.add(step?.id);
    if (!STEP_TYPES.includes(step?.type)) failures.push(`Unknown step type: ${step?.type || "missing"}`);
    if (requiresCommand(step) && !step.command) failures.push(`Step ${step.id || "unknown"} requires a command.`);
  }
  return {
    status: failures.length === 0 ? "passed" : "failed",
    states: compactStates(["proposed", "planned", ...steps.map((step) => STATE_BY_TYPE[step.type] || "failed"), "passed"]),
    checked: { steps: steps.length },
    failures
  };
}

export function runWorkflow(definition = {}, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const validation = validateWorkflowDefinition(definition);
  const audit = [];
  const steps = [];
  const repairs = [];
  const rollback = [];
  const completed = [];
  const retryLimit = numberOr(definition.retryLimit, 0);
  let state = "proposed";

  function transition(next, metadata = {}) {
    state = next;
    auditEvent(audit, options, {
      type: "workflow.state",
      workflow: definition.id,
      state,
      ...metadata
    });
  }

  auditEvent(audit, options, { type: "workflow.started", workflow: definition.id, state, objective: definition.objective || "" });
  if (validation.status === "failed") {
    transition("failed", { failures: validation.failures });
    return finalize({ definition, status: "failed", state, validation, steps, repairs, rollback, audit, nextActions: validation.failures });
  }

  transition("planned");
  for (const step of definition.steps) {
    if (step.requiresApproval && !hasApproval(step, options.approvals)) {
      transition("blocked", { step: step.id, reason: "approval_required" });
      const result = stepResult(step, { status: "blocked", attempts: 0, error: "Step requires approval." });
      steps.push(result);
      return finalize({
        definition,
        status: "blocked",
        state,
        validation,
        steps,
        repairs,
        rollback,
        audit,
        nextActions: [`Approval required before workflow step ${step.id} can execute.`]
      });
    }

    transition(STATE_BY_TYPE[step.type] || "running", { step: step.id });
    const result = executeStepWithRetry(step, { root, retryLimit, options, audit, repairs });
    steps.push(result);
    if (result.status === "passed") {
      completed.push(step);
      continue;
    }

    transition("failed", { step: step.id, error: result.error });
    rollback.push(...executeRollback(completed, { root, options, audit }));
    return finalize({
      definition,
      status: "failed",
      state,
      validation,
      steps,
      repairs,
      rollback,
      audit,
      nextActions: buildRepairPlan(result)
    });
  }

  transition("passed");
  return finalize({
    definition,
    status: "passed",
    state,
    validation,
    steps,
    repairs,
    rollback,
    audit,
    nextActions: ["Record the workflow proof and move to the next bounded phase."]
  });
}

export function createWorkflowEngineFixture(options = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-workflow-engine-"));
  fs.mkdirSync(path.join(fixtureRoot, "src"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "tests"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), JSON.stringify({
    type: "module",
    scripts: { test: "node tests/math.test.mjs" }
  }, null, 2));
  fs.writeFileSync(path.join(fixtureRoot, "src/math.mjs"), "export function addOne() { return 1; }\n");
  fs.writeFileSync(path.join(fixtureRoot, "tests/math.test.mjs"), [
    "import { addOne } from '../src/math.mjs';",
    "if (addOne() !== 2) {",
    "  console.error('expected addOne() to return 2');",
    "  process.exit(1);",
    "}",
    "console.log('fixture passed');"
  ].join("\n"));

  const before = runShell("npm test", { root: fixtureRoot });
  const workflow = runWorkflow({
    id: "fixture_repair",
    objective: "Repair controlled fixture test failure.",
    retryLimit: 1,
    steps: [
      { id: "inspect", type: "inspect" },
      { id: "unit", type: "test", command: "npm test" },
      { id: "review", type: "review" }
    ]
  }, {
    root: fixtureRoot,
    repairer(failure) {
      fs.writeFileSync(path.join(fixtureRoot, "src/math.mjs"), "export function addOne() { return 2; }\n");
      return { status: "repaired", summary: `Updated src/math.mjs after ${failure.step.id}.` };
    }
  });
  const after = runShell("npm test", { root: fixtureRoot });

  return {
    status: before.status !== 0 && after.status === 0 && workflow.status === "passed" ? "passed" : "failed",
    fixtureRoot,
    before: proofCommandResult("npm test", before),
    workflow,
    after: proofCommandResult("npm test", after)
  };
}

export function formatWorkflowEngineOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  if (value.checked) {
    return `Workflow engine validation ${value.status}: ${value.checked.steps} steps\n`;
  }
  if (value.fixtureRoot) {
    return `Workflow engine proof ${value.status}: before=${value.before.status}, after=${value.after.status}, repairs=${value.workflow.repairs.length}\n`;
  }
  return `Workflow ${value.status}: ${value.id || value.definition?.id || "workflow"} (${value.state || "unknown"})\n`;
}

function executeStepWithRetry(step, context) {
  const attempts = [];
  const maxAttempts = Math.max(1, numberOr(step.retries, context.retryLimit) + 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptResult = executeStep(step, context);
    attempts.push(attemptResult);
    auditEvent(context.audit, context.options, {
      type: "workflow.step.executed",
      workflowStep: step.id,
      attempt,
      status: attemptResult.status
    });
    if (attemptResult.status === 0) {
      return stepResult(step, { status: "passed", attempts: attempt, command: step.command || null, result: attemptResult });
    }
    if (attempt < maxAttempts && typeof context.options.repairer === "function") {
      const repair = context.options.repairer({ step, attempt, result: attemptResult });
      context.repairs.push({ step: step.id, attempt, ...repair });
      auditEvent(context.audit, context.options, {
        type: "workflow.repair.applied",
        workflowStep: step.id,
        attempt,
        repair
      });
    }
    if (attempt < maxAttempts) {
      auditEvent(context.audit, context.options, { type: "workflow.step.retry", workflowStep: step.id, attempt: attempt + 1 });
    }
  }
  const last = attempts.at(-1);
  return stepResult(step, {
    status: "failed",
    attempts: attempts.length,
    command: step.command || null,
    result: last,
    error: last?.stderr || last?.stdout || `Step failed: ${step.id}`
  });
}

function executeStep(step, { root, options }) {
  if (!requiresCommand(step)) return { command: null, status: 0, stdout: `${step.type} ok`, stderr: "" };
  const runner = options.runner || runShell;
  return normalizeCommandResult(step.command, runner(step.command, { root, step }));
}

function executeRollback(completed, { root, options, audit }) {
  const entries = [];
  for (const step of [...completed].reverse()) {
    if (!step.rollback) continue;
    const commands = Array.isArray(step.rollback) ? step.rollback : [step.rollback];
    for (const command of commands) {
      const runner = options.runner || runShell;
      const result = normalizeCommandResult(command, runner(command, { root, step, rollback: true }));
      const entry = { step: step.id, command, status: result.status, stdout: result.stdout, stderr: result.stderr };
      entries.push(entry);
      auditEvent(audit, options, { type: "workflow.rollback.executed", workflowStep: step.id, command, status: result.status });
    }
  }
  return entries;
}

function runShell(command, { root }) {
  return spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 1024 * 1024 * 8
  });
}

function normalizeCommandResult(command, result = {}) {
  return {
    command,
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim().slice(0, 4000),
    stderr: String(result.stderr || "").trim().slice(0, 4000)
  };
}

function proofCommandResult(command, result = {}) {
  const normalized = normalizeCommandResult(command, result);
  return {
    ...normalized,
    exitCode: normalized.status,
    status: normalized.status === 0 ? "passed" : "failed"
  };
}

function buildRepairPlan(result) {
  return [
    `Inspect failed step ${result.id}.`,
    result.error ? `Failure signal: ${result.error.slice(0, 240)}` : "Review command output.",
    "Apply the smallest repair, then rerun the exact failed step.",
    "Escalate if the same step fails after retry budget is exhausted."
  ];
}

function finalize({ definition, status, state, validation, steps, repairs, rollback, audit, nextActions }) {
  return {
    id: definition.id,
    objective: definition.objective || "",
    status,
    state,
    validation,
    steps,
    repairs,
    rollback,
    audit,
    nextActions
  };
}

function stepResult(step, fields) {
  return {
    id: step.id,
    type: step.type,
    ...fields
  };
}

function hasApproval(step, approvals = []) {
  return approvals.some((approval) => approval === step.id || approval?.step === step.id || approval?.id === step.approvalId);
}

function requiresCommand(step) {
  return ["command", "test", "security", "stress", "docs", "memory", "rollback", "release"].includes(step?.type);
}

function auditEvent(audit, options, event) {
  const normalized = {
    at: new Date().toISOString(),
    ...event
  };
  audit.push(normalized);
  if (typeof options.auditSink === "function") options.auditSink(normalized);
}

function compactStates(states) {
  return states.filter((state, index) => state && states.indexOf(state) === index);
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const __workflowEngineTestInternals = {
  buildRepairPlan,
  compactStates,
  executeRollback,
  normalizeCommandResult,
  proofCommandResult,
  requiresCommand,
  runShell
};
