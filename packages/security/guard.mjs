import crypto from "node:crypto";
import { createSqliteAdapter } from "../db/adapter.mjs";
import { createApprovalLedger } from "./approvals.mjs";
import { isDestructiveCommand } from "../policy/engine.mjs";

const SAFE_ACTIONS = new Set([
  "phase.status",
  "catalog.search",
  "template.list",
  "project.plan",
  "profile.detect",
  "profile.gaps",
  "done.generate",
  "loop.plan",
  "loop.validate",
  "loop.prove",
  "loop.score",
  "loop.full_cycle",
  "workflow_engine.validate",
  "warehouse.summary",
  "warehouse.search",
  "qa.profile",
  "qa.plan",
  "repo.inspect",
  "infra.plan",
  "deploy.prepare",
  "jobs.list",
  "jobs.runs",
  "approvals.list",
  "dashboard.snapshot",
  "dogfood.prod",
  "workflow.explain_failures",
  "workflow.release_readiness",
  "workflow.pending_approvals",
  "workflow.stress_dashboard",
  "workflow.daily_summary",
  "semantic.index_project",
  "semantic.search_symbol",
  "semantic.find_references",
  "semantic.summarize_module",
  "adapters.list",
  "runbooks.list",
  "runbooks.plan_day",
  "runbooks.generate_adr",
  "agents.list",
  "agents.validate",
  "agents.doctor",
  "agent.roles",
  "agent.validate",
  "agent.run",
  "agent.eval",
  "council.review",
  "review.inspect_repo",
  "review.architecture_audit",
  "review.clean_code_audit",
  "review.test_audit",
  "review.security_audit",
  "review.diff_review",
  "review.route_test_map",
  "review.quality_score",
  "review.senior_review",
  "review.release_proof",
  "security.threat_model",
  "security.supply_chain",
  "security.proof",
  "security.sast",
  "security.polyglot",
  "chaos.matrix",
  "perf.incremental",
  "runtime.gate",
  "autonomy.harness",
  "intake.prd",
  "intake.design",
  "intake.contract",
  "generation.scaffold",
  "generation.prove",
  "security.dataflow",
  "deploy.verify_rollback",
  "sdlc.e2e",
  "enforce.proof_gate",
  "contract.install",
  "cockpit.status",
  "testing.strategy",
  "testing.playwright_template",
  "testing.performance_budget",
  "testing.proof",
  "evidence.list",
  "evidence.compare",
  "postmortem.generate",
  "redteam.agent_safety",
  "benchmark.matrix",
  "memory.policy",
  "memory.graph",
  "memory.learning_propose",
  "memory.learning_approve",
  "drift.map",
  "drift.scope",
  "drift.self_audit",
  "drift.proof",
  "proof.get",
  "proof.list",
  "proof.verify",
  "proof_graph.query",
  "proof_graph.validate",
  "claims.verify",
  "contract.create",
  "contract.validate",
  "risk.classify_diff",
  "testing.impact",
  "agents.route",
  "hallucination.scan",
  "refactor.dead_code",
  "policy.explain",
  "security.dlp",
  "daemon.status",
  "operate.diagnose",
  "agents.verify",
  "evals.model_rubric",
  "evals.ground",
  "learning.outcomes",
  "learning.recall_fix",
  "loops.list",
  "loops.select"
]);

const MUTATING_ACTIONS = new Set([
  "project.scaffold",
  "proof.record",
  "proof_graph.build",
  "operate.run",
  "goal.drive",
  "testing.mutation",
  "profile.learn",
  "loops.learn",
  "loops.run",
  "qa.run",
  "jobs.run",
  "jobs.enqueue",
  "worker.tick",
  "approvals.request",
  "approvals.approve",
  "workflow.audit_repo",
  "workflow.run_full_qa",
  "workflow.create_app",
  "loop.run",
  "workflow_engine.prove",
  "workflow_engine.run",
  "agents.install_global"
]);

export function isReadOnlyMode() {
  return process.env.SAGE_KERNEL_READ_ONLY === "1" || process.env.SAGE_KERNEL_READ_ONLY === "true";
}

export function assertToolAllowed(root, action, payload = {}) {
  if (SAFE_ACTIONS.has(action)) return { allowed: true, action };
  if (isReadOnlyMode()) {
    throw new Error(`Read-only mode blocks mutating action: ${action}`);
  }
  if (containsDestructiveCommand(payload) && !payload.approvalId) {
    const approval = requestApproval(root, action, `Destructive command payload requires approval: ${action}`, payload);
    throw new Error(`Action requires approval before execution: ${approval.id}`);
  }
  if (MUTATING_ACTIONS.has(action)) return { allowed: true, action };
  if (payload.approvalId) {
    const db = createSqliteAdapter({ root });
    db.init();
    const { approvalId, ...approvedPayload } = payload;
    return createApprovalLedger({ db }).verify({ id: approvalId, action, payload: approvedPayload });
  }
  const approval = requestApproval(root, action, `Unknown or high-risk action requires approval: ${action}`, payload);
  throw new Error(`Action requires approval before execution: ${approval.id}`);
}

export function requestApproval(root, action, reason, payload = {}) {
  const db = createSqliteAdapter({ root });
  db.init();
  return createApprovalLedger({ db }).request({ action, reason, payload });
}

export function listApprovals(root, status = null) {
  const db = createSqliteAdapter({ root });
  db.init();
  return createApprovalLedger({ db }).list(status);
}

export function signRecord(record) {
  return crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

function containsDestructiveCommand(payload) {
  // Strengthened via the central policy engine's destructive-pattern set
  // (fork bombs, curl|sh, chmod 777, dd, mkfs, rm -rf/-fr, disk erase, etc.).
  return isDestructiveCommand(JSON.stringify(payload || {}));
}
