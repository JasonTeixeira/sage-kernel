// Engineering Loops — declarative SDLC loop definitions. Each loop is data
// (phases of gate categories, required-before-exit gates, risk awareness, stop
// conditions). A single executor (operate) interprets any loop. This mirrors the
// proven "definition-is-data, executor-is-separate" model (dify/AutoGPT) and
// "required-before-exit gates + typed stop reasons" (Letta) — without their
// heavyweight registration magic or distributed infra.

// Typed stop reasons: a loop never ends ambiguously.
export const STOP_REASONS = {
  COMPLETED: "completed",
  REQUIRED_GATE_FAILED: "required_gate_failed",
  NEEDS_APPROVAL: "blocked_needs_approval",
  NEEDS_WORK: "needs_work",
  BLOCKED_MISSING_CRITERIA: "blocked_missing_acceptance_criteria"
};

// Gate categories an executor must know how to run. Loops reference these.
export const KNOWN_GATES = new Set([
  "scaffold-scan",
  "dead-code",
  "impacted-tests",
  "code-review",
  "senior-review",
  "secret-scan",
  "security-proof",
  "redteam",
  "release-check",
  "proof-graph",
  "audit",
  "mutation"
]);

// Risk-tier gates injected into a riskAware loop when the change is high risk.
export const HIGH_RISK_GATES = ["secret-scan", "security-proof", "release-check"];

export const ENGINEERING_LOOPS = [
  {
    id: "refactor-clean",
    version: 1,
    title: "Refactor / clean (no-debt)",
    whenToUse: "Refactoring, cleanup, dead-code or debt removal, simplification, tidying.",
    mutates: true,
    riskAware: false,
    phases: ["dead-code", "impacted-tests", "code-review"],
    requiredGates: ["dead-code", "impacted-tests"],
    stopConditions: [
      "No dead code (orphan files / unused deps) and tests stay green (no behavior change).",
      "Repair budget exhausted.",
      "An unsafe change requires approval."
    ],
    proofRequirements: ["No orphan files or unused dependencies.", "Tests stay green (no behavior change)."]
  },
  {
    id: "bugfix",
    version: 1,
    title: "Bugfix (TDD-first)",
    whenToUse: "Fixing a bug, error, regression, broken or failing behavior.",
    mutates: true,
    riskAware: true,
    phases: ["impacted-tests", "code-review"],
    requiredGates: ["impacted-tests"],
    stopConditions: ["Failing behavior is covered by a passing test.", "Repair budget exhausted."],
    proofRequirements: ["A test reproduces the bug and then verifies the fix."]
  },
  {
    id: "feature",
    version: 1,
    title: "Feature (contract -> TDD -> gates)",
    whenToUse: "Adding or building a new feature, capability, or endpoint.",
    mutates: true,
    riskAware: true,
    phases: ["impacted-tests", "code-review", "senior-review", "mutation"],
    requiredGates: ["impacted-tests"],
    stopConditions: [
      "All required and risk-appropriate gates pass.",
      "Repair budget exhausted.",
      "An unsafe change requires approval."
    ],
    proofRequirements: ["New behavior is covered by tests.", "Risk-appropriate security/review gates pass."]
  },
  {
    id: "hardening-audit",
    version: 1,
    title: "Hardening / audit (read-only)",
    whenToUse: "Auditing posture, hardening a weak area, scoring, or assessment.",
    mutates: false,
    riskAware: false,
    phases: ["scaffold-scan", "proof-graph", "audit"],
    requiredGates: [],
    stopConditions: ["Audit complete; gaps reported."],
    proofRequirements: ["Read-only; no mutations."]
  },
  {
    id: "migration",
    version: 1,
    title: "Migration / port (behavior-preserving)",
    whenToUse: "Migrating, porting, converting, or moving code between frameworks, languages, or platforms.",
    mutates: true,
    riskAware: true,
    phases: ["impacted-tests", "code-review", "senior-review"],
    requiredGates: ["impacted-tests"],
    stopConditions: ["Migrated behavior is covered by passing tests with no regression.", "Repair budget exhausted.", "An unsafe change requires approval."],
    proofRequirements: ["Pre- and post-migration behavior is proven equivalent by tests."]
  },
  {
    id: "incident-response",
    version: 1,
    title: "Incident response (fast, reversible)",
    whenToUse: "Production incident, outage, P0/P1, emergency hotfix, or rollback.",
    mutates: true,
    riskAware: true,
    phases: ["impacted-tests", "code-review"],
    requiredGates: ["impacted-tests"],
    stopConditions: ["Failing behavior is reproduced then fixed by a passing test.", "Mitigation applied and verified.", "Repair budget exhausted."],
    proofRequirements: ["A test reproduces the incident and verifies the mitigation; change is reversible."]
  },
  {
    id: "performance-tuning",
    version: 1,
    title: "Performance tuning (no behavior change)",
    whenToUse: "Optimizing performance, latency, throughput, or removing bottlenecks.",
    mutates: true,
    riskAware: false,
    phases: ["impacted-tests", "code-review", "mutation"],
    requiredGates: ["impacted-tests"],
    stopConditions: ["Behavior is unchanged (tests green) and the optimization is measured.", "Repair budget exhausted."],
    proofRequirements: ["Tests stay green (no behavior change); a benchmark proves the improvement."]
  },
  {
    id: "security-hardening",
    version: 1,
    title: "Security hardening (fix vulnerabilities)",
    whenToUse: "Hardening security, fixing vulnerabilities, injection/XSS/CSRF, or applying security patches.",
    mutates: true,
    riskAware: true,
    phases: ["secret-scan", "security-proof", "redteam", "code-review"],
    requiredGates: ["security-proof"],
    stopConditions: ["Vulnerabilities are fixed and proven by the security gates.", "Repair budget exhausted.", "An unsafe change requires approval."],
    proofRequirements: ["Security gates pass; the specific vulnerability is covered by a regression test."]
  },
  {
    id: "greenfield",
    version: 1,
    title: "Greenfield (new project from scratch)",
    whenToUse: "Starting a new app, project, or service from scratch; bootstrapping or scaffolding.",
    mutates: true,
    riskAware: true,
    phases: ["scaffold-scan", "impacted-tests", "code-review", "senior-review", "release-check"],
    requiredGates: ["impacted-tests"],
    stopConditions: ["New surface is covered by tests and passes the profile's gates.", "Repair budget exhausted.", "An unsafe change requires approval."],
    proofRequirements: ["New behavior is covered by tests; no scaffolding or debt is left behind."]
  },
  {
    id: "dependency-upgrade",
    version: 1,
    title: "Dependency upgrade (safe bump)",
    whenToUse: "Upgrading, bumping, or replacing dependencies; resolving outdated or vulnerable packages.",
    mutates: true,
    riskAware: true,
    phases: ["impacted-tests", "security-proof", "release-check"],
    requiredGates: ["impacted-tests"],
    stopConditions: ["Tests stay green after the upgrade and no new vulnerabilities are introduced.", "Repair budget exhausted."],
    proofRequirements: ["Tests stay green; dependency audit is clean after the upgrade."]
  }
];

