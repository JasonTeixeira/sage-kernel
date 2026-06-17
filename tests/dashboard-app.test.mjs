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
