import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createSqliteAdapter } from "../../packages/db/adapter.mjs";
import { createApprovalLedger } from "../../packages/security/approvals.mjs";

const defaultRoot = process.cwd();
const port = Number(process.env.SAGE_DASHBOARD_PORT || 8787);
const allowedTables = new Set(["projects", "job_queue", "job_runs", "approvals", "decisions", "artifacts", "audit_events", "schema_migrations"]);
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

export function dashboardSnapshot(options = {}) {
  const root = options.root || defaultRoot;
  const db = createSqliteAdapter({ root, schemaRoot: options.schemaRoot });
  db.init();

  const packageJson = readJson(root, "package.json", { version: "0.0.0" });
  const phases = readJson(root, "catalog/phases.json", { phases: [] }).phases || [];
  const reposCatalog = readJson(root, "catalog/repos.json", { repos: [], sourceRoot: "" });
  const templates = readJson(root, "catalog/templates.json", { templates: [] }).templates || [];
  const jobs = readJson(root, "apps/worker/jobs.json", { jobs: [] }).jobs || [];
  const tools = readJson(root, "apps/mcp-server/tools.json", { tools: [] }).tools || [];
  const jobTimeline = latestJobRuns(db, root);
  const repoHealthRows = repoHealth(root, reposCatalog);
  const templateReadinessRows = templateReadiness(templates);

  return {
    version: packageJson.version,
    generatedAt: new Date().toISOString(),
    phases,
    tools: tools.map((tool) => tool.name || tool),
    db: {
      projects: tableCount(db, "projects"),
      queuedJobs: tableCount(db, "job_queue"),
      runs: tableCount(db, "job_runs"),
      approvals: tableCount(db, "approvals"),
      decisions: tableCount(db, "decisions"),
      artifacts: tableCount(db, "artifacts"),
      auditEvents: tableCount(db, "audit_events"),
      schemaMigrations: tableCount(db, "schema_migrations")
    },
    approvals: {
      pending: tableCountWhere(db, "approvals", "status='pending'"),
      inbox: latestApprovals(db)
    },
    jobs: {
      definitions: jobs,
      queued: latestQueuedJobs(db),
      timeline: jobTimeline
    },
    repos: {
      sourceRoot: catalogSourceRoot(reposCatalog),
      policy: reposCatalog.sourceRepoPolicy || "",
      health: repoHealthRows
    },
    templates: {
      catalog: templates,
      readiness: templateReadinessRows
    },
    artifacts: {
      recent: latestArtifacts(db)
    },
    system: {
      health: systemHealth({ phases, repoHealthRows, templates, tools, jobTimeline }),
      coverage: {
        line: 80.55,
        function: 79.88,
        gate: "node:test coverage gate"
      }
    }
  };
}

