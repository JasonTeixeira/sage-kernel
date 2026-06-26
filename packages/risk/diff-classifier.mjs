// Diff-to-Risk classifier — maps changed files (or a goal description) to risk
// classes and the gate categories that must run before the change can be
// trusted. This is what lets the operate loop decide what to prove BEFORE it
// edits, instead of running every gate every time.

import { spawnSync } from "node:child_process";

// Each rule: a risk class, a path/text pattern, and the gate categories it forces.
const RULES = [
  { riskClass: "auth", pattern: /(^|[\s\/._-])(auth|login|signin|sign-in|session|oauth|jwt)([\s\/._-]|$)/i, gates: ["security", "review", "tests"] },
  { riskClass: "authorization", pattern: /(authz|permission|rbac|\brole\b|access-control|guard|policy)/i, gates: ["security", "review", "tests"] },
  { riskClass: "payments", pattern: /(payment|stripe|billing|checkout|invoice|subscription)/i, gates: ["security", "review", "tests"] },
  { riskClass: "healthcare_phi", pattern: /(hipaa|\bphi\b|patient|clinical|\behr\b|\bemr\b|health-record)/i, gates: ["security", "review", "tests"] },
  { riskClass: "finance_trading", pattern: /(trading|\btrade\b|order-book|portfolio|quant|brokerage)/i, gates: ["security", "review", "tests"] },
  { riskClass: "secrets", pattern: /(secret|credential|\.env\b|apikey|api-key|private-key|\btoken\b)/i, gates: ["security", "review"] },
  { riskClass: "db_migration", pattern: /(migration|migrate|\.sql$|schema\.(sql|prisma)|knex|alembic)/i, gates: ["db_migration_tests", "review", "tests"] },
  { riskClass: "infrastructure", pattern: /(dockerfile|docker-compose|\.tf$|terraform|kubernetes|k8s|\.github\/workflows|helm)/i, gates: ["infra", "release", "review"] },
  { riskClass: "public_api", pattern: /(\/api\/|route\.(ts|js|mjs)$|openapi|swagger|graphql)/i, gates: ["contract", "smoke", "tests", "review"] },
  { riskClass: "mcp_tool_surface", pattern: /(tools\.json|kernel-tools|mcp-server|kernel-tool-helpers)/i, gates: ["contract", "smoke", "client", "drift", "tests"] },
  { riskClass: "cli_command", pattern: /(^bin\/|[\s\/._-]cli([\s\/._-]|$))/i, gates: ["smoke", "tests"] },
  { riskClass: "release_pipeline", pattern: /(^package\.json$|\/package\.json$|\.npmrc|\brelease\b|publish|provenance)/i, gates: ["release", "security", "tests"] },
  { riskClass: "test_only", pattern: /(\.test\.(mjs|js|ts)$|(^|\/)tests?\/|__tests__)/i, gates: ["tests"] },
  { riskClass: "docs_only", pattern: /(\.md$|(^|\/)docs\/|LICENSE|\.txt$)/i, gates: ["docs"] }
];

export const RISK_CLASSES = RULES.map((rule) => rule.riskClass);

const HIGH_RISK = new Set([
  "auth",
  "authorization",
  "payments",
  "healthcare_phi",
  "finance_trading",
  "secrets",
  "db_migration",
  "infrastructure",
  "public_api",
  "mcp_tool_surface",
  "release_pipeline"
]);

const GATES_BY_CLASS = Object.fromEntries(RULES.map((rule) => [rule.riskClass, rule.gates]));

export function classifyFile(filePath) {
  return RULES.filter((rule) => rule.pattern.test(filePath)).map((rule) => rule.riskClass);
}

// Classify arbitrary text (e.g. a goal description) for risk keywords.
export function classifyText(text) {
  const value = String(text || "");
  return RULES.filter((rule) => rule.pattern.test(value)).map((rule) => rule.riskClass);
}

export function riskLevelForClasses(classes) {
  if (classes.some((cls) => HIGH_RISK.has(cls))) return "high";
  if (classes.includes("cli_command")) return "medium";
  if (classes.length === 0) return "low";
  // Only test/docs changes are low risk.
  return classes.every((cls) => cls === "test_only" || cls === "docs_only") ? "low" : "medium";
}

export function gatesForClasses(classes) {
  return [...new Set(classes.flatMap((cls) => GATES_BY_CLASS[cls] || []))];
}

function riskLevelFor(classes) {
  return riskLevelForClasses(classes);
}

export function classifyDiff(files = [], options = {}) {
  const fileClasses = files.map((file) => ({ path: file, classes: classifyFile(file) }));
  const classes = [...new Set(fileClasses.flatMap((entry) => entry.classes))];
  const requiredGates = [...new Set(classes.flatMap((cls) => GATES_BY_CLASS[cls] || []))];
  return {
    riskLevel: riskLevelFor(classes),
    classes,
    files: fileClasses,
    requiredGates,
    summary: {
      fileCount: files.length,
      highRisk: classes.filter((cls) => HIGH_RISK.has(cls))
    }
  };
}

export function changedFiles(root = process.cwd()) {
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    return result.status === 0 ? String(result.stdout || "").trim() : "";
  };
  const tracked = git(["diff", "--name-only", "HEAD"]).split("\n").filter(Boolean);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
}

export function classifyRepoDiff(options = {}) {
  const root = options.root || process.cwd();
  return classifyDiff(options.files || changedFiles(root), options);
}