export function listLoops() {
  return ENGINEERING_LOOPS.map((loop) => ({
    id: loop.id,
    title: loop.title,
    whenToUse: loop.whenToUse,
    mutates: loop.mutates,
    phases: loop.phases,
    requiredGates: loop.requiredGates
  }));
}

export function getLoop(id) {
  return ENGINEERING_LOOPS.find((loop) => loop.id === id) || null;
}

export function validateLoopDefinition(loop) {
  const errors = [];
  if (!loop || typeof loop !== "object") return { valid: false, errors: ["loop must be an object"] };
  if (!loop.id) errors.push("missing id");
  if (typeof loop.mutates !== "boolean") errors.push("mutates must be a boolean");
  if (!Array.isArray(loop.phases) || loop.phases.length === 0) errors.push("phases must be a non-empty array");
  for (const gate of loop.phases || []) {
    if (!KNOWN_GATES.has(gate)) errors.push(`unknown gate in phases: ${gate}`);
  }
  for (const gate of loop.requiredGates || []) {
    if (!(loop.phases || []).includes(gate)) errors.push(`requiredGate not in phases: ${gate}`);
  }
  return { valid: errors.length === 0, errors };
}

export function validateRegistry() {
  const errors = [];
  const ids = new Set();
  for (const loop of ENGINEERING_LOOPS) {
    if (ids.has(loop.id)) errors.push(`duplicate loop id: ${loop.id}`);
    ids.add(loop.id);
    const result = validateLoopDefinition(loop);
    if (!result.valid) errors.push(`${loop.id}: ${result.errors.join("; ")}`);
  }
  return { valid: errors.length === 0, errors };
}

// Resolve the gate plan for a loop, injecting risk-tier gates when the loop is
// risk-aware and the change is high risk.
export function loopPlan(loop, riskLevel = "low") {
  let plan = [...loop.phases];
  if (loop.riskAware && riskLevel === "high") {
    plan = [...new Set([...plan, ...HIGH_RISK_GATES])];
  }
  return plan;
}
