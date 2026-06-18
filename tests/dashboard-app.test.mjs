import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  __dashboardTestInternals,
  createDashboardServer,
  createSnapshotCache,
  dashboardSnapshot,
  listDashboardWorkflows,
  renderDashboardHtml,
  renderMetrics,
  runDashboardWorkflow
} from "../apps/dashboard/server.mjs";
import { renderDashboardHtmlView } from "../apps/dashboard/dashboard-render.mjs";
import { __dashboardWorkflowTestInternals } from "../apps/dashboard/dashboard-workflows.mjs";
import { createSqliteAdapter } from "../packages/db/adapter.mjs";
import { createApprovalLedger } from "../packages/security/approvals.mjs";
import { EventEmitter } from "node:events";

const root = path.resolve(import.meta.dirname, "..");

test("dashboard snapshot exposes operational command-center panels", () => {
  const snapshot = dashboardSnapshot({ root });

  assert.equal(snapshot.version, "0.3.0");
  assert.equal(Array.isArray(snapshot.approvals.inbox), true);
  assert.equal(Array.isArray(snapshot.jobs.timeline), true);
  assert.equal(Array.isArray(snapshot.repos.health), true);
  assert.equal(Array.isArray(snapshot.templates.readiness), true);
  assert.equal(Array.isArray(snapshot.artifacts.recent), true);
  assert.equal(snapshot.operating.todayPlan.steps.length > 0, true);
  assert.equal(snapshot.operating.runbooks.length > 0, true);
  assert.equal(typeof snapshot.operating.evals.status, "string");
  assert.equal(snapshot.system.health.status, "operational");
  assert.equal(snapshot.system.coverage.line >= 80, true);
});

test("dashboard treats optional source repo federation as unconfigured, not missing", () => {
  const snapshot = dashboardSnapshot({ root });

  assert.equal(snapshot.repos.sourceRoot, "");
  assert.equal(snapshot.repos.health.length > 0, true);
  assert.equal(snapshot.repos.health.every((repo) => repo.status === "unconfigured"), true);
  assert.equal(snapshot.system.health.status, "operational");
});

test("dashboard HTML renders premium operations sections", () => {
  const html = renderDashboardHtml(dashboardSnapshot({ root }));

  for (const label of [
    "Approval Inbox",
    "Job Timeline",
    "Repo Health",
    "Template Readiness",
    "System Health",
    "Artifact Ledger",
    "Today's Plan",
    "Risk And Gates",
    "Runbooks",
    "Experiment History"
  ]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /data-panel="approval-inbox"/);
});

test("dashboard HTML view renders populated and fallback cockpit branches safely", () => {
  const snapshot = {
    version: "0.3.0<script>",
    generatedAt: "2026-06-17T00:00:00.000Z",
    phases: [{ status: "complete" }, { status: "pending" }],
    system: {
      health: { status: "degraded", summary: "Needs <attention>" },
      coverage: { line: 99, gate: "branch gate > 95" }
    },
    approvals: {
      pending: 1,
      inbox: [{ action: "deploy<prod>", status: "pending", signed: false, createdAt: "now", reason: "review & approve" }]
    },
    jobs: {
      timeline: [{ id: "run_1", jobId: "qa", status: "failed", durationMs: 7, signed: true }],
      queued: [{ id: "job_1", job_id: "release", status: "queued", priority: 3, attempts: 1, max_attempts: 2, next_run_at: "" }]
    },
    repos: {
      health: [{ name: "repo", role: "source", target: "packages/repo", status: "available", score: 88, domains: ["qa", "mcp"] }]
    },
    templates: {
      readiness: [{ id: "worker", qaProfile: "default", status: "ready", score: 100, coverage: ["tests"], stack: ["node"] }]
    },
    db: { projects: 1, queuedJobs: 1, runs: 1, approvals: 1, decisions: 0, artifacts: 0, auditEvents: 1, schemaMigrations: 6 },
    artifacts: { recent: [{ id: "artifact_1", kind: "report", path: "reports/a.json", createdAt: "now" }] },
    tools: ["kernel.qa.run"],
    operating: {
      todayPlan: null,
      evals: { status: "failed", summary: { passed: 0, total: 1 }, latestId: null },
      runbooks: [{ id: "runbook_test", title: "Test", risk: "low", stepCount: 1, verificationCount: 1, requiresApproval: false }],
      experiments: null
    }
  };
  const html = renderDashboardHtmlView(snapshot, [
    { id: "daily-summary", label: "Daily", command: "sage daily", description: "Run daily", risk: "safe", requiresApproval: false },
    { id: "full-qa", label: "Full QA", command: "sage full-qa .", description: "Run QA", risk: "local-compute", requiresApproval: true }
  ]);

  assert.match(html, /0\.3\.0&lt;script&gt;/);
  assert.match(html, /Needs &lt;attention&gt;/);
  assert.match(html, /No daily plan generated yet/);
  assert.match(html, /No experiment history available yet/);
  assert.match(html, /Request approval/);
  assert.match(html, /signed/);
  assert.match(html, /ready/);
  assert.doesNotMatch(html, /deploy<prod>/);
});