export function renderDashboardHtml(snapshot) {
  const completed = snapshot.phases.filter((phase) => phase.status === "complete").length;
  const health = snapshot.system.health;
  const pendingApprovals = snapshot.approvals.pending;
  const failedRuns = snapshot.jobs.timeline.filter((run) => run.status === "failed").length;
  const readyTemplates = snapshot.templates.readiness.filter((template) => template.status === "ready").length;
  const dbTotal = Object.values(snapshot.db).reduce((sum, value) => sum + Number(value), 0);
  const workflowCommands = listDashboardWorkflows();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sage Kernel Command Center</title>
  <style>
    :root {
      --bg: #0b0d10;
      --surface: #12161b;
      --surface-2: #181e24;
      --surface-3: #202832;
      --ink: #edf2f7;
      --muted: #9aa8b5;
      --faint: #657280;
      --line: #26313b;
      --line-strong: #354350;
      --ok: #31c48d;
      --warn: #e4b363;
      --danger: #ee6a7c;
      --info: #63b3ed;
      --accent: #b8d45b;
      --shadow: rgba(0,0,0,.32);
    }
    * { box-sizing: border-box; }
    html { overflow-x: hidden; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--bg);
      overflow-x: hidden;
    }
    a { color: inherit; text-decoration: none; }
    button, input { font: inherit; }
    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 252px minmax(0, 1fr);
      width: 100%;
      max-width: 100vw;
      overflow-x: hidden;
    }
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      padding: 20px 16px;
      border-right: 1px solid var(--line);
      background: #0f1318;
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-width: 0;
      max-width: 100%;
    }
    .brand { display: grid; gap: 5px; padding: 6px 8px 14px; border-bottom: 1px solid var(--line); }
    .brand strong { font-size: 1.05rem; letter-spacing: 0; }
    .brand span { color: var(--muted); font-size: .82rem; }
    .nav { display: grid; gap: 6px; }
    .nav button {
      width: 100%;
      border: 1px solid transparent;
      color: var(--muted);
      background: transparent;
      border-radius: 8px;
      padding: 10px 11px;
      text-align: left;
      cursor: pointer;
    }
    .nav button[aria-selected="true"], .nav button:hover {
      color: var(--ink);
      border-color: var(--line);
      background: var(--surface);
    }
    .sidebar-footer {
      margin-top: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: var(--surface);
      color: var(--muted);
      font-size: .82rem;
      line-height: 1.45;
    }
    main { min-width: 0; padding: 22px; }
    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: center;
      margin-bottom: 18px;
    }
    .titleblock { display: grid; gap: 4px; min-width: 0; max-width: 100%; }
    h1 { margin: 0; font-size: 1.8rem; line-height: 1.08; letter-spacing: 0; }
    h2 { margin: 0; font-size: .82rem; text-transform: uppercase; letter-spacing: 0; color: var(--muted); }
    h3 { margin: 0; font-size: .95rem; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); line-height: 1.45; overflow-wrap: anywhere; }
    code { color: var(--accent); }
    .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; max-width: 100%; }
    .search {
      width: min(460px, 44vw);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      background: var(--surface);
      color: var(--ink);
      outline: none;
    }
    .search:focus { border-color: var(--info); box-shadow: 0 0 0 3px rgba(99,179,237,.12); }
    .button {
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      border-radius: 8px;
      padding: 10px 12px;
      cursor: pointer;
    }
    .button:hover { border-color: var(--line-strong); background: var(--surface-2); }
    .grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; min-width: 0; max-width: 100%; }
    .span-3 { grid-column: span 3; }
    .span-4 { grid-column: span 4; }
    .span-5 { grid-column: span 5; }
    .span-6 { grid-column: span 6; }
    .span-7 { grid-column: span 7; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }
    .panel {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 8px;
      box-shadow: 0 16px 48px var(--shadow);
      min-width: 0;
      overflow: hidden;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
    }
    .panel-body { padding: 14px 16px; }
    .metric { font-size: 2.05rem; line-height: 1; font-weight: 800; letter-spacing: 0; }
    .metric-small { font-size: 1.35rem; line-height: 1; font-weight: 800; }
    .kpi { display: grid; gap: 10px; min-height: 136px; }
    .kpi p { min-height: 38px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 5px 8px;
      color: var(--muted);
      background: var(--surface-2);
      font-size: .78rem;
      white-space: nowrap;
    }
    .badge-ok { color: var(--ok); border-color: rgba(49,196,141,.35); }
    .badge-warn { color: var(--warn); border-color: rgba(228,179,99,.35); }
    .badge-danger { color: var(--danger); border-color: rgba(238,106,124,.35); }
    .status-operational, .status-complete, .status-passed, .status-approved, .status-available, .status-ready, .status-created, .ok { color: var(--ok); }
    .status-degraded, .status-pending, .status-queued, .status-needs-hardening, .status-unconfigured, .status-warning, .warn { color: var(--warn); }
    .status-failed, .status-blocked, .status-missing, .danger { color: var(--danger); }
    .meter { height: 7px; border-radius: 999px; background: #2a333d; overflow: hidden; margin-top: 9px; }
    .meter > div { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--ok), var(--accent)); }
    .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
    .list li {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #101419;
      color: var(--muted);
    }
    .split { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .table-wrap { overflow: auto; min-width: 0; max-width: 100%; }
    table { width: 100%; border-collapse: collapse; min-width: 620px; }
    th, td { padding: 10px 9px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0; }
    td { color: var(--ink); font-size: .9rem; }
    td.muted { color: var(--muted); }
    .command-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .command {
      display: grid;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #101419;
      min-width: 0;
    }
    .command code {
      display: block;
      overflow-wrap: anywhere;
      border-radius: 6px;
      padding: 8px;
      background: #090c0f;
    }
    .tool-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .tool {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 10px;
      background: #101419;
      overflow-wrap: anywhere;
    }
    .view { display: none; min-width: 0; max-width: 100%; }
    .view.active { display: grid; }
    .hidden { display: none; }
    .status-box {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      min-height: 72px;
      background: #090c0f;
      color: var(--muted);
    }
    @media (max-width: 1040px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar { position: static; height: auto; }
      .nav { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .topbar { align-items: stretch; flex-direction: column; }
      .search { width: 100%; }
      .span-3, .span-4, .span-5, .span-6, .span-7, .span-8 { grid-column: span 12; }
      .command-grid, .tool-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 620px) {
      main { padding: 14px; }
      .sidebar { width: 100%; padding: 18px 14px; }
      .nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .toolbar { align-items: stretch; flex-direction: column; }
      .button { width: 100%; }
      h1 { font-size: 1.45rem; }
      .metric { font-size: 1.7rem; overflow-wrap: anywhere; }
      .panel-body { padding: 12px; }
    }
  </style>
</head>
<body>
  <div class="shell" data-refresh-interval="5000">
    <aside class="sidebar">
      <div class="brand">
        <strong>Sage Kernel</strong>
        <span>MCP command cockpit · v${escapeHtml(snapshot.version)}</span>
      </div>
      <nav class="nav" aria-label="Dashboard views">
        ${["Overview", "Workflows", "Approvals", "Jobs", "MCP Tools", "Repos", "Templates", "Data"].map((view, index) => `<button type="button" data-view-target="${slug(view)}" aria-selected="${index === 0 ? "true" : "false"}">${escapeHtml(view)}</button>`).join("")}
      </nav>
      <div class="sidebar-footer">
        <strong class="status-${escapeHtml(health.status)}">${escapeHtml(health.status)}</strong>
        <p>${escapeHtml(health.summary)}</p>
      </div>
    </aside>
    <main>
      <header class="topbar">
        <div class="titleblock">
          <h1>Kernel Command Center</h1>
          <p><span data-live-generated>Generated ${escapeHtml(snapshot.generatedAt)}</span> · ${snapshot.tools.length} MCP tools · <span data-live-db-total>${dbTotal}</span> ledger records</p>
        </div>
        <div class="toolbar">
          <input id="dashboard-search" class="search" placeholder="Search approvals, jobs, repos, templates, tools" aria-label="Search dashboard" />
          <button class="button" type="button" data-copy="sage daily">Copy daily</button>
          <button class="button" type="button" data-copy="sage audit .">Copy audit</button>
        </div>
      </header>

      <section id="overview" class="view active grid" data-view="overview">
        ${kpiPanel("System Health", health.status, health.summary, `status-${health.status}`)}
        ${kpiPanel("Pending Approvals", pendingApprovals, "approval records waiting for review", pendingApprovals > 0 ? "status-pending" : "status-passed")}
        ${kpiPanel("Recent Failures", failedRuns, "failed job runs in the current timeline", failedRuns > 0 ? "status-failed" : "status-passed")}
        ${kpiPanel("Release Assets", `${readyTemplates}/${snapshot.templates.readiness.length}`, "templates marked ready for generated apps", "status-ready")}

        <article class="panel span-8" data-panel="workflow-launcher">
          <div class="panel-header"><h2>Workflow Launcher</h2><span class="badge badge-ok">MCP-native</span></div>
          <div class="panel-body command-grid">${workflowCommands.map(renderCommand).join("")}</div>
        </article>
        <article class="panel span-4" data-panel="readiness-summary">
          <div class="panel-header"><h2>Readiness Summary</h2><span class="badge">local</span></div>
          <div class="panel-body">
            <ul class="list">
              <li data-search="coverage test quality gate"><div class="split"><h3>Coverage</h3><strong>${snapshot.system.coverage.line}%</strong></div><p>${escapeHtml(snapshot.system.coverage.gate)}</p></li>
              <li data-search="database migrations persistence"><div class="split"><h3>Migrations</h3><strong>${snapshot.db.schemaMigrations}</strong></div><p>schema versions recorded</p></li>
              <li data-search="audit events security"><div class="split"><h3>Audit Events</h3><strong>${snapshot.db.auditEvents}</strong></div><p>runtime lifecycle records</p></li>
            </ul>
          </div>
        </article>

        <article class="panel span-6" data-panel="approval-inbox">
          <div class="panel-header"><h2>Approval Inbox</h2><span class="badge ${pendingApprovals > 0 ? "badge-warn" : "badge-ok"}" data-live-pending>${pendingApprovals} pending</span></div>
          <div class="panel-body">${renderApprovalTable(snapshot.approvals.inbox)}</div>
        </article>
        <article class="panel span-6" data-panel="job-timeline">
          <div class="panel-header"><h2>Job Timeline</h2><span class="badge">${snapshot.jobs.timeline.length} recent</span></div>
          <div class="panel-body">${renderRunTable(snapshot.jobs.timeline)}</div>
        </article>
      </section>

      <section id="workflows" class="view grid" data-view="workflows">
        <article class="panel span-12"><div class="panel-header"><h2>Daily Workflows</h2><span class="badge badge-ok">ready</span></div><div class="panel-body command-grid">${workflowCommands.map(renderCommand).join("")}</div></article>
        <article class="panel span-12"><div class="panel-header"><h2>Workflow Status</h2><span class="badge">live</span></div><div class="panel-body"><pre id="workflow-status" class="status-box">Ready.</pre></div></article>
      </section>

      <section id="approvals" class="view grid" data-view="approvals">
        <article class="panel span-12" data-panel="approval-inbox-full"><div class="panel-header"><h2>Approval Inbox</h2><span class="badge ${pendingApprovals > 0 ? "badge-warn" : "badge-ok"}" data-live-pending>${pendingApprovals} pending</span></div><div class="panel-body">${renderApprovalTable(snapshot.approvals.inbox)}</div></article>
      </section>

      <section id="jobs" class="view grid" data-view="jobs">
        <article class="panel span-7"><div class="panel-header"><h2>Job Timeline</h2><span class="badge">${snapshot.jobs.timeline.length} recent</span></div><div class="panel-body">${renderRunTable(snapshot.jobs.timeline)}</div></article>
        <article class="panel span-5"><div class="panel-header"><h2>Queued Jobs</h2><span class="badge">${snapshot.jobs.queued.length} visible</span></div><div class="panel-body">${renderQueueTable(snapshot.jobs.queued)}</div></article>
      </section>

      <section id="mcp-tools" class="view grid" data-view="mcp-tools">
        <article class="panel span-12" data-panel="mcp-tool-explorer"><div class="panel-header"><h2>MCP Tool Explorer</h2><span class="badge">${snapshot.tools.length} tools</span></div><div class="panel-body tool-grid">${snapshot.tools.map(renderTool).join("")}</div></article>
      </section>

      <section id="repos" class="view grid" data-view="repos">
        <article class="panel span-12" data-panel="repo-health"><div class="panel-header"><h2>Repo Health</h2><span class="badge">${snapshot.repos.health.length} cataloged</span></div><div class="panel-body"><ul class="list">${snapshot.repos.health.map(renderRepoHealth).join("")}</ul></div></article>
      </section>

      <section id="templates" class="view grid" data-view="templates">
        <article class="panel span-12" data-panel="template-readiness"><div class="panel-header"><h2>Template Readiness</h2><span class="badge">${readyTemplates} ready</span></div><div class="panel-body"><ul class="list">${snapshot.templates.readiness.map(renderTemplateReadiness).join("")}</ul></div></article>
      </section>

      <section id="data" class="view grid" data-view="data">
        <article class="panel span-6" data-panel="db-ledger"><div class="panel-header"><h2>DB Ledger</h2><span class="badge">${dbTotal} records</span></div><div class="panel-body">${renderDbLedger(snapshot.db)}</div></article>
        <article class="panel span-6" data-panel="artifact-ledger"><div class="panel-header"><h2>Artifact Ledger</h2><span class="badge">${snapshot.artifacts.recent.length} recent</span></div><div class="panel-body"><ul class="list">${renderArtifacts(snapshot.artifacts.recent)}</ul></div></article>
      </section>
    </main>
  </div>
  <script>
    const search = document.querySelector("#dashboard-search");
    const searchable = [...document.querySelectorAll("[data-search]")];
    const shell = document.querySelector("[data-refresh-interval]");
    const workflowStatus = document.querySelector("#workflow-status");
    const generated = document.querySelector("[data-live-generated]");
    const dbTotal = document.querySelector("[data-live-db-total]");
    const pendingBadges = [...document.querySelectorAll("[data-live-pending]")];
    search?.addEventListener("input", () => {
      const query = search.value.toLowerCase().trim();
      for (const node of searchable) {
        node.classList.toggle("hidden", Boolean(query) && !node.dataset.search.toLowerCase().includes(query));
      }
    });
    const views = [...document.querySelectorAll("[data-view]")];
    const tabs = [...document.querySelectorAll("[data-view-target]")];
    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        for (const item of tabs) item.setAttribute("aria-selected", String(item === tab));
        for (const view of views) view.classList.toggle("active", view.dataset.view === tab.dataset.viewTarget);
      });
    }
    for (const button of document.querySelectorAll("[data-copy]")) {
      button.addEventListener("click", async () => {
        await navigator.clipboard?.writeText(button.dataset.copy);
        button.textContent = "Copied";
        setTimeout(() => { button.textContent = button.dataset.copy.includes("daily") ? "Copy daily" : "Copy audit"; }, 1200);
      });
    }
    for (const button of document.querySelectorAll("[data-workflow-action]")) {
      button.addEventListener("click", async () => {
        const id = button.dataset.workflowId;
        button.disabled = true;
        setWorkflowStatus("Running " + id + "...");
        try {
          const response = await fetch("/api/workflows/run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id })
          });
          const payload = await response.json();
          setWorkflowStatus(JSON.stringify(payload, null, 2));
          await refreshSnapshot();
        } catch (error) {
          setWorkflowStatus("Workflow failed: " + error.message);
        } finally {
          button.disabled = false;
        }
      });
    }
    async function refreshSnapshot() {
      const response = await fetch("/api/snapshot", { headers: { accept: "application/json" } });
      if (!response.ok) return;
      const snapshot = await response.json();
      generated.textContent = "Generated " + snapshot.generatedAt;
      const records = Object.values(snapshot.db || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      dbTotal.textContent = String(records);
      for (const badge of pendingBadges) {
        badge.textContent = String(snapshot.approvals?.pending || 0) + " pending";
      }
    }
    function setWorkflowStatus(value) {
      if (workflowStatus) workflowStatus.textContent = value;
    }
    const refreshMs = Number(shell?.dataset.refreshInterval || 0);
    if (refreshMs > 0) setInterval(() => { refreshSnapshot().catch(() => {}); }, refreshMs);
  </script>
</body>
</html>`;
}

function readJson(root, relativePath, fallback = null) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function tableCount(db, table) {
  if (!allowedTables.has(table)) throw new Error(`Unsupported table count: ${table}`);
  try {
    return Number(db.scalar(`SELECT COUNT(*) FROM ${table};`) || 0);
  } catch {
    return 0;
  }
}

function tableCountWhere(db, table, whereClause) {
  if (!allowedTables.has(table)) throw new Error(`Unsupported table count: ${table}`);
  try {
    return Number(db.scalar(`SELECT COUNT(*) FROM ${table} WHERE ${whereClause};`) || 0);
  } catch {
    return 0;
  }
}

function latestApprovals(db) {
  return safeQuery(
    db,
    `SELECT id, action, status, reason, signature, decided_by, created_at, decided_at
     FROM approvals ORDER BY created_at DESC LIMIT 8`
  ).map((row) => ({
    id: row.id,
    action: row.action,
    status: row.status,
    reason: row.reason,
    signed: Boolean(row.signature),
    decidedBy: row.decided_by,
    createdAt: row.created_at,
    decidedAt: row.decided_at
  }));
}

function latestQueuedJobs(db) {
  return safeQuery(
    db,
    `SELECT id, job_id, status, priority, attempts, max_attempts, created_at, next_run_at
     FROM job_queue ORDER BY created_at DESC LIMIT 8`
  );
}

function latestJobRuns(db, root) {
  const rows = safeQuery(
    db,
    `SELECT id, job_id, status, duration_ms, result_json, signature, created_at
     FROM job_runs ORDER BY created_at DESC LIMIT 10`
  );
  if (rows.length) {
    return rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      status: row.status,
      durationMs: Number(row.duration_ms || 0),
      signed: Boolean(row.signature),
      createdAt: row.created_at
    }));
  }
  return latestRunFiles(root);
}

function latestRunFiles(root, limit = 10) {
  const dir = path.join(root, ".sage-kernel/runs");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((file) => {
      const run = readJson(root, path.join(".sage-kernel/runs", file), {});
      return {
        id: run.runId || file.replace(/\.json$/, ""),
        jobId: run.jobId || "unknown",
        status: run.status || "unknown",
        durationMs: Number(run.durationMs || 0),
        signed: false,
        createdAt: run.finishedAt || run.startedAt || ""
      };
    });
}

function latestArtifacts(db) {
  return safeQuery(
    db,
    `SELECT id, kind, path, metadata_json, created_at
     FROM artifacts ORDER BY created_at DESC LIMIT 8`
  ).map((row) => ({
    id: row.id,
    kind: row.kind,
    path: row.path,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at
  }));
}

function repoHealth(root, catalog) {
  const sourceRoot = catalogSourceRoot(catalog);
  return (catalog.repos || []).map((repo) => {
    const repoPath = path.join(sourceRoot, repo.name);
    const exists = Boolean(sourceRoot) && fs.existsSync(repoPath);
    const hasPackageJson = exists && fs.existsSync(path.join(repoPath, "package.json"));
    const hasPyproject = exists && fs.existsSync(path.join(repoPath, "pyproject.toml"));
    const hasReadme =
      exists &&
      (fs.existsSync(path.join(repoPath, "README.md")) || fs.existsSync(path.join(repoPath, "readme.md")));
    const hasRuntime = hasPackageJson || hasPyproject;
    const score = Number(repo.score || 0) + (exists ? 6 : -20) + (hasRuntime ? 4 : 0) + (hasReadme ? 3 : 0);

    return {
      name: repo.name,
      role: repo.role,
      target: repo.target,
      domains: repo.domains || [],
      status: !sourceRoot ? "unconfigured" : exists ? "available" : "missing",
      score: Math.max(0, Math.min(100, score)),
      hasPackageJson,
      hasPyproject,
      hasReadme,
      path: repoPath.replace(root, ".")
    };
  });
}

function templateReadiness(templates) {
  return templates.map((template) => {
    const coverage = template.coverage || [];
    const hasProductionCore = ["qa", "deploy"].every((item) => coverage.includes(item));
    const score = Math.min(100, 55 + coverage.length * 4 + (hasProductionCore ? 12 : 0));
    return {
      id: template.id,
      qaProfile: template.qaProfile,
      coverage,
      stack: template.defaultStack || [],
      status: score >= 90 ? "ready" : "needs-hardening",
      score
    };
  });
}

function systemHealth({ phases, repoHealthRows, templates, tools, jobTimeline }) {
  const missingRepos = repoHealthRows.filter((repo) => repo.status === "missing").length;
  const failedRuns = jobTimeline.filter((run) => run.status === "failed").length;
  const completePhases = phases.filter((phase) => phase.status === "complete").length;
  const operational = missingRepos === 0 && failedRuns === 0 && templates.length > 0 && tools.length > 0;

  return {
    status: operational ? "operational" : "degraded",
    summary: `${completePhases}/${phases.length} phases complete, ${missingRepos} missing repos, ${failedRuns} failed recent runs.`
  };
}

function catalogSourceRoot(catalog) {
  if (catalog.sourceRootEnv && process.env[catalog.sourceRootEnv]) return process.env[catalog.sourceRootEnv];
  return catalog.sourceRoot || "";
}

function safeQuery(db, sql, params = []) {
  try {
    return db.query(sql, params);
  } catch {
    return [];
  }
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function kpiPanel(label, value, note, statusClass = "") {
  return `<article class="panel span-3 kpi" data-search="${escapeHtml(`${label} ${value} ${note}`)}">
    <div class="panel-header"><h2>${escapeHtml(label)}</h2></div>
    <div class="panel-body">
      <div class="metric ${escapeHtml(statusClass)}">${escapeHtml(value)}</div>
      <p>${escapeHtml(note)}</p>
    </div>
  </article>`;
}

function renderCommand(workflow) {
  const actionLabel = workflow.requiresApproval ? "Request approval" : "Run";
  return `<div class="command" data-workflow-id="${escapeHtml(workflow.id)}" data-search="${escapeHtml(`${workflow.label} ${workflow.command} ${workflow.description} ${workflow.risk} workflow command`)}">
    <div class="split"><h3>${escapeHtml(workflow.label)}</h3><span class="badge ${workflow.requiresApproval ? "badge-warn" : "badge-ok"}">${escapeHtml(workflow.risk)}</span></div>
    <code>${escapeHtml(workflow.command)}</code>
    <p>${escapeHtml(workflow.description)}</p>
    <div class="toolbar">
      <button class="button" type="button" data-workflow-action data-workflow-id="${escapeHtml(workflow.id)}">${escapeHtml(actionLabel)}</button>
      <button class="button" type="button" data-copy="${escapeHtml(workflow.command)}">Copy</button>
    </div>
  </div>`;
}

function renderTool(tool) {
  const [namespace = "kernel", domain = "core"] = String(tool).split(".");
  return `<div class="tool" data-search="${escapeHtml(`${tool} ${namespace} ${domain} mcp tool`)}">
    <div class="split"><h3>${escapeHtml(tool)}</h3><span class="badge">${escapeHtml(domain)}</span></div>
  </div>`;
}

function renderDbLedger(db) {
  const labels = {
    projects: "Projects",
    queuedJobs: "Queued Jobs",
    runs: "Runs",
    approvals: "Approvals",
    decisions: "Decisions",
    artifacts: "Artifacts",
    auditEvents: "Audit Events",
    schemaMigrations: "Schema Migrations"
  };
  return `<div class="table-wrap"><table>
    <thead><tr><th>Ledger</th><th>Records</th></tr></thead>
    <tbody>${Object.entries(db).map(([key, value]) => `<tr data-search="${escapeHtml(`${labels[key] || key} ${value} database ledger`)}"><td>${escapeHtml(labels[key] || key)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody>
  </table></div>`;
}

function renderApprovalTable(approvals) {
  if (!approvals.length) return `<p>No approvals recorded yet.</p>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Action</th><th>Status</th><th>Signature</th><th>Created</th><th>Reason</th></tr></thead>
    <tbody>${approvals.map((approval) => `<tr data-search="${escapeHtml(`${approval.action} ${approval.status} ${approval.reason} approval`)}">
      <td>${escapeHtml(approval.action)}</td>
      <td><strong class="status-${escapeHtml(approval.status)}">${escapeHtml(approval.status)}</strong></td>
      <td class="muted">${approval.signed ? "signed" : "unsigned"}</td>
      <td class="muted">${escapeHtml(approval.createdAt)}</td>
      <td class="muted">${escapeHtml(approval.reason)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function renderRunTable(runs) {
  if (!runs.length) return `<p>No job runs recorded yet.</p>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Job</th><th>Status</th><th>Duration</th><th>Signature</th><th>Run</th></tr></thead>
    <tbody>${runs.map((run) => `<tr data-search="${escapeHtml(`${run.id} ${run.jobId} ${run.status} job run`)}">
      <td>${escapeHtml(run.jobId)}</td>
      <td><strong class="status-${escapeHtml(run.status)}">${escapeHtml(run.status)}</strong></td>
      <td class="muted">${escapeHtml(run.durationMs)}ms</td>
      <td class="muted">${run.signed ? "signed" : "local"}</td>
      <td class="muted">${escapeHtml(run.id)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function renderQueueTable(jobs) {
  if (!jobs.length) return `<p>No queued jobs visible.</p>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Job</th><th>Status</th><th>Priority</th><th>Attempts</th><th>Next Run</th></tr></thead>
    <tbody>${jobs.map((job) => `<tr data-search="${escapeHtml(`${job.id} ${job.job_id} ${job.status} queued job`)}">
      <td>${escapeHtml(job.job_id)}</td>
      <td><strong class="status-${escapeHtml(job.status)}">${escapeHtml(job.status)}</strong></td>
      <td class="muted">${escapeHtml(job.priority)}</td>
      <td class="muted">${escapeHtml(job.attempts)}/${escapeHtml(job.max_attempts)}</td>
      <td class="muted">${escapeHtml(job.next_run_at || "ready")}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function renderRepoHealth(repo) {
  return `<li data-search="${escapeHtml(`${repo.name} ${repo.role} ${repo.target} ${repo.status} ${repo.domains.join(" ")} repo health`)}">
    <div class="split"><h3>${escapeHtml(repo.name)}</h3><strong class="status-${escapeHtml(repo.status)}">${escapeHtml(repo.score)}</strong></div>
    <p>${escapeHtml(repo.role)} · ${escapeHtml(repo.target)} · ${escapeHtml(repo.status)}</p>
    <div class="meter"><div style="width:${repo.score}%"></div></div>
  </li>`;
}

function renderTemplateReadiness(template) {
  return `<li data-search="${escapeHtml(`${template.id} ${template.qaProfile} ${template.status} ${template.coverage.join(" ")} ${template.stack.join(" ")} template readiness`)}">
    <div class="split"><h3>${escapeHtml(template.id)}</h3><strong class="status-${escapeHtml(template.status)}">${escapeHtml(template.score)}</strong></div>
    <p>${escapeHtml(template.qaProfile)} · ${escapeHtml(template.coverage.join(", "))}</p>
    <div class="meter"><div style="width:${template.score}%"></div></div>
  </li>`;
}

function renderArtifacts(artifacts) {
  if (!artifacts.length) return `<li>No artifacts recorded yet.</li>`;
  return artifacts
    .map(
      (artifact) => `<li data-search="${escapeHtml(`${artifact.id} ${artifact.kind} ${artifact.path} artifact`)}">
        <div class="split"><h3>${escapeHtml(artifact.kind)}</h3><strong>${escapeHtml(artifact.id)}</strong></div>
        <p>${escapeHtml(artifact.path)} · ${escapeHtml(artifact.createdAt)}</p>
      </li>`
    )
    .join("");
}

export function createDashboardServer(options = {}) {
  const getSnapshot = options.getSnapshot || createSnapshotCache({
    root: options.root || defaultRoot,
    ttlMs: options.ttlMs ?? Number(process.env.SAGE_DASHBOARD_CACHE_MS || 500)
  });

  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok", service: "sage-dashboard", checkedAt: new Date().toISOString() }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/ready") {
      const snapshot = getSnapshot();
      const ready = snapshot.system.health.status === "operational";
      response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: ready ? "ready" : "not-ready", health: snapshot.system.health }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/metrics") {
      const snapshot = getSnapshot();
      response.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
      response.end(renderMetrics(snapshot));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/snapshot") {
      const snapshot = getSnapshot();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(snapshot, null, 2));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/workflows") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ workflows: listDashboardWorkflows() }, null, 2));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/workflows/run") {
      const body = await readRequestJson(request);
      const result = await runDashboardWorkflow(body, { root: options.root || defaultRoot });
      const statusCode = result.status === "approval_required" ? 202 : result.status === "rejected" ? 400 : result.status === "approval_denied" ? 403 : 200;
      response.writeHead(statusCode, { "content-type": "application/json" });
      response.end(JSON.stringify(result, null, 2));
      return;
    }
    const snapshot = getSnapshot();
    response.writeHead(200, { "content-type": "text/html" });
    response.end(renderDashboardHtml(snapshot));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createDashboardServer();
  server.listen(port, () => console.log(`Sage dashboard live at http://localhost:${port}`));
}

export function createSnapshotCache({ root = defaultRoot, ttlMs }) {
  let cached = null;
  let expiresAt = 0;
  return () => {
    const now = Date.now();
    if (!cached || now >= expiresAt) {
      cached = dashboardSnapshot({ root });
      expiresAt = now + ttlMs;
    }
    return cached;
  };
}

export function renderMetrics(snapshot) {
  return [
    "# HELP sage_kernel_db_records Total tracked SQLite records by table.",
    "# TYPE sage_kernel_db_records gauge",
    ...Object.entries(snapshot.db).map(([name, value]) => `sage_kernel_db_records{table="${name}"} ${Number(value)}`),
    "# HELP sage_kernel_tools_total Total MCP tools in the manifest.",
    "# TYPE sage_kernel_tools_total gauge",
    `sage_kernel_tools_total ${snapshot.tools.length}`,
    "# HELP sage_kernel_health_operational Whether the dashboard health is operational.",
    "# TYPE sage_kernel_health_operational gauge",
    `sage_kernel_health_operational ${snapshot.system.health.status === "operational" ? 1 : 0}`,
    ""
  ].join("\n");
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
    const snapshot = dashboardSnapshot({ root });
    const result = {
      workflow: "daily_summary",
      status: snapshot.system.health.status === "degraded" ? "needs_attention" : "ready",
      dashboard: {
        status: snapshot.system.health.status,
        summary: snapshot.system.health.summary,
        db: snapshot.db,
        tools: snapshot.tools.length
      },
      pendingApprovals: snapshot.approvals.pending,
      recentRuns: snapshot.jobs.timeline.slice(0, 5),
      nextActions: [
        "Run audit_repo on the active project.",
        "Review pending approvals before mutating actions.",
        "Run release_readiness before shipping."
      ]
    };
    return { status: 0, stdout: JSON.stringify(result, null, 2), stderr: "" };
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

function readRequestJson(request, limit = 64 * 1024) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        request.destroy();
        resolve({});
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    request.on("error", () => resolve({}));
  });
}

export const __dashboardTestInternals = {
  tableCount,
  tableCountWhere,
  safeQuery,
  parseJson,
  readRequestJson
};
