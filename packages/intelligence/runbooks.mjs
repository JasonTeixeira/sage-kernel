import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

import { readLatestEvalReport } from "./scripts/eval-runner.mjs";
import { createMemoryStore } from "./memory-store.mjs";
import { createSqliteAdapter } from "../db/adapter.mjs";

export function listRunbooks(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const runbooks = [];
  const fixture = readJson(path.join(root, "packages/intelligence/fixtures/valid/runbook.json"), null);
  if (fixture) runbooks.push(fixture);
  const dir = path.join(root, "packages/intelligence/runbooks");
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir).filter((item) => item.endsWith(".json")).sort()) {
      const runbook = readJson(path.join(dir, file), null);
      if (runbook && !runbooks.some((item) => item.id === runbook.id)) runbooks.push(runbook);
    }
  }
  return runbooks.map((runbook) => ({
    ...runbook,
    stepCount: runbook.steps.length,
    verificationCount: runbook.verification.length
  }));
}

export function validateRunbooks(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const runbooks = listRunbooks({ root });
  const failures = [];
  for (const runbook of runbooks) {
    failures.push(...validateRunbookData(runbook, runbook.id || "runbook"));
  }
  return {
    status: failures.length === 0 ? "passed" : "failed",
    checked: { runbooks: runbooks.length },
    failures
  };
}

export function validateRunbookData(runbook, label = "runbook") {
  const failures = [];
  requireString(runbook.id, /^runbook_[a-z0-9][a-z0-9_-]*$/, `${label}.id`, failures);
  requireString(runbook.title, null, `${label}.title`, failures);
  requireEnum(runbook.risk, ["low", "medium", "high", "critical"], `${label}.risk`, failures);
  if (runbook.requiresApproval !== undefined && typeof runbook.requiresApproval !== "boolean") {
    failures.push(`${label}.requiresApproval must be boolean`);
  }
  if (!Array.isArray(runbook.steps) || runbook.steps.length === 0) failures.push(`${label}.steps must be a non-empty array`);
  for (const [index, step] of arrayItems(runbook.steps).entries()) {
    requireString(step.id, null, `${label}.steps[${index}].id`, failures);
    requireString(step.title, null, `${label}.steps[${index}].title`, failures);
    requireString(step.action, null, `${label}.steps[${index}].action`, failures);
    if (step.command !== undefined) requireString(step.command, null, `${label}.steps[${index}].command`, failures);
    if (step.timeoutMs !== undefined && (!Number.isInteger(step.timeoutMs) || step.timeoutMs < 1000 || step.timeoutMs > 300000)) {
      failures.push(`${label}.steps[${index}].timeoutMs must be an integer between 1000 and 300000`);
    }
    if (step.rollback !== undefined) {
      if (!step.rollback || typeof step.rollback !== "object" || Array.isArray(step.rollback)) {
        failures.push(`${label}.steps[${index}].rollback must be an object`);
      } else {
        requireString(step.rollback.description, null, `${label}.steps[${index}].rollback.description`, failures);
        if (step.rollback.command !== undefined) requireString(step.rollback.command, null, `${label}.steps[${index}].rollback.command`, failures);
      }
    }
  }
  if (!Array.isArray(runbook.verification) || runbook.verification.length === 0) {
    failures.push(`${label}.verification must be a non-empty array`);
  }
  return failures;
}