test("dashboard build emits static command center with operational panels", () => {
  const result = spawnSync("node", ["apps/dashboard/scripts/build-dashboard.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const htmlPath = path.join(root, "apps/dashboard/dist/index.html");
  assert.equal(fs.existsSync(htmlPath), true);
  const html = fs.readFileSync(htmlPath, "utf8");
  assert.match(html, /Approval Inbox/);
  assert.match(html, /Job Timeline/);
  assert.match(html, /System Health/);
  assert.match(html, /Today's Plan/);
  assert.match(html, /Risk And Gates/);
});

test("dashboard metrics expose health, tools, and DB record gauges", () => {
  const metrics = renderMetrics(dashboardSnapshot({ root }));

  assert.match(metrics, /sage_kernel_tools_total \d+/);
  assert.match(metrics, /sage_kernel_health_operational 1/);
  assert.match(metrics, /sage_kernel_db_records\{table="runs"\} \d+/);
});

test("dashboard HTTP server exposes health, readiness, metrics, snapshot, and HTML routes", async () => {
  const snapshot = dashboardSnapshot({ root });
  const server = createDashboardServer({ getSnapshot: () => snapshot });
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetchJson(`${baseUrl}/health`);
    assert.equal(health.statusCode, 200);
    assert.equal(health.body.status, "ok");

    const ready = await fetchJson(`${baseUrl}/ready`);
    assert.equal(ready.statusCode, 200);
    assert.equal(ready.body.status, "ready");

    const metrics = await fetchText(`${baseUrl}/metrics`);
    assert.equal(metrics.statusCode, 200);
    assert.match(metrics.body, /sage_kernel_tools_total/);

    const api = await fetchJson(`${baseUrl}/api/snapshot`);
    assert.equal(api.statusCode, 200);
    assert.equal(api.body.version, snapshot.version);

    const html = await fetchText(`${baseUrl}/`);
    assert.equal(html.statusCode, 200);
    assert.match(html.body, /Kernel Command Center/);

    const fallbackHtml = await fetchText(`${baseUrl}/unknown-route`);
    assert.equal(fallbackHtml.statusCode, 200);
    assert.match(fallbackHtml.body, /Kernel Command Center/);
  } finally {
    await close(server);
  }
});

test("dashboard workflow API exposes an allowlisted executable control plane", async () => {
  const sandbox = createDashboardFixture();
  const workflows = listDashboardWorkflows();
  assert.equal(workflows.some((workflow) => workflow.id === "daily-summary" && workflow.risk === "safe"), true);
  assert.equal(workflows.some((workflow) => workflow.id === "full-qa" && workflow.requiresApproval), true);

  const safe = await runDashboardWorkflow({ id: "pending-approvals" }, { root: sandbox });
  assert.equal(safe.status, "executed");
  assert.equal(safe.workflow.id, "pending-approvals");
  assert.equal(safe.result.status, 0);

  const blocked = await runDashboardWorkflow({ id: "full-qa" }, { root: sandbox });
  assert.equal(blocked.status, "approval_required");
  assert.match(blocked.approval.id, /^approval_/);

  const invalid = await runDashboardWorkflow({ id: "rm -rf ." }, { root: sandbox });
  assert.equal(invalid.status, "rejected");
});

test("dashboard guarded workflows require matching signed approvals before execution", async () => {
  const sandbox = createDashboardFixture();
  const requested = await runDashboardWorkflow({ id: "full-qa" }, { root: sandbox });
  const denied = await runDashboardWorkflow({ id: "full-qa", approvalId: requested.approval.id }, { root: sandbox });
  assert.equal(denied.status, "approval_denied");

  const db = createSqliteAdapter({ root: sandbox });
  db.init();
  createApprovalLedger({ db }).approve({ id: requested.approval.id, decidedBy: "test" });
  const executed = await runDashboardWorkflow({ id: "full-qa", approvalId: requested.approval.id }, { root: sandbox });
  assert.equal(executed.status, "failed");
  assert.equal(executed.workflow.id, "full-qa");
  assert.equal(executed.result.status, 1);
});

test("dashboard guarded workflow can execute an approved successful command", async () => {
  const sandbox = createDashboardFixture();
  fs.mkdirSync(path.join(sandbox, "apps/mcp-server/scripts"), { recursive: true });
  fs.writeFileSync(path.join(sandbox, "apps/mcp-server/scripts/call-tool.mjs"), "console.log(JSON.stringify({ ok: true }))\n");

  const requested = await runDashboardWorkflow({ id: "full-qa" }, { root: sandbox });
  const db = createSqliteAdapter({ root: sandbox });
  db.init();
  createApprovalLedger({ db }).approve({ id: requested.approval.id, decidedBy: "test" });

  const executed = await runDashboardWorkflow({ id: "full-qa", approvalId: requested.approval.id }, { root: sandbox });
  assert.equal(executed.status, "executed");
  assert.equal(executed.result.status, 0);
  assert.match(executed.result.stdout, /"ok":true/);
  assert.equal(Number(db.scalar("SELECT COUNT(*) FROM audit_events WHERE type='dashboard.workflow.executed';")), 1);
});

test("dashboard guarded workflow records approved failed runs and truncates large command output", async () => {
  const sandbox = createDashboardFixture();
  const requested = await runDashboardWorkflow({ id: "stress-dashboard" }, { root: sandbox });
  const db = createSqliteAdapter({ root: sandbox });
  db.init();
  createApprovalLedger({ db }).approve({ id: requested.approval.id, decidedBy: "test" });

  const executed = await runDashboardWorkflow({ id: "stress-dashboard", approvalId: requested.approval.id }, { root: sandbox });
  assert.equal(executed.status, "failed");
  assert.equal(executed.workflow.id, "stress-dashboard");

  const rows = db.query("SELECT job_id, status, result_json FROM job_runs WHERE job_id = ?;", ["dashboard.stress-dashboard"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "failed");
  const result = JSON.parse(rows[0].result_json);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.length <= 6000, true);
  assert.equal(result.stderr.length <= 2000, true);

  const audits = db.query("SELECT type FROM audit_events WHERE subject = ? ORDER BY created_at;", ["stress-dashboard"]);
  assert.equal(audits.some((row) => row.type === "dashboard.workflow.approval_requested"), true);
  assert.equal(audits.some((row) => row.type === "dashboard.workflow.failed"), true);
});

test("dashboard workflow internals cover fallback execution and id branches", () => {
  const sandbox = createDashboardFixture();
  const db = createSqliteAdapter({ root: sandbox });
  db.init();

  assert.equal(__dashboardWorkflowTestInternals.isSafeWorkflowId("daily-summary"), true);
  assert.equal(__dashboardWorkflowTestInternals.isSafeWorkflowId("x"), false);
  assert.equal(__dashboardWorkflowTestInternals.isSafeWorkflowId("../bad"), false);
  assert.equal(__dashboardWorkflowTestInternals.publicWorkflow({
    id: "fixture",
    input: { ok: true },
    tool: "kernel.fixture",
    label: "Fixture"
  }).tool, "kernel.fixture");

  const originalCrypto = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    assert.match(__dashboardWorkflowTestInternals.cryptoRandomId(), /^\d+_[a-f0-9]+/);
  } finally {
    Object.defineProperty(globalThis, "crypto", { value: originalCrypto, configurable: true });
  }

  const pending = __dashboardWorkflowTestInternals.executeWorkflowTool(sandbox, {
    id: "pending-approvals",
    input: { status: "pending" }
  });
  assert.equal(pending.status, 0);
  assert.match(pending.stdout, /pending_approvals/);

  db.execute(
    "INSERT INTO approvals (id, action, status, reason, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ["approval_pending_summary", "deploy", "pending", "review", "{}", "2026-01-01T00:00:00.000Z"]
  );
  db.execute(
    "INSERT INTO job_runs (id, job_id, status, duration_ms, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ["run_null_duration", "qa", "passed", null, "{}", "2026-01-01T00:00:00.000Z"]
  );
  const summary = __dashboardWorkflowTestInternals.createLocalDailySummary(sandbox);
  assert.equal(summary.status, "ready");
  assert.equal(summary.pendingApprovals, 1);
  assert.equal(summary.recentRuns[0].durationMs, 0);

  __dashboardWorkflowTestInternals.recordWorkflowRun(db, { id: "fixture" }, "passed", {
    status: null,
    stdout: "x".repeat(7000),
    stderr: "e".repeat(3000)
  });
  __dashboardWorkflowTestInternals.writeDashboardAudit(db, "dashboard.workflow.fixture", "fixture");
  const run = db.query("SELECT result_json FROM job_runs WHERE job_id = ? ORDER BY created_at DESC LIMIT 1", ["dashboard.fixture"])[0];
  const parsed = JSON.parse(run.result_json);
  assert.equal(parsed.status, null);
  assert.equal(parsed.stdout.length, 6000);
  assert.equal(parsed.stderr.length, 2000);
  assert.equal(Number(db.scalar("SELECT COUNT(*) FROM audit_events WHERE type='dashboard.workflow.fixture';")), 1);
});

test("dashboard daily workflow execution reports live degraded state", async () => {
  const sandbox = createDashboardFixture();
  const db = createSqliteAdapter({ root: sandbox });
  db.init();
  db.execute(
    "INSERT INTO job_runs (id, job_id, status, duration_ms, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ["run_failed", "fixture", "failed", 1, "{}", "2026-01-01T00:00:00.000Z"]
  );

  const result = await runDashboardWorkflow({ id: "daily-summary" }, { root: sandbox });
  assert.equal(result.status, "executed");
  const payload = JSON.parse(result.result.stdout);
  assert.equal(payload.workflow, "daily_summary");
  assert.equal(payload.status, "needs_attention");
  assert.equal(payload.recentRuns[0].status, "failed");
});

test("dashboard daily workflow execution reports healthy ready state", async () => {
  const sandbox = createDashboardFixture();
  const db = createSqliteAdapter({ root: sandbox });
  db.init();
  db.execute(
    "INSERT INTO job_runs (id, job_id, status, duration_ms, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ["run_passed", "fixture", "passed", 1, "{}", "2026-01-01T00:00:00.000Z"]
  );

  const result = await runDashboardWorkflow({ id: "daily-summary" }, { root: sandbox });
  assert.equal(result.status, "executed");
  const payload = JSON.parse(result.result.stdout);
  assert.equal(payload.status, "ready");
  assert.equal(payload.dashboard.status, "ok");
  assert.equal(payload.dashboard.summary, "No failed recent runs.");
  assert.equal(payload.pendingApprovals, 0);
  assert.equal(payload.recentRuns[0].status, "passed");
});

test("dashboard HTTP workflow routes validate input and preserve approval boundaries", async () => {
  const sandbox = createDashboardFixture();
  const server = createDashboardServer({ root: sandbox, ttlMs: 0 });
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const workflows = await fetchJson(`${baseUrl}/api/workflows`);
    assert.equal(workflows.statusCode, 200);
    assert.equal(workflows.body.workflows.some((workflow) => workflow.id === "daily-summary"), true);

    const safe = await postJson(`${baseUrl}/api/workflows/run`, { id: "pending-approvals" });
    assert.equal(safe.statusCode, 200);
    assert.equal(safe.body.status, "executed");

    const risky = await postJson(`${baseUrl}/api/workflows/run`, { id: "stress-dashboard" });
    assert.equal(risky.statusCode, 202);
    assert.equal(risky.body.status, "approval_required");

    const malformed = await postJson(`${baseUrl}/api/workflows/run`, { id: "../outside" });
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.body.status, "rejected");

    const badJson = await postRaw(`${baseUrl}/api/workflows/run`, "{not json");
    assert.equal(badJson.statusCode, 400);
    assert.equal(badJson.body.status, "rejected");

    const emptyBody = await postRaw(`${baseUrl}/api/workflows/run`, "");
    assert.equal(emptyBody.statusCode, 400);
    assert.equal(emptyBody.body.status, "rejected");
  } finally {
    await close(server);
  }
});

