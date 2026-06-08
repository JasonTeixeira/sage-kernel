import crypto from "node:crypto";
import { ensureKernelSchema, runSql, sqlJson, sqlString } from "../db/scripts/db-lib.mjs";

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
  "dogfood.prod"
]);

const MUTATING_ACTIONS = new Set([
  "project.scaffold",
  "qa.run",
  "jobs.run",
  "jobs.enqueue",
  "worker.tick",
  "approvals.request"
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
  const approval = requestApproval(root, action, `Unknown or high-risk action requires approval: ${action}`, payload);
  throw new Error(`Action requires approval before execution: ${approval.id}`);
}

export function requestApproval(root, action, reason, payload = {}) {
  ensureKernelSchema(root);
  const now = new Date().toISOString();
  const id = `approval_${crypto.randomUUID()}`;
  runSql(
    root,
    `INSERT INTO approvals (id, action, status, reason, payload_json, created_at)
     VALUES (${sqlString(id)}, ${sqlString(action)}, 'pending', ${sqlString(reason)}, ${sqlJson(payload)}, ${sqlString(now)});`
  );
  return { id, action, status: "pending", reason, payload, createdAt: now };
}

export function listApprovals(root, status = null) {
  ensureKernelSchema(root);
  const where = status ? ` WHERE status = ${sqlString(status)}` : "";
  const output = runSql(
    root,
    `.mode json
SELECT id, action, status, reason, payload_json, created_at, decided_at FROM approvals${where} ORDER BY created_at DESC LIMIT 50;`
  );
  return output ? JSON.parse(output).map((row) => ({ ...row, payload: JSON.parse(row.payload_json || "{}") })) : [];
}

export function signRecord(record) {
  return crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex");
}
