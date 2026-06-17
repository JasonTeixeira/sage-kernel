import fs from "node:fs";
import path from "node:path";

export const REVIEW_CATEGORIES = ["architecture", "clean_code", "testing", "security", "release"];
const FINDING_SEVERITIES = ["info", "low", "medium", "high", "critical"];
const EVIDENCE_KINDS = ["command", "file", "mcp_call", "ci_run", "manual", "url"];
const EVIDENCE_STATUSES = ["passed", "failed", "skipped", "warning"];
const REPORT_STATUSES = ["passed", "needs_work", "blocked", "failed"];

export function createReviewReport(input = {}) {
  const categories = Array.isArray(input.categories) ? input.categories : [];
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const remaining = Array.isArray(input.remaining) ? input.remaining : [];
  const scored = scoreReviewReport({ categories, evidence, remaining });
  return {
    id: input.id || "review_local",
    version: input.version || 1,
    generatedAt: input.generatedAt || new Date().toISOString(),
    project: input.project || { name: "unknown", root: "." },
    objective: input.objective || "Review project quality.",
    status: input.status || scored.status,
    score: input.score ?? scored.score,
    categories,
    evidence,
    remaining
  };
}

export function scoreReviewReport(report = {}) {
  const categories = Array.isArray(report.categories) ? report.categories : [];
  const validScores = categories.map((category) => category.score).filter((score) => Number.isFinite(score));
  const score = validScores.length > 0
    ? Math.round(validScores.reduce((sum, item) => sum + item, 0) / validScores.length)
    : 0;
  const findings = categories.flatMap((category) => Array.isArray(category.findings) ? category.findings : []);
  const hasCritical = findings.some((finding) => finding.severity === "critical");
  const hasHigh = findings.some((finding) => finding.severity === "high");
  const hasFailures = (report.evidence || []).some((item) => item.status === "failed");
  const hasRemaining = Array.isArray(report.remaining) && report.remaining.length > 0;
  const status = hasFailures || hasCritical
    ? "failed"
    : hasHigh || hasRemaining || findings.length > 0
      ? "needs_work"
      : "passed";
  return { score, status };
}

export function validateReviewReport(report, label = "review-report.json") {
  const failures = [];
  requireString(report?.id, /^review_[a-z0-9][a-z0-9_-]*$/, `${label}.id`, failures);
  requireIntegerRange(report?.version, 1, Number.MAX_SAFE_INTEGER, `${label}.version`, failures);
  requireDateTime(report?.generatedAt, `${label}.generatedAt`, failures);
  requireObject(report?.project, `${label}.project`, failures);
  requireString(report?.project?.name, null, `${label}.project.name`, failures);
  requireString(report?.project?.root, null, `${label}.project.root`, failures);
  if (report?.project?.commit !== undefined) requireString(report.project.commit, null, `${label}.project.commit`, failures);
  if (report?.project?.branch !== undefined) requireString(report.project.branch, null, `${label}.project.branch`, failures);
  requireString(report?.objective, null, `${label}.objective`, failures);
  requireEnum(report?.status, REPORT_STATUSES, `${label}.status`, failures);
  requireIntegerRange(report?.score, 0, 100, `${label}.score`, failures);
  requireArray(report?.categories, `${label}.categories`, failures);
  validateCategories(report?.categories, label, failures);
  requireArray(report?.evidence, `${label}.evidence`, failures);
  validateEvidence(report?.evidence, label, failures);
  if (!Array.isArray(report?.remaining)) {
    failures.push(`${label}.remaining must be an array`);
  } else {
    for (const [index, item] of report.remaining.entries()) {
      requireString(item, null, `${label}.remaining[${index}]`, failures);
    }
  }
  return { status: failures.length === 0 ? "passed" : "failed", failures };
}