test("dashboard readiness returns 503 when health is degraded", async () => {
  const degraded = {
    system: { health: { status: "degraded", summary: "fixture" } },
    db: {},
    tools: []
  };
  const server = createDashboardServer({ getSnapshot: () => degraded });
  await listen(server);
  try {
    const ready = await fetchJson(`http://127.0.0.1:${server.address().port}/ready`);
    assert.equal(ready.statusCode, 503);
    assert.equal(ready.body.status, "not-ready");
  } finally {
    await close(server);
  }
});

test("dashboard snapshot covers run-file fallback, artifacts, approvals, and configured repo health", () => {
  const sandbox = createDashboardFixture();
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-dashboard-source-"));
  const repoDir = path.join(sourceRoot, "fixture-repo");
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, "package.json"), "{}\n");
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Fixture\n");
  fs.writeFileSync(path.join(sandbox, "catalog/repos.json"), JSON.stringify({
    sourceRoot,
    repos: [{ name: "fixture-repo", role: "source", target: "packages/fixture", score: 80, domains: ["qa"] }]
  }));

  fs.mkdirSync(path.join(sandbox, ".sage-kernel/runs"), { recursive: true });
  fs.writeFileSync(path.join(sandbox, ".sage-kernel/runs/run-file.json"), JSON.stringify({
    runId: "run-file",
    jobId: "repo-health",
    status: "passed",
    durationMs: 12,
    finishedAt: "2026-01-01T00:00:00.000Z"
  }));

  const db = createSqliteAdapter({ root: sandbox });
  db.init();
  db.execute(
    "INSERT INTO approvals (id, action, status, reason, payload_json, created_at) VALUES (?, ?, 'pending', ?, '{}', ?)",
    ["approval_1", "deploy", "needs review", "2026-01-01T00:00:00.000Z"]
  );
  db.execute(
    "INSERT INTO artifacts (id, kind, path, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)",
    ["artifact_1", "report", "reports/a.json", "not-json", "2026-01-01T00:00:00.000Z"]
  );

  const snapshot = dashboardSnapshot({ root: sandbox });
  assert.equal(snapshot.jobs.timeline[0].id, "run-file");
  assert.equal(snapshot.approvals.inbox[0].signed, false);
  assert.deepEqual(snapshot.artifacts.recent[0].metadata, {});
  assert.equal(snapshot.repos.health[0].status, "available");

  const html = renderDashboardHtml(snapshot);
  assert.match(html, /artifact_1/);
  assert.match(html, /deploy/);
});

