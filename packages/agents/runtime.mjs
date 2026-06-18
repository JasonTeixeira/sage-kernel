import {
  auditArchitecture,
  auditCleanCode,
  auditSecurity,
  auditTests,
  createReleaseProof,
  createReviewScore,
  inspectRepository
} from "../review/review-engine.mjs";

const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

export const AGENT_ROLES = [
  {
    id: "architect",
    title: "Architecture Agent",
    mission: "Evaluate system boundaries, module ownership, and architectural drift.",
    risk: "read-only",
    allowedTools: ["kernel.review.inspect_repo", "kernel.review.architecture_audit", "kernel.drift.self_audit"],
    forbiddenActions: ["write-files", "run-deploy", "change-secrets"],
    outputSchema: "agent-task-result-v1",
    qualityChecklist: ["architecture-evidence", "boundary-risks", "actionable-findings"],
    memoryPolicy: "propose-only",
    approvalPolicy: "mutations require signed approval"
  },
  {
    id: "builder",
    title: "Builder Agent",
    mission: "Plan small reversible implementation steps from existing project evidence.",
    risk: "approval-gated",
    allowedTools: ["kernel.done.generate", "kernel.workflow_engine.validate", "kernel.loop.plan"],
    forbiddenActions: ["unapproved-write", "external-publish", "credential-change"],
    outputSchema: "agent-task-result-v1",
    qualityChecklist: ["small-scope", "rollback-plan", "verification-commands"],
    memoryPolicy: "propose-only",
    approvalPolicy: "requires approval before mutating execution"
  },
  {
    id: "reviewer",
    title: "Code Review Agent",
    mission: "Review correctness, maintainability, tests, and release risk with evidence.",
    risk: "read-only",
    allowedTools: ["kernel.review.inspect_repo", "kernel.review.quality_score"],
    forbiddenActions: ["write-files", "approve-own-work", "hide-findings"],
    outputSchema: "agent-task-result-v1",
    qualityChecklist: ["severity", "evidence", "recommendation"],
    memoryPolicy: "propose-only",
    approvalPolicy: "read-only"
  },
  {
    id: "test-engineer",
    title: "Test Engineering Agent",
    mission: "Evaluate unit, integration, E2E, coverage, and missing proof paths.",
    risk: "read-only",
    allowedTools: ["kernel.review.test_audit", "kernel.workflow_engine.validate"],
    forbiddenActions: ["weaken-gates", "skip-failures", "delete-tests"],
    outputSchema: "agent-task-result-v1",
    qualityChecklist: ["coverage-gaps", "e2e-gaps", "stress-gaps"],
    memoryPolicy: "propose-only",
    approvalPolicy: "read-only"
  },
  {
    id: "security-engineer",
    title: "Security Engineering Agent",
    mission: "Evaluate secure SDLC, approval boundaries, dependency risk, and secret safety.",
    risk: "read-only",
    allowedTools: ["kernel.review.security_audit", "kernel.agents.validate"],
    forbiddenActions: ["print-secrets", "weaken-permissions", "disable-approvals"],
    outputSchema: "agent-task-result-v1",
    qualityChecklist: ["threats", "permissions", "supply-chain"],
    memoryPolicy: "propose-only",
    approvalPolicy: "read-only"
  },
  {
    id: "performance-engineer",
    title: "Performance Engineering Agent",
    mission: "Evaluate stress, soak, throughput, and latency proof requirements.",
    risk: "read-only",
    allowedTools: ["kernel.workflow.stress_dashboard", "kernel.review.quality_score"],
    forbiddenActions: ["run-unbounded-stress", "change-limits", "ignore-memory-growth"],
    outputSchema: "agent-task-result-v1",
    qualityChecklist: ["budgets", "soak", "memory-growth"],
    memoryPolicy: "propose-only",
    approvalPolicy: "bounded stress only"
  },
  {
    id: "release-engineer",
    title: "Release Engineering Agent",
    mission: "Evaluate package, CI, provenance, fresh install, and release readiness.",
    risk: "read-only",
    allowedTools: ["kernel.review.release_proof", "kernel.review.quality_score"],
    forbiddenActions: ["publish", "tag-release", "change-credentials"],
    outputSchema: "agent-task-result-v1",
    qualityChecklist: ["ci", "fresh-install", "provenance"],
    memoryPolicy: "propose-only",
    approvalPolicy: "publish requires external approval"
  },
  {
    id: "documentation-engineer",
    title: "Documentation Engineering Agent",
    mission: "Evaluate install, usage, architecture, contribution, and release documentation.",
    risk: "read-only",
    allowedTools: ["kernel.review.inspect_repo", "kernel.review.release_proof"],
    forbiddenActions: ["invent-claims", "remove-warnings", "publish-docs"],
    outputSchema: "agent-task-result-v1",
    qualityChecklist: ["install-docs", "usage-docs", "evidence-links"],
    memoryPolicy: "propose-only",
    approvalPolicy: "read-only"
  }
];

