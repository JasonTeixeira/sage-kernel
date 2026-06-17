import fs from "node:fs";
import path from "node:path";

import { readLatestEvalReport } from "./scripts/eval-runner.mjs";
import { createMemoryStore } from "./memory-store.mjs";

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

export function runbooksSmoke(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const validation = validateRunbooks({ root });
  const plan = createDailyPlan({ root });
  const adr = createAdr({ title: "Program 5 cockpit validation", decision: "Use local-first runbooks and plans." }, { root });
  return {
    status: validation.status === "passed" && plan.steps.length > 0 && adr.markdown.includes("# ADR:") ? "passed" : "failed",
    validation,
    plan: { id: plan.id, status: plan.status, steps: plan.steps.length, gates: plan.gates.length },
    adr: { id: adr.id, status: adr.status }
  };
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