test("dashboard snapshot covers string tools and template hardening branches", () => {
  const sandbox = createDashboardFixture();
  fs.writeFileSync(path.join(sandbox, "apps/mcp-server/tools.json"), JSON.stringify({ tools: ["kernel.string_tool"] }));
  fs.writeFileSync(path.join(sandbox, "catalog/templates.json"), JSON.stringify({
    templates: [
      { id: "thin", qaProfile: "minimal", coverage: ["qa"] },
      { id: "ready", qaProfile: "full", coverage: ["qa", "deploy", "docs", "security", "e2e", "stress"], defaultStack: ["node"] }
    ]
  }));

  const snapshot = dashboardSnapshot({ root: sandbox });
  assert.deepEqual(snapshot.tools, ["kernel.string_tool"]);
  assert.equal(snapshot.templates.readiness[0].status, "needs-hardening");
  assert.deepEqual(snapshot.templates.readiness[0].stack, []);
  assert.equal(snapshot.templates.readiness[1].status, "ready");
  assert.deepEqual(__dashboardTestInternals.templateReadiness([{ id: "empty" }])[0].coverage, []);
});

test("dashboard cockpit renders empty operational states without layout placeholders missing", () => {
  const sandbox = createDashboardFixture();
  const snapshot = dashboardSnapshot({ root: sandbox });
  const html = renderDashboardHtml(snapshot);

  assert.match(html, /No approvals recorded yet/);
  assert.match(html, /No job runs recorded yet/);
  assert.match(html, /No queued jobs visible/);
  assert.match(html, /No artifacts recorded yet/);
  assert.match(html, /Workflow Launcher/);
  assert.match(html, /Today's Plan/);
  assert.match(html, /Runbooks/);
  assert.match(html, /MCP Tool Explorer/);
  assert.match(html, /data-workflow-id="daily-summary"/);
  assert.match(html, /data-refresh-interval/);
  assert.match(html, /workflow-status/);
});

test("dashboard snapshot cache serves cached snapshots until the TTL expires", () => {
  const sandbox = createDashboardFixture();
  const getCached = createSnapshotCache({ root: sandbox, ttlMs: 60_000 });
  const first = getCached();
  fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ version: "9.9.9" }));
  assert.equal(getCached().version, first.version);

  const getExpired = createSnapshotCache({ root: sandbox, ttlMs: -1 });
  assert.equal(getExpired().version, "9.9.9");
});

