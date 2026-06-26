import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageDir = path.join("packages", "intelligence");

const contracts = [
  {
    name: "memory-record",
    schema: "memory-record.schema.json",
    fixture: "memory-record.json",
    validate: validateMemoryRecord
  },
  {
    name: "eval-definition",
    schema: "eval-definition.schema.json",
    fixture: "eval-definition.json",
    validate: validateEvalDefinition
  },
  {
    name: "experiment-run",
    schema: "experiment-run.schema.json",
    fixture: "experiment-run.json",
    validate: validateExperimentRun
  },
  {
    name: "runbook",
    schema: "runbook.schema.json",
    fixture: "runbook.json",
    validate: validateRunbook
  },
  {
    name: "semantic-adapter",
    schema: "semantic-adapter.schema.json",
    fixture: "semantic-adapter.json",
    validate: validateSemanticAdapter
  }
];

export function validateIntelligence(options = {}) {
  const workspace = options.root || root;
  const fixtureDir = options.fixtureDir || path.join(workspace, packageDir, "test-fixtures", "valid");
  const failures = [];
  const checked = {
    schemas: 0,
    fixtures: 0,
    boundaries: 0,
    evals: 0
  };

  for (const contract of contracts) {
    const schemaPath = path.join(workspace, packageDir, "schemas", contract.schema);
    const schema = readJson(schemaPath, failures, `schema ${contract.schema}`);
    if (schema) {
      checked.schemas += 1;
      validateSchema(contract, schema, failures);
    }

    const fixturePath = path.join(fixtureDir, contract.fixture);
    const fixture = readJson(fixturePath, failures, `fixture ${contract.fixture}`);
    if (fixture) {
      checked.fixtures += 1;
      contract.validate(fixture, contract.fixture, failures);
    }
  }

  const boundaries = readJson(path.join(workspace, packageDir, "security-boundaries.json"), failures, "security-boundaries.json");
  if (boundaries) {
    validateSecurityBoundaries(boundaries, failures);
    checked.boundaries = boundaries.boundaries?.length || 0;
  }

  const evalDir = path.join(workspace, packageDir, "evals");
  if (fs.existsSync(evalDir)) {
    for (const file of fs.readdirSync(evalDir).filter((item) => item.endsWith(".json")).sort()) {
      const label = path.join("packages/intelligence/evals", file);
      const definition = readJson(path.join(evalDir, file), failures, label);
      if (definition) {
        checked.evals += 1;
        failures.push(...validateEvalDefinitionFile(definition, label));
      }
    }
  } else {
    failures.push("Missing packages/intelligence/evals");
  }

  return {
    status: failures.length === 0 ? "passed" : "failed",
    checked,
    contracts: contracts.map((contract) => contract.name),
    failures
  };
}

export function validateEvalDefinitionFile(definition, label = "eval-definition.json") {
  const failures = [];
  validateEvalDefinition(definition, label, failures);
  const graderIds = new Set();
  for (const [index, grader] of arrayItems(definition.graders).entries()) {
    if (graderIds.has(grader.id)) failures.push(`${label}.graders[${index}].id duplicates ${grader.id}`);
    graderIds.add(grader.id);
    if (grader.type === "coverage" && !Number.isFinite(grader.threshold)) {
      failures.push(`${label}.graders[${index}].threshold must be finite`);
    }
  }
  return failures;
}

export function validateMemoryRecordData(record, label = "memory-record.json") {
  const failures = [];
  validateMemoryRecord(record, label, failures);
  return failures;
}

function validateSchema(contract, schema, failures) {
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    failures.push(`${contract.schema} must use JSON Schema draft 2020-12`);
  }
  if (!schema.$id?.endsWith(`/intelligence/${contract.schema}`)) {
    failures.push(`${contract.schema} must use the canonical intelligence schema id`);
  }
  if (schema.type !== "object") failures.push(`${contract.schema} root type must be object`);
  if (schema.additionalProperties !== false) failures.push(`${contract.schema} must disallow unknown root properties`);
  if (!Array.isArray(schema.required) || schema.required.length === 0) {
    failures.push(`${contract.schema} must define required fields`);
  }
  if (!schema.properties || typeof schema.properties !== "object") {
    failures.push(`${contract.schema} must define properties`);
  }
}

