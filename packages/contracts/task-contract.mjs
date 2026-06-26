// Task Contract Engine — converts a goal into an executable contract BEFORE any
// implementation: objective, scope, profile, risk classification, acceptance
// criteria, and the required test/review/security/release gates. Implementation
// is blocked when acceptance criteria are missing. The contract seeds the proof
// graph so the loop knows exactly what must be proven.

import crypto from "node:crypto";
import { classifyText, riskLevelForClasses } from "../risk/diff-classifier.mjs";
import { detectProfileWithLearning } from "../profiles/profile-learning.mjs";
import { createGraph, addNode, addEdge } from "../proof/graph.mjs";

const SECURITY_SENSITIVE = new Set([
  "auth",
  "authorization",
  "payments",
  "healthcare_phi",
  "finance_trading",
  "secrets"
]);

const DEFAULT_STOP_CONDITIONS = [
  "Budget exhausted (max repair attempts reached).",
  "An unsafe operation requires human approval.",
  "A required gate is impossible to satisfy locally (blocked_not_verified)."
];

function safeProfile(root, provided) {
  if (provided) return provided;
  try {
    const detected = detectProfileWithLearning({ root, projectPath: "." });
    return {
      winner: detected.profileDecision?.winner || detected.profile?.id || "unknown",
      confidence: detected.profileDecision?.confidenceScore ?? detected.confidence ?? null,
      ambiguous: Boolean(detected.profileDecision?.ambiguous),
      source: detected.source || "detected"
    };
  } catch {
    return { winner: "unknown", confidence: null, ambiguous: false, source: "detected" };
  }
}

function gatesForRisk(level, classes) {
  const tests = ["impacted-tests"];
  if (classes.includes("db_migration")) tests.push("migration-tests", "rollback-tests");

  const review = level === "high" || level === "medium" ? ["code-review", "senior-review"] : ["code-review"];

  const needsSecurity = level === "high" || classes.some((cls) => SECURITY_SENSITIVE.has(cls));
  const security = needsSecurity ? ["secret-scan", "security-proof", "redteam"] : [];

  const needsRelease =
    level === "high" || classes.includes("release_pipeline") || classes.includes("infrastructure");
  const release = needsRelease ? ["release-check"] : [];

  return { tests, review, security, release };
}

export function createTaskContract(options = {}) {
  const root = options.root || process.cwd();
  const goal = options.goal || "";
  const profile = safeProfile(root, options.profile);
  const riskClasses = [...new Set([...(options.riskClasses || classifyText(goal)), ...(options.extraRiskClasses || [])])];
  const level = options.riskLevel || riskLevelForClasses(riskClasses);
  const acceptanceCriteria = (options.acceptanceCriteria || []).map((item) =>
    typeof item === "string" ? { id: `ac_${crypto.randomUUID().slice(0, 8)}`, label: item } : item
  );
  const gates = gatesForRisk(level, riskClasses);

  return {
    contractId: options.contractId || `contract_${crypto.randomUUID()}`,
    objective: goal,
    scope: options.scope || [],
    nonGoals: options.nonGoals || [],
    profile,
    riskClassification: { level, classes: riskClasses },
    acceptanceCriteria,
    requiredTests: gates.tests,
    requiredReviewGates: gates.review,
    requiredSecurityGates: gates.security,
    requiredReleaseGates: gates.release,
    stopConditions: options.stopConditions || DEFAULT_STOP_CONDITIONS,
    proofRequirements: [
      "Every required gate must write a proof record.",
      "Final report claims must pass the claim firewall.",
      "No success status without a proof-graph path."
    ],
    status: acceptanceCriteria.length > 0 ? "ready" : "blocked_missing_acceptance_criteria",
    canImplement: acceptanceCriteria.length > 0
  };
}

const REQUIRED_FIELDS = [
  "contractId",
  "objective",
  "profile",
  "riskClassification",
  "acceptanceCriteria",
  "requiredTests",
  "requiredReviewGates",
  "requiredSecurityGates",
  "requiredReleaseGates",
  "stopConditions",
  "proofRequirements",
  "status"
];

export function validateTaskContract(contract) {
  const errors = [];
  if (!contract || typeof contract !== "object") return { valid: false, errors: ["contract must be an object"] };
  for (const field of REQUIRED_FIELDS) {
    if (contract[field] === undefined || contract[field] === null) errors.push(`missing field: ${field}`);
  }
  if (contract.riskClassification && !["low", "medium", "high"].includes(contract.riskClassification.level)) {
    errors.push(`invalid risk level: ${contract.riskClassification.level}`);
  }
  if (!["ready", "blocked_missing_acceptance_criteria"].includes(contract.status)) {
    errors.push(`invalid status: ${contract.status}`);
  }
  return { valid: errors.length === 0, errors };
}

// Seed a proof graph from the contract: goal + one requirement per acceptance
// criterion + a risk node. This is what links the contract into the proof graph.
export function contractGraphSeed(contract) {
  let graph = createGraph({ contractId: contract.contractId });
  const goalId = `goal:${contract.contractId}`;
  graph = addNode(graph, { id: goalId, type: "goal", label: contract.objective || "goal" });
  contract.acceptanceCriteria.forEach((criterion, index) => {
    const reqId = `requirement:${contract.contractId}:${index}`;
    graph = addNode(graph, { id: reqId, type: "requirement", label: criterion.label });
    graph = addEdge(graph, { from: reqId, to: goalId, type: "satisfies" });
  });
  if (contract.riskClassification.classes.length > 0) {
    const riskId = `risk:${contract.contractId}`;
    graph = addNode(graph, { id: riskId, type: "risk", label: contract.riskClassification.classes.join(", ") });
    graph = addEdge(graph, { from: goalId, to: riskId, type: "depends_on" });
  }
  return graph;
}