test("dashboard HTTP server can use its default cached snapshot path", async () => {
  const sandbox = createDashboardFixture();
  const server = createDashboardServer({ root: sandbox, ttlMs: 60_000 });
  await listen(server);
  try {
    const ready = await fetchJson(`http://127.0.0.1:${server.address().port}/ready`);
    assert.equal(ready.statusCode, 200);
    assert.equal(ready.body.status, "ready");
  } finally {
    await close(server);
  }
});

test("dashboard internals cover defensive database and request parsing branches", async () => {
  const throwingDb = {
    scalar() {
      throw new Error("db unavailable");
    },
    query() {
      throw new Error("db unavailable");
    }
  };
  assert.equal(__dashboardTestInternals.tableCount(throwingDb, "projects"), 0);
  assert.equal(__dashboardTestInternals.tableCountWhere(throwingDb, "approvals", "status='pending'"), 0);
  assert.deepEqual(__dashboardTestInternals.safeQuery(throwingDb, "SELECT 1"), []);
  assert.equal(__dashboardTestInternals.safeValue(() => {
    throw new Error("fallback");
  }, "fallback"), "fallback");
  assert.equal(__dashboardTestInternals.safeValue(() => "ok", "fallback"), "ok");
  assert.throws(() => __dashboardTestInternals.tableCount(throwingDb, "missing"), /Unsupported table/);
  assert.throws(() => __dashboardTestInternals.tableCountWhere(throwingDb, "missing", "1=1"), /Unsupported table/);
  assert.deepEqual(__dashboardTestInternals.parseJson("{bad", { ok: false }), { ok: false });

  const emptyRequest = new EventEmitter();
  const emptyPromise = __dashboardTestInternals.readRequestJson(emptyRequest);
  emptyRequest.emit("end");
  assert.deepEqual(await emptyPromise, {});

  const badRequest = new EventEmitter();
  const badPromise = __dashboardTestInternals.readRequestJson(badRequest);
  badRequest.emit("data", "{bad");
  badRequest.emit("end");
  assert.deepEqual(await badPromise, {});

  const largeRequest = new EventEmitter();
  largeRequest.destroy = () => largeRequest.emit("error", new Error("too large"));
  const largePromise = __dashboardTestInternals.readRequestJson(largeRequest, 2);
  largeRequest.emit("data", "too large");
  assert.deepEqual(await largePromise, {});
});