function validateMemoryRecord(record, label, failures) {
  requireString(record.id, /^mem_[a-z0-9][a-z0-9_-]*$/, `${label}.id`, failures);
  requireString(record.projectId, null, `${label}.projectId`, failures);
  requireEnum(record.kind, ["episode", "fact", "decision", "test_result", "approval", "release_event"], `${label}.kind`, failures);
  requireEnum(record.source, ["user", "agent", "tool", "test", "ci", "git", "dashboard", "mcp"], `${label}.source`, failures);
  requireString(record.actor, null, `${label}.actor`, failures);
  requireNumberRange(record.confidence, 0, 1, `${label}.confidence`, failures);
  requireDateTime(record.observedAt, `${label}.observedAt`, failures);
  if (record.expiresAt !== undefined) requireDateTime(record.expiresAt, `${label}.expiresAt`, failures);
  if (record.supersedes !== undefined) requireStringArray(record.supersedes, `${label}.supersedes`, failures);
  requireObject(record.content, `${label}.content`, failures);
  requireString(record.content?.summary, null, `${label}.content.summary`, failures);
  if (record.content?.tags !== undefined) requireStringArray(record.content.tags, `${label}.content.tags`, failures);
  requireObject(record.provenance, `${label}.provenance`, failures);
  requireEnum(record.provenance?.evidenceType, ["command", "file", "url", "manual", "ci_run", "mcp_call"], `${label}.provenance.evidenceType`, failures);
  requireString(record.provenance?.evidenceRef, null, `${label}.provenance.evidenceRef`, failures);
}

function validateEvalDefinition(definition, label, failures) {
  requireString(definition.id, /^eval_[a-z0-9][a-z0-9_-]*$/, `${label}.id`, failures);
  requireString(definition.name, null, `${label}.name`, failures);
  requireEnum(definition.scope, [
    "mcp",
    "cli",
    "dashboard",
    "memory",
    "release",
    "template",
    "security",
    "sdlc",
    "benchmark",
    "orchestration",
    "architecture",
    "retrieval",
    "infrastructure",
    "evals"
  ], `${label}.scope`, failures);
  requireIntegerMin(definition.version, 1, `${label}.version`, failures);
  requireArray(definition.graders, `${label}.graders`, failures);
  for (const [index, grader] of arrayItems(definition.graders).entries()) {
    requireString(grader.id, null, `${label}.graders[${index}].id`, failures);
    requireEnum(grader.type, ["command", "json_schema", "file_exists", "coverage", "mcp_contract", "task_attempt", "model_rubric"], `${label}.graders[${index}].type`, failures);
    if (grader.type === "command") requireString(grader.command, null, `${label}.graders[${index}].command`, failures);
    if (grader.type === "task_attempt") requireString(grader.command, null, `${label}.graders[${index}].command`, failures);
    if (grader.type === "json_schema") requireString(grader.schema, null, `${label}.graders[${index}].schema`, failures);
    if (grader.type === "file_exists") requireString(grader.path, null, `${label}.graders[${index}].path`, failures);
    if (grader.type === "coverage") requireNumberRange(grader.threshold, 0, 100, `${label}.graders[${index}].threshold`, failures);
    if (grader.attempts !== undefined) requireIntegerMin(grader.attempts, 1, `${label}.graders[${index}].attempts`, failures);
    if (grader.minimumScore !== undefined) requireNumberRange(grader.minimumScore, 0, 1, `${label}.graders[${index}].minimumScore`, failures);
  }
  requireStringArray(definition.successCriteria, `${label}.successCriteria`, failures, { minItems: 1 });
}

function validateExperimentRun(run, label, failures) {
  requireString(run.id, /^exp_[a-z0-9][a-z0-9_-]*$/, `${label}.id`, failures);
  requireString(run.hypothesis, null, `${label}.hypothesis`, failures);
  requireEnum(run.status, ["planned", "running", "passed", "failed", "accepted", "rejected", "needs_review"], `${label}.status`, failures);
  requireDateTime(run.startedAt, `${label}.startedAt`, failures);
  if (run.endedAt !== undefined) requireDateTime(run.endedAt, `${label}.endedAt`, failures);
  requireObject(run.limits, `${label}.limits`, failures);
  requireIntegerMin(run.limits?.maxIterations, 1, `${label}.limits.maxIterations`, failures);
  requireIntegerMin(run.limits?.maxRuntimeSeconds, 1, `${label}.limits.maxRuntimeSeconds`, failures);
  if (typeof run.limits?.allowMutation !== "boolean") failures.push(`${label}.limits.allowMutation must be boolean`);
  requireObject(run.evaluation, `${label}.evaluation`, failures);
  requireString(run.evaluation?.command, null, `${label}.evaluation.command`, failures);
  requireString(run.evaluation?.metric, null, `${label}.evaluation.metric`, failures);
  requireObject(run.decision, `${label}.decision`, failures);
  requireEnum(run.decision?.outcome, ["pending", "accept", "reject", "review"], `${label}.decision.outcome`, failures);
}