export function createDailyPlan(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const objective = options.objective || "Move Sage Kernel forward safely today.";
  const phases = readJson(path.join(root, "catalog/phases.json"), { phases: [] }).phases || [];
  const evalReport = readLatestEvalReport({ root });
  const runbooks = listRunbooks({ root });
  const memory = safeValue(() => createMemoryStore({ root, schemaRoot: options.schemaRoot }).audit(), { total: 0, latest: [] });
  const incomplete = phases.filter((phase) => phase.status !== "complete");
  const nextPhase = incomplete[0] || phases.at(-1) || { id: "daily", name: "Daily operations", goal: objective };

  const plan = {
    id: `plan_${dateStamp(new Date())}`,
    title: "Today’s Engineering Plan",
    objective,
    generatedAt: new Date().toISOString(),
    phase: {
      id: nextPhase.id,
      name: nextPhase.name,
      goal: nextPhase.goal || null
    },
    status: evalReport.status === "passed" ? "ready" : "needs_attention",
    risks: [
      {
        id: "risk_unverified_change",
        level: evalReport.status === "passed" ? "low" : "medium",
        description: "Do not treat new work as complete until tests, evals, and release checks pass."
      },
      {
        id: "risk_pending_memory",
        level: memory.total > 0 ? "low" : "medium",
        description: "Project context should be refreshed into durable memory as major decisions are made."
      }
    ],
    steps: [
      {
        id: "inspect_state",
        title: "Inspect project state",
        command: "npm run memory:state",
        evidence: "Project state reports git, eval, dashboard, memory, and approval posture."
      },
      {
        id: "run_quality_gate",
        title: "Run quality gate",
        command: "npm run qa:gate",
        evidence: "QA gate exits with status 0."
      },
      {
        id: "run_relevant_eval",
        title: "Run deterministic evals",
        command: "npm run eval:run",
        evidence: "Latest eval report is passed and persisted."
      },
      {
        id: "choose_runbook",
        title: "Use the matching runbook",
        command: runbooks[0]?.verification?.[0] || "npm run release:check",
        evidence: "Runbook verification commands are recorded with the result."
      }
    ],
    gates: [
      "npm test",
      "npm run test:coverage",
      "npm run eval:run",
      "npm run release:check",
      "git diff --check"
    ],
    evidence: {
      evalStatus: evalReport.status,
      evalSummary: evalReport.summary || { total: 0, passed: 0, failed: 0 },
      memoryRecords: memory.total,
      runbooks: runbooks.length
    }
  };
  return plan;
}

export function createOperatingSnapshot(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const latestEval = readLatestEvalReport({ root });
  return {
    todayPlan: createDailyPlan({ root, schemaRoot: options.schemaRoot, objective: options.objective }),
    runbooks: listRunbooks({ root }),
    evals: {
      status: latestEval.status,
      summary: latestEval.summary || { total: 0, passed: 0, failed: 0 },
      latestId: latestEval.id || null
    },
    experiments: readJson(path.join(root, "packages/intelligence/fixtures/valid/experiment-run.json"), null)
  };
}

export function createAdr(input = {}, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const title = input.title || "Untitled Decision";
  const status = input.status || "proposed";
  const id = input.id || `adr_${slug(title)}`;
  const adr = {
    id,
    title,
    status,
    date: input.date || new Date().toISOString().slice(0, 10),
    context: input.context || "Context not provided.",
    decision: input.decision || "Decision not provided.",
    consequences: input.consequences || "Consequences not provided.",
    verification: input.verification || ["Review this ADR with the relevant owner."]
  };
  const markdown = renderAdr(adr);
  if (input.out) {
    const outPath = resolveInsideRoot(root, input.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, markdown);
    return { ...adr, path: path.relative(root, outPath), markdown };
  }
  return { ...adr, path: null, markdown };
}

export function executeRunbookStep(input = {}, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const runbookId = input.runbook;
  const stepId = input.step;
  if (!runbookId || !stepId) throw new Error("runbook execution requires input.runbook and input.step");

  const runbook = listRunbooks({ root }).find((item) => item.id === runbookId);
  if (!runbook) throw new Error(`Unknown runbook: ${runbookId}`);
  const step = runbook.steps.find((item) => item.id === stepId);
  if (!step) throw new Error(`Unknown runbook step: ${stepId}`);

  const dryRun = input.dryRun !== false;
  const timeoutMs = Number(input.timeoutMs || step.timeoutMs || 120000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) throw new Error("Runbook step timeout must be between 1000 and 300000 ms");
  const plan = createRunbookStepPlan(runbook, step, { dryRun, timeoutMs });
  const db = options.db || createSqliteAdapter({ root, schemaRoot: options.schemaRoot });
  db.init();

  if (dryRun) {
    writeRunbookAudit(db, "runbook.step.planned", plan);
    return {
      status: "planned",
      runbook: plan.runbook,
      step: plan.step,
      command: plan.command,
      timeoutMs,
      approvalRequired: true,
      rollback: plan.rollback,
      auditId: writeRunbookAudit(db, "runbook.step.dry_run", plan)
    };
  }

  if (!isAllowedRunbookCommand(step.command)) {
    throw new Error(`Runbook command is not allowlisted: ${step.command || step.action}`);
  }

  const started = Date.now();
  const result = runShellCommand(root, step.command, timeoutMs, options.runner);
  const execution = {
    id: `runbook_${crypto.randomUUID()}`,
    status: result.status === 0 ? "passed" : "failed",
    runbook: plan.runbook,
    step: plan.step,
    command: plan.command,
    timeoutMs,
    durationMs: Date.now() - started,
    exitCode: result.status,
    stdout: boundedText(result.stdout),
    stderr: boundedText(result.stderr),
    rollback: plan.rollback
  };
  persistRunbookExecution(db, execution);
  writeRunbookAudit(db, "runbook.step.executed", execution);
  return execution;
}