export function validateReviewSystem(options = {}) {
  const root = options.root || process.cwd();
  const failures = [];
  const checked = { schemas: 0, fixtures: 0 };
  const schema = readJson(path.join(root, "packages/review/schemas/review-report.schema.json"), failures, "review-report.schema.json");
  if (schema) {
    checked.schemas += 1;
    validateSchema(schema, "review-report.schema.json", failures);
  }
  const fixture = readJson(path.join(root, "packages/review/fixtures/valid/review-report.json"), failures, "review-report.json");
  if (fixture) {
    checked.fixtures += 1;
    failures.push(...validateReviewReport(fixture, "review-report.json").failures);
  }
  return {
    status: failures.length === 0 ? "passed" : "failed",
    checked,
    contracts: ["review-report"],
    failures
  };
}

function validateCategories(categories, label, failures) {
  const seen = new Set();
  for (const required of REVIEW_CATEGORIES) {
    if (!categories?.some((category) => category.id === required)) failures.push(`${label} missing category: ${required}`);
  }
  for (const [index, category] of arrayItems(categories).entries()) {
    const categoryLabel = `${label}.categories[${index}]`;
    requireEnum(category.id, REVIEW_CATEGORIES, `${categoryLabel}.id`, failures);
    if (seen.has(category.id)) failures.push(`${categoryLabel}.id duplicates ${category.id}`);
    seen.add(category.id);
    requireIntegerRange(category.score, 0, 100, `${categoryLabel}.score`, failures);
    if (!Array.isArray(category.findings)) {
      failures.push(`${categoryLabel}.findings must be an array`);
      continue;
    }
    for (const [findingIndex, finding] of category.findings.entries()) {
      const findingLabel = `${categoryLabel}.findings[${findingIndex}]`;
      requireEnum(finding.severity, FINDING_SEVERITIES, `${findingLabel}.severity`, failures);
      requireString(finding.message, null, `${findingLabel}.message`, failures);
      requireString(finding.evidence, null, `${findingLabel}.evidence`, failures);
      if (finding.recommendation !== undefined) requireString(finding.recommendation, null, `${findingLabel}.recommendation`, failures);
    }
  }
}

function validateEvidence(evidence, label, failures) {
  for (const [index, item] of arrayItems(evidence).entries()) {
    const evidenceLabel = `${label}.evidence[${index}]`;
    requireEnum(item.kind, EVIDENCE_KINDS, `${evidenceLabel}.kind`, failures);
    requireString(item.ref, null, `${evidenceLabel}.ref`, failures);
    requireEnum(item.status, EVIDENCE_STATUSES, `${evidenceLabel}.status`, failures);
    if (item.summary !== undefined) requireString(item.summary, null, `${evidenceLabel}.summary`, failures);
  }
}

function validateSchema(schema, label, failures) {
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") failures.push(`${label} must use JSON Schema draft 2020-12`);
  if (schema.$id !== "https://sage-kernel.local/schemas/review/review-report.schema.json") failures.push(`${label} must use the canonical review schema id`);
  if (schema.type !== "object") failures.push(`${label} root type must be object`);
  if (schema.additionalProperties !== false) failures.push(`${label} must disallow unknown root properties`);
  if (!Array.isArray(schema.required) || schema.required.length === 0) failures.push(`${label} must define required fields`);
  if (!schema.properties || typeof schema.properties !== "object") failures.push(`${label} must define properties`);
}

function readJson(file, failures, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    failures.push(`Invalid ${label}: ${error.message}`);
    return null;
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

function requireString(value, pattern, label, failures) {
  if (typeof value !== "string" || value.length === 0) {
    failures.push(`${label} must be a non-empty string`);
    return;
  }
  if (pattern && !pattern.test(value)) failures.push(`${label} has invalid format: ${value}`);
}

function requireEnum(value, options, label, failures) {
  if (!options.includes(value)) failures.push(`${label} must be one of: ${options.join(", ")}`);
}

function requireIntegerRange(value, min, max, label, failures) {
  if (!Number.isInteger(value) || value < min || value > max) failures.push(`${label} must be between ${min} and ${max}`);
}

function requireDateTime(value, label, failures) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) failures.push(`${label} must be a valid date-time`);
}