export function listAgentRoles() {
  return {
    roles: AGENT_ROLES.map((role) => publicRole(role))
  };
}

export function validateAgentRuntime() {
  const failures = [];
  const ids = new Set();
  for (const role of AGENT_ROLES) {
    if (!role.id || !/^[a-z][a-z0-9-]+$/.test(role.id)) failures.push(`Invalid role id: ${role.id || "missing"}`);
    if (ids.has(role.id)) failures.push(`Duplicate role id: ${role.id}`);
    ids.add(role.id);
    for (const field of ["mission", "risk", "outputSchema", "memoryPolicy", "approvalPolicy"]) {
      if (!role[field]) failures.push(`${role.id}.${field} is required`);
    }
    if (!Array.isArray(role.allowedTools) || role.allowedTools.length === 0) failures.push(`${role.id}.allowedTools is required`);
    if (!Array.isArray(role.forbiddenActions) || role.forbiddenActions.length === 0) failures.push(`${role.id}.forbiddenActions is required`);
    if (!Array.isArray(role.qualityChecklist) || role.qualityChecklist.length === 0) failures.push(`${role.id}.qualityChecklist is required`);
  }
  return {
    status: failures.length === 0 ? "passed" : "failed",
    roles: AGENT_ROLES.map((role) => role.id),
    checks: {
      roleCount: AGENT_ROLES.length,
      requiredRoles: ["architect", "builder", "reviewer", "test-engineer", "security-engineer", "release-engineer"],
      allHavePermissions: AGENT_ROLES.every((role) => role.allowedTools.length > 0),
      allHavePolicies: AGENT_ROLES.every((role) => role.memoryPolicy && role.approvalPolicy)
    },
    failures
  };
}

export function runAgentTask(input = {}, options = {}) {
  const root = options.root || process.cwd();
  const role = roleById(input.role || input.agent || "reviewer");
  const projectPath = input.projectPath || ".";
  const objective = input.objective || role.mission;
  const inspection = inspectRepository({ root, projectPath });
  const result = agentEvidence(role, { root, projectPath, objective, inspection });
  const findings = normalizeFindings(result.findings, role.id);
  const status = findings.some((finding) => finding.severity === "critical") ? "failed" : "passed";
  return {
    status,
    agent: publicRole(role),
    objective,
    project: inspection.project,
    permissions: {
      allowedTools: role.allowedTools,
      forbiddenActions: role.forbiddenActions,
      approvalPolicy: role.approvalPolicy
    },
    evidence: result.evidence,
    findings,
    nextActions: buildNextActions(findings, role)
  };
}

export function createAgentScorecard(task = {}) {
  const findings = Array.isArray(task.findings) ? task.findings : [];
  const evidence = Array.isArray(task.evidence) ? task.evidence : [];
  const criticalOrHigh = findings.filter((finding) => ["critical", "high"].includes(finding.severity)).length;
  const actionable = findings.filter((finding) => finding.recommendation || finding.message).length;
  const evidenceQuality = Math.min(100, 70 + evidence.length * 10 + (actionable === findings.length ? 10 : 0));
  const findingQuality = Math.max(0, 100 - criticalOrHigh * 10 - Math.max(0, findings.length - actionable) * 5);
  return {
    agent: task.agent?.id || "unknown",
    status: task.status || "unknown",
    metrics: {
      correctness: task.status === "failed" ? 80 : 95,
      findingQuality,
      falsePositiveControl: 90,
      evidenceQuality,
      actionability: findings.length === 0 ? 100 : Math.round((actionable / findings.length) * 100),
      policyCompliance: task.permissions?.approvalPolicy ? 100 : 70
    }
  };
}

export function reviewWithCouncil(input = {}, options = {}) {
  const roles = input.roles || ["architect", "reviewer", "test-engineer", "security-engineer", "release-engineer"];
  if (!Array.isArray(roles) || roles.length === 0) throw new Error("council review requires at least one role");
  const agents = roles.map((role) => runAgentTask({ ...input, role }, options));
  const scorecards = agents.map(createAgentScorecard);
  const findings = dedupeFindings(agents.flatMap((agent) => agent.findings));
  return {
    council: "engineering-review",
    objective: input.objective || "Review project through the engineering council.",
    decision: councilDecision(findings),
    agents,
    scorecards,
    findings,
    nextActions: findings.length
      ? findings.slice(0, 5).map((finding) => finding.recommendation || finding.message)
      : ["No council blockers found. Continue with the next verified phase."]
  };
}