test("dashboard internals cover snapshot helper fallback and row-mapping branches", () => {
  const sandbox = createDashboardFixture();
  assert.deepEqual(__dashboardTestInternals.readJson(sandbox, "missing.json", { fallback: true }), { fallback: true });
  assert.equal(__dashboardTestInternals.catalogSourceRoot({ sourceRootEnv: "SAGE_DASHBOARD_SOURCE_FIXTURE", sourceRoot: "/fallback" }), "/fallback");
  process.env.SAGE_DASHBOARD_SOURCE_FIXTURE = "/env-source";
  try {
    assert.equal(__dashboardTestInternals.catalogSourceRoot({ sourceRootEnv: "SAGE_DASHBOARD_SOURCE_FIXTURE", sourceRoot: "/fallback" }), "/env-source");
  } finally {
    delete process.env.SAGE_DASHBOARD_SOURCE_FIXTURE;
  }

  fs.mkdirSync(path.join(sandbox, ".sage-kernel/runs"), { recursive: true });
  fs.writeFileSync(path.join(sandbox, ".sage-kernel/runs/no-id.json"), JSON.stringify({ startedAt: "2026-01-01T00:00:00.000Z" }));
  fs.writeFileSync(path.join(sandbox, ".sage-kernel/runs/skip.txt"), "ignored");
  const fallbackRuns = __dashboardTestInternals.latestRunFiles(sandbox, 5);
  assert.equal(fallbackRuns[0].id, "no-id");
  assert.equal(fallbackRuns[0].jobId, "unknown");
  assert.equal(fallbackRuns[0].status, "unknown");
  assert.equal(fallbackRuns[0].durationMs, 0);

  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-dashboard-health-source-"));
  fs.mkdirSync(path.join(sourceRoot, "py-repo"), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, "py-repo", "pyproject.toml"), "[project]\nname='py-repo'\n");
  fs.writeFileSync(path.join(sourceRoot, "py-repo", "readme.md"), "# Py Repo\n");
  const health = __dashboardTestInternals.repoHealth(sandbox, {
    sourceRoot,
    repos: [
      { name: "py-repo", role: "source", target: "packages/py", score: 110, domains: null },
      { name: "missing-repo", role: "source", target: "packages/missing", score: 5, domains: ["qa"] }
    ]
  });
  assert.equal(health[0].status, "available");
  assert.equal(health[0].score, 100);
  assert.equal(health[0].hasPyproject, true);
  assert.deepEqual(health[0].domains, []);
  assert.equal(health[1].status, "missing");
  assert.equal(health[1].score, 0);

  const mappedDb = {
    query(sql) {
      if (sql.includes("FROM approvals")) {
        return [{ id: "approval", action: "deploy", status: "approved", reason: "ok", signature: "sig", decided_by: "me", created_at: "c", decided_at: "d" }];
      }
      if (sql.includes("FROM job_queue")) {
        return [{ id: "queued", job_id: "qa", status: "queued", priority: 1, attempts: 0, max_attempts: 2, created_at: "c", next_run_at: null }];
      }
      if (sql.includes("FROM job_runs")) {
        return [{ id: "run", job_id: "qa", status: "passed", duration_ms: null, result_json: "{}", signature: "sig", created_at: "c" }];
      }
      if (sql.includes("FROM artifacts")) {
        return [{ id: "artifact", kind: "report", path: "report.json", metadata_json: "{\"ok\":true}", created_at: "c" }];
      }
      return [];
    }
  };
  assert.equal(__dashboardTestInternals.latestApprovals(mappedDb)[0].signed, true);
  assert.equal(__dashboardTestInternals.latestQueuedJobs(mappedDb)[0].id, "queued");
  assert.equal(__dashboardTestInternals.latestJobRuns(mappedDb, sandbox)[0].durationMs, 0);
  assert.deepEqual(__dashboardTestInternals.latestArtifacts(mappedDb)[0].metadata, { ok: true });

  assert.equal(__dashboardTestInternals.systemHealth({
    phases: [{ status: "complete" }, { status: "pending" }],
    repoHealthRows: [{ status: "missing" }],
    templates: [],
    tools: [],
    jobTimeline: [{ status: "failed" }]
  }).status, "degraded");
  assert.match(__dashboardTestInternals.systemHealth({
    phases: [],
    repoHealthRows: [],
    templates: [{}],
    tools: ["kernel.test"],
    jobTimeline: []
  }).summary, /0\/0 phases complete/);
});