export function runbooksSmoke(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const validation = validateRunbooks({ root });
  const plan = createDailyPlan({ root });
  const adr = createAdr({ title: "Program 5 cockpit validation", decision: "Use local-first runbooks and plans." }, { root });
  const stepPlan = safeValue(() => executeRunbookStep({
    runbook: "runbook_release_verification",
    step: "local_release_check",
    dryRun: true
  }, { root, schemaRoot: options.schemaRoot }), null);
  return {
    status: validation.status === "passed" && plan.steps.length > 0 && adr.markdown.includes("# ADR:") && stepPlan?.status === "planned" ? "passed" : "failed",
    validation,
    plan: { id: plan.id, status: plan.status, steps: plan.steps.length, gates: plan.gates.length },
    adr: { id: adr.id, status: adr.status },
    execution: stepPlan ? { status: stepPlan.status, runbook: stepPlan.runbook.id, step: stepPlan.step.id } : null
  };
}

function createRunbookStepPlan(runbook, step, { dryRun, timeoutMs }) {
  return {
    runbook: { id: runbook.id, title: runbook.title, risk: runbook.risk },
    step: { id: step.id, title: step.title, action: step.action },
    command: step.command || null,
    dryRun,
    timeoutMs,
    rollback: normalizeRollback(step.rollback)
  };
}

function normalizeRollback(rollback) {
  if (!rollback) {
    return {
      required: false,
      description: "No rollback is required for this read-only or verification step.",
      command: null
    };
  }
  return {
    required: true,
    description: rollback.description,
    command: rollback.command || null
  };
}

function isAllowedRunbookCommand(command) {
  if (!command) return false;
  return [
    "npm run adapters:smoke",
    "npm run eval:run",
    "npm run memory:state",
    "npm run qa:gate",
    "npm run release:check",
    "npm run runbooks:smoke",
    "npm run test:coverage",
    "git diff --check",
    "git status --short"
  ].includes(command);
}

function runShellCommand(root, command, timeoutMs, runner) {
  if (runner) return runner({ root, command, timeoutMs });
  const result = spawnSync(command, [], {
    cwd: root,
    encoding: "utf8",
    shell: true,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 8
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || (result.error ? result.error.message : "")
  };
}

function persistRunbookExecution(db, execution) {
  const now = new Date().toISOString();
  db.execute(
    `INSERT INTO artifacts (id, kind, path, metadata_json, created_at)
     VALUES (?, 'runbook-execution', ?, ?, ?)`,
    [execution.id, `.sage-kernel/runbooks/${execution.id}.json`, JSON.stringify(execution), now]
  );
}

function writeRunbookAudit(db, type, metadata) {
  const id = `audit_${crypto.randomUUID()}`;
  db.execute(
    `INSERT INTO audit_events (id, type, subject, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, type, metadata.runbook?.id || metadata.runbook || null, JSON.stringify(metadata), new Date().toISOString()]
  );
  return id;
}

function boundedText(value) {
  return String(value || "").slice(0, 8000);
}

function renderAdr(adr) {
  return [
    `# ADR: ${adr.title}`,
    "",
    `Status: ${adr.status}`,
    `Date: ${adr.date}`,
    "",
    "## Context",
    "",
    adr.context,
    "",
    "## Decision",
    "",
    adr.decision,
    "",
    "## Consequences",
    "",
    adr.consequences,
    "",
    "## Verification",
    "",
    ...adr.verification.map((item) => `- ${item}`),
    ""
  ].join("\n");
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function safeValue(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function requireString(value, pattern, label, failures) {
  if (typeof value !== "string" || value.length === 0) {
    failures.push(`${label} must be a non-empty string`);
    return;
  }
  if (pattern && !pattern.test(value)) failures.push(`${label} has invalid format`);
}

function requireEnum(value, values, label, failures) {
  if (!values.includes(value)) failures.push(`${label} must be one of: ${values.join(", ")}`);
}

function arrayItems(value) {
  return Array.isArray(value) ? value : [];
}

function dateStamp(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "_");
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "decision";
}

function resolveInsideRoot(root, target) {
  const absolute = path.resolve(root, target);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Path is outside the project root: ${target}`);
  return absolute;
}

export const __runbooksTestInternals = {
  arrayItems,
  boundedText,
  createRunbookStepPlan,
  dateStamp,
  isAllowedRunbookCommand,
  normalizeRollback,
  readJson,
  requireEnum,
  requireString,
  resolveInsideRoot,
  runShellCommand,
  safeValue,
  slug
};