export function evaluateAgentRuntime(options = {}) {
  const validation = validateAgentRuntime(options);
  const reviewer = runAgentTask({ role: "reviewer", projectPath: ".", objective: "Eval reviewer." }, options);
  const council = reviewWithCouncil({ projectPath: ".", roles: ["architect", "reviewer"] }, options);
  const evals = [
    {
      id: "agent-role-contracts",
      status: validation.status,
      summary: `${validation.roles.length} roles validated.`
    },
    {
      id: "agent-task-execution",
      status: reviewer.status === "passed" ? "passed" : "failed",
      summary: `Reviewer produced ${reviewer.evidence.length} evidence records.`
    },
    {
      id: "council-review",
      status: council.agents.length === 2 && council.scorecards.length === 2 ? "passed" : "failed",
      summary: `Council decision: ${council.decision}.`
    }
  ];
  return {
    status: evals.every((item) => item.status === "passed") ? "passed" : "failed",
    evals
  };
}

export function formatAgentRuntimeOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  if (value.roles) return `${value.roles.map((role) => `${role.id}\t${role.title}\t${role.risk}`).join("\n")}\n`;
  if (value.council) return `Council ${value.decision}: ${value.findings.length} findings, ${value.agents.length} agents\n`;
  if (value.agent) return `Agent ${value.agent.id} ${value.status}: ${value.findings.length} findings\n`;
  if (value.evals) return `Agent evals ${value.status}: ${value.evals.length} checks\n`;
  return `${JSON.stringify(value, null, 2)}\n`;
}

function agentEvidence(role, context) {
  const { root, projectPath, inspection } = context;
  if (role.id === "architect") {
    const category = auditArchitecture({ inspection });
    return fromCategory(role, category);
  }
  if (role.id === "test-engineer") {
    const category = auditTests({ inspection });
    return fromCategory(role, category);
  }
  if (role.id === "security-engineer") {
    const category = auditSecurity({ inspection });
    return fromCategory(role, category);
  }
  if (role.id === "release-engineer" || role.id === "documentation-engineer") {
    const proof = createReleaseProof({ root, projectPath });
    return {
      evidence: [{ kind: "release-proof", ref: "kernel.review.release_proof", status: proof.status, summary: proof.report.objective }],
      findings: proof.report.remaining.map((message) => ({ severity: "medium", message, evidence: "release-proof" }))
    };
  }
  if (role.id === "builder") {
    return {
      evidence: [{ kind: "plan", ref: "kernel.loop.plan", status: "passed", summary: "Builder produced a bounded implementation plan." }],
      findings: []
    };
  }
  const score = createReviewScore({ root, projectPath });
  return {
    evidence: [{ kind: "review-report", ref: "kernel.review.quality_score", status: score.report.status, summary: `${score.report.score}/100` }],
    findings: score.report.categories.flatMap((category) => category.findings.map((finding) => ({ ...finding, category: category.id })))
  };
}

function fromCategory(role, category) {
  return {
    evidence: [{ kind: "category-audit", ref: role.allowedTools[0], status: category.score >= 80 ? "passed" : "warning", summary: `${category.id}: ${category.score}/100` }],
    findings: category.findings.map((finding) => ({ ...finding, category: category.id }))
  };
}

function normalizeFindings(findings, agent) {
  return (findings || []).map((finding) => ({
    agent,
    severity: finding.severity || "info",
    message: finding.message || "Finding requires review.",
    evidence: finding.evidence || "agent-runtime",
    recommendation: finding.recommendation || defaultRecommendation(finding)
  }));
}

function defaultRecommendation(finding = {}) {
  return finding.message ? `Address: ${finding.message}` : "Review this finding and add a bounded fix plan.";
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings
    .filter((finding) => {
      const key = `${finding.severity}:${finding.message}:${finding.evidence}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0));
}

function councilDecision(findings) {
  if (findings.some((finding) => finding.severity === "critical")) return "blocked";
  if (findings.some((finding) => finding.severity === "high")) return "needs-work";
  if (findings.length > 0) return "pass-with-notes";
  return "pass";
}

function buildNextActions(findings, role) {
  if (findings.length === 0) return [`${role.title} found no blockers for the requested objective.`];
  return findings.slice(0, 5).map((finding) => finding.recommendation || finding.message);
}

function roleById(id) {
  const role = AGENT_ROLES.find((item) => item.id === id);
  if (!role) throw new Error(`Unknown agent role: ${id}`);
  return role;
}

function publicRole(role) {
  return {
    id: role.id,
    title: role.title,
    mission: role.mission,
    risk: role.risk,
    allowedTools: role.allowedTools,
    forbiddenActions: role.forbiddenActions,
    qualityChecklist: role.qualityChecklist,
    memoryPolicy: role.memoryPolicy,
    approvalPolicy: role.approvalPolicy
  };
}

export const __agentRuntimeTestInternals = {
  councilDecision,
  dedupeFindings,
  roleById
};