function validateRunbook(runbook, label, failures) {
  requireString(runbook.id, /^runbook_[a-z0-9][a-z0-9_-]*$/, `${label}.id`, failures);
  requireString(runbook.title, null, `${label}.title`, failures);
  requireEnum(runbook.risk, ["low", "medium", "high", "critical"], `${label}.risk`, failures);
  requireArray(runbook.steps, `${label}.steps`, failures);
  for (const [index, step] of arrayItems(runbook.steps).entries()) {
    requireString(step.id, null, `${label}.steps[${index}].id`, failures);
    requireString(step.title, null, `${label}.steps[${index}].title`, failures);
    requireString(step.action, null, `${label}.steps[${index}].action`, failures);
  }
  requireStringArray(runbook.verification, `${label}.verification`, failures, { minItems: 1 });
}

function validateSemanticAdapter(adapter, label, failures) {
  requireString(adapter.id, /^semantic_[a-z0-9][a-z0-9_-]*$/, `${label}.id`, failures);
  requireString(adapter.name, null, `${label}.name`, failures);
  requireEnum(adapter.mode, ["local", "mcp", "external"], `${label}.mode`, failures);
  requireEnum(adapter.status, ["available", "missing", "degraded", "disabled"], `${label}.status`, failures);
  requireStringArray(adapter.capabilities, `${label}.capabilities`, failures, { minItems: 1 });
  for (const capability of arrayItems(adapter.capabilities)) {
    requireEnum(capability, ["index_project", "search_symbol", "find_references", "summarize_module", "plan_refactor", "apply_refactor"], `${label}.capability`, failures);
  }
  if (adapter.mutationPolicy !== undefined) {
    requireEnum(adapter.mutationPolicy, ["read_only", "approval_required", "disabled"], `${label}.mutationPolicy`, failures);
  }
  if (adapter.capabilities?.includes("apply_refactor") && adapter.mutationPolicy !== "approval_required") {
    failures.push(`${label}.mutationPolicy must be approval_required when apply_refactor is enabled`);
  }
}

function validateSecurityBoundaries(document, failures) {
  requireArray(document.boundaries, "security-boundaries.json.boundaries", failures);
  const seen = new Set();
  for (const [index, boundary] of arrayItems(document.boundaries).entries()) {
    const label = `security-boundaries.json.boundaries[${index}]`;
    requireString(boundary.action, null, `${label}.action`, failures);
    if (seen.has(boundary.action)) failures.push(`${label}.action duplicates ${boundary.action}`);
    seen.add(boundary.action);
    requireEnum(boundary.risk, ["safe", "read", "mutating", "local-write", "command", "external", "external-write", "destructive"], `${label}.risk`, failures);
    requireString(boundary.permission, /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/, `${label}.permission`, failures);
    if (typeof boundary.approvalRequired !== "boolean") failures.push(`${label}.approvalRequired must be boolean`);
    if (["local-write", "external", "external-write", "destructive"].includes(boundary.risk) && boundary.approvalRequired !== true) {
      failures.push(`${label}.approvalRequired must be true for ${boundary.risk} risk`);
    }
  }
}

function arrayItems(value) {
  return Array.isArray(value) ? value : [];
}

function requireObject(value, label, failures) {
  if (!value || typeof value !== "object" || Array.isArray(value)) failures.push(`${label} must be an object`);
}

function requireArray(value, label, failures) {
  if (!Array.isArray(value) || value.length === 0) failures.push(`${label} must be a non-empty array`);
}

function requireStringArray(value, label, failures, options = {}) {
  if (!Array.isArray(value)) {
    failures.push(`${label} must be an array of strings`);
    return;
  }
  if (options.minItems && value.length < options.minItems) failures.push(`${label} must contain at least ${options.minItems} item`);
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) failures.push(`${label} must contain only non-empty strings`);
  }
}

function requireString(value, pattern, label, failures) {
  if (typeof value !== "string" || value.length === 0) {
    failures.push(`${label} must be a non-empty string`);
    return;
  }
  if (pattern && !pattern.test(value)) failures.push(`${label} has invalid format: ${value}`);
}

function requireEnum(value, allowed, label, failures) {
  if (!allowed.includes(value)) failures.push(`${label} must be one of: ${allowed.join(", ")}`);
}

function requireNumberRange(value, min, max, label, failures) {
  if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) {
    failures.push(`${label} must be a number between ${min} and ${max}`);
  }
}

function requireIntegerMin(value, min, label, failures) {
  if (!Number.isInteger(value) || value < min) failures.push(`${label} must be an integer >= ${min}`);
}

function requireDateTime(value, label, failures) {
  requireString(value, null, label, failures);
  if (typeof value === "string" && Number.isNaN(Date.parse(value))) failures.push(`${label} must be a valid date-time`);
}

function readJson(file, failures, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    failures.push(`Invalid ${label}: ${error.message}`);
    return null;
  }
}

/* node:coverage ignore next 5 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateIntelligence({ root });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "passed" ? 0 : 1);
}
