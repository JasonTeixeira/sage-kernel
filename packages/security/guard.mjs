import crypto from "node:crypto";
import { createSqliteAdapter } from "../db/adapter.mjs";
import { createApprovalLedger } from "./approvals.mjs";

const SAFE_ACTIONS = new Set([
  "phase.status",
  "catalog.search",
  "template.list",
  "project.plan",
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
  "runbooks.list",
  "runbooks.plan_day",
  "runbooks.generate_adr"
]);

const MUTATING_ACTIONS = new Set([
  "project.scaffold",
  "qa.run",
  "jobs.run",
  "jobs.enqueue",
  "worker.tick",
  "approvals.request",
  "approvals.approve",
  "workflow.audit_repo",
  "workflow.run_full_qa",
  "workflow.create_app"
]);

export function isReadOnlyMode() {
  return process.env.SAGE_KERNEL_READ_ONLY === "1" || process.env.SAGE_KERNEL_READ_ONLY === "true";
}

export function assertToolAllowed(root, action, payload = {}) {
  if (SAFE_ACTIONS.has(action)) return { allowed: true, action };
  if (isReadOnlyMode()) {
    throw new Error(`Read-only mode blocks mutating action: ${action}`);
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