test("dashboard CLI entry starts a live server", async () => {
  const child = spawnSync("node", ["apps/dashboard/server.mjs"], {
    cwd: root,
    env: { ...process.env, SAGE_DASHBOARD_PORT: "0" },
    encoding: "utf8",
    timeout: 1000
  });
  assert.equal(child.error?.code, "ETIMEDOUT");
  assert.match(child.stdout, /Sage dashboard live/);
});

function createDashboardFixture() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "sage-dashboard-"));
  for (const dir of ["catalog", "apps/worker", "apps/mcp-server", "packages/db"]) {
    fs.mkdirSync(path.join(sandbox, dir), { recursive: true });
  }
  fs.copyFileSync(path.join(root, "packages/db/schema.sql"), path.join(sandbox, "packages/db/schema.sql"));
  fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ version: "1.2.3" }));
  fs.writeFileSync(path.join(sandbox, "catalog/phases.json"), JSON.stringify({ phases: [{ id: 1, status: "complete" }] }));
  fs.writeFileSync(path.join(sandbox, "catalog/repos.json"), JSON.stringify({ sourceRoot: "", repos: [] }));
  fs.writeFileSync(path.join(sandbox, "catalog/templates.json"), JSON.stringify({
    templates: [{ id: "fixture", qaProfile: "default", coverage: ["qa", "deploy"], defaultStack: ["node"] }]
  }));
  fs.writeFileSync(path.join(sandbox, "apps/worker/jobs.json"), JSON.stringify({ jobs: [{ id: "repo-health" }] }));
  fs.writeFileSync(path.join(sandbox, "apps/mcp-server/tools.json"), JSON.stringify({ tools: [{ name: "kernel.test" }] }));
  return sandbox;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function fetchJson(url) {
  const response = await fetch(url);
  return { statusCode: response.status, body: await response.json() };
}

async function fetchText(url) {
  const response = await fetch(url);
  return { statusCode: response.status, body: await response.text() };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { statusCode: response.status, body: await response.json() };
}

async function postRaw(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
  return { statusCode: response.status, body: await response.json() };
}
