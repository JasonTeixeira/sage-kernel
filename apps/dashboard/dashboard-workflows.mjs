import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteAdapter } from "../../packages/db/adapter.mjs";
import { createApprovalLedger } from "../../packages/security/approvals.mjs";

const defaultRoot = process.cwd();
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const workflowDefinitions = [
  {
    id: "daily-summary",
    label: "Daily Summary",
    command: "sage daily",
    description: "Current operating state, approvals, and recent runs.",
    risk: "safe",
    permission: "dashboard.workflow.read",
    requiresApproval: false,
    tool: "kernel.workflow.daily_summary",
    input: {}
  },
  {
    id: "audit-repo",
    label: "Audit Repo",
    command: "sage audit .",
    description: "Run fast QA and return next actions.",
    risk: "local-read",
    permission: "dashboard.workflow.qa",
    requiresApproval: false,
    tool: "kernel.workflow.audit_repo",
    input: { projectPath: ".", mode: "fast" }
  },
  {
    id: "full-qa",
    label: "Full QA",
    command: "sage full-qa .",
    description: "Run the standard app quality workflow.",
    risk: "local-compute",
    permission: "dashboard.workflow.qa",
    requiresApproval: true,
    tool: "kernel.workflow.run_full_qa",
    input: { projectPath: ".", mode: "standard" }
  },
  {
    id: "release-check",
    label: "Release Check",
    command: "sage release worker-service docker",
    description: "Verify readiness before shipping.",
    risk: "safe",
    permission: "dashboard.workflow.release",
    requiresApproval: false,
    tool: "kernel.workflow.release_readiness",
    input: { template: "worker-service", target: "docker" }
  },
  {
    id: "pending-approvals",
    label: "Approvals",
    command: "sage pending",
    description: "Review pending approval records.",
    risk: "safe",
    permission: "dashboard.workflow.read",
    requiresApproval: false,
    tool: "kernel.workflow.pending_approvals",
    input: { status: "pending" }
  },
  {
    id: "stress-dashboard",
    label: "Stress Test",
    command: "sage stress http://127.0.0.1:8787",
    description: "Exercise the local dashboard endpoint.",
    risk: "local-compute",
    permission: "dashboard.workflow.stress",
    requiresApproval: true,
    tool: "kernel.workflow.stress_dashboard",
    input: { url: "http://127.0.0.1:8787", endpoint: "/api/snapshot", count: 200, concurrency: 20 }
  }
];

export function listDashboardWorkflows() {
  return workflowDefinitions.map(({ input, tool, ...workflow }) => ({
    ...workflow,
    tool,
    input
  }));
}

export async function runDashboardWorkflow(request = {}, options = {}) {
  const root = options.root || defaultRoot;
  const workflow = workflowDefinitions.find((item) => item.id === request.id);
  if (!workflow || !isSafeWorkflowId(request.id)) {
    return { status: "rejected", error: "Unknown dashboard workflow" };
  }

  const db = createSqliteAdapter({ root });
  db.init();
  const ledger = createApprovalLedger({ db });
  const payload = { workflowId: workflow.id, tool: workflow.tool, input: workflow.input };
  if (workflow.requiresApproval) {
    if (!request.approvalId) {
      const approval = ledger.request({
        action: `dashboard.workflow.${workflow.id}`,
        reason: `${workflow.label} requires explicit approval from the dashboard.`,
        payload
      });
      writeDashboardAudit(db, "dashboard.workflow.approval_requested", workflow.id, {
        workflow: workflow.id,
        approvalId: approval.id,
        risk: workflow.risk
      });
      return { status: "approval_required", workflow: publicWorkflow(workflow), approval };
    }
    try {
      ledger.verify({
        id: request.approvalId,
        action: `dashboard.workflow.${workflow.id}`,
        payload
      });
    } catch (error) {
      return { status: "approval_denied", workflow: publicWorkflow(workflow), error: error.message };
    }
  }

  const result = executeWorkflowTool(root, workflow);
  const status = result.status === 0 ? "executed" : "failed";
  recordWorkflowRun(db, workflow, status === "executed" ? "passed" : "failed", result);
  writeDashboardAudit(db, `dashboard.workflow.${status}`, workflow.id, {
    workflow: workflow.id,
    tool: workflow.tool,
    exitCode: result.status
  });
  return { status, workflow: publicWorkflow(workflow), result };
}


function publicWorkflow(workflow) {
  const { input, tool, ...rest } = workflow;
  return { ...rest, tool, input };
}

function isSafeWorkflowId(value) {
  return /^[a-z0-9][a-z0-9-]{1,60}$/.test(String(value || ""));
}

function executeWorkflowTool(root, workflow) {
  if (workflow.id === "pending-approvals") {
    const db = createSqliteAdapter({ root });
    db.init();
    const approvals = createApprovalLedger({ db }).list(workflow.input.status);
    return { status: 0, stdout: JSON.stringify({ workflow: "pending_approvals", count: approvals.length, approvals }, null, 2), stderr: "" };
  }
  if (workflow.id === "daily-summary") {
    return { status: 0, stdout: JSON.stringify(createLocalDailySummary(root), null, 2), stderr: "" };
  }
  const result = spawnSync("node", [
    "apps/mcp-server/scripts/call-tool.mjs",
    workflow.tool,
    JSON.stringify(workflow.input)
  ], {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 8
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() || "",
    stderr: result.stderr?.trim() || ""
  };
}

function createLocalDailySummary(root) {
  const db = createSqliteAdapter({ root });
  db.init();
  const recentRuns = db.query(
    `SELECT id, job_id, status, duration_ms, created_at
     FROM job_runs ORDER BY created_at DESC LIMIT 5`
  ).map((row) => ({
    runId: row.id,
    jobId: row.job_id,
    status: row.status,
    durationMs: Number(row.duration_ms || 0),
    finishedAt: row.created_at
  }));
  const hasFailures = recentRuns.some((run) => run.status === "failed");
  const pendingApprovals = Number(db.scalar("SELECT COUNT(*) FROM approvals WHERE status='pending';") || 0);
  return {
    workflow: "daily_summary",
    status: hasFailures ? "needs_attention" : "ready",
    dashboard: {
      status: hasFailures ? "degraded" : "ok",
      summary: hasFailures ? "Recent job failures need attention." : "No failed recent runs.",
      tools: 0
    },
    pendingApprovals,
    recentRuns,
    nextActions: [
      "Run audit_repo on the active project.",
      "Review pending approvals before mutating actions.",
      "Run release_readiness before shipping."
    ]
  };
}

function recordWorkflowRun(db, workflow, status, result) {
  db.execute(
    `INSERT INTO job_runs (id, job_id, status, duration_ms, result_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      `run_${cryptoRandomId()}`,
      `dashboard.${workflow.id}`,
      status,
      0,
      JSON.stringify({ status: result.status, stdout: result.stdout.slice(0, 6000), stderr: result.stderr.slice(0, 2000) }),
      new Date().toISOString()
    ]
  );
}

function writeDashboardAudit(db, type, subject, metadata = {}) {
  db.execute(
    `INSERT INTO audit_events (id, type, subject, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [`audit_${cryptoRandomId()}`, type, subject, JSON.stringify(metadata), new Date().toISOString()]
  );
}

function cryptoRandomId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
