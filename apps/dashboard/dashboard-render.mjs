import { dashboardStyles } from "./dashboard-styles.mjs";
export function renderDashboardHtmlView(snapshot, workflowCommands = []) {
  const completed = snapshot.phases.filter((phase) => phase.status === "complete").length;
  const health = snapshot.system.health;
  const pendingApprovals = snapshot.approvals.pending;
  const failedRuns = snapshot.jobs.timeline.filter((run) => run.status === "failed").length;
  const readyTemplates = snapshot.templates.readiness.filter((template) => template.status === "ready").length;
  const dbTotal = Object.values(snapshot.db).reduce((sum, value) => sum + Number(value), 0);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sage Kernel Command Center</title>
  <style>${dashboardStyles}</style>
</head>
<body>
  <div class="shell" data-refresh-interval="5000">
    <aside class="sidebar">
      <div class="brand">
        <strong>Sage Kernel</strong>
        <span>MCP command cockpit · v${escapeHtml(snapshot.version)}</span>
      </div>
      <nav class="nav" aria-label="Dashboard views">
        ${["Overview", "Cockpit", "Workflows", "Approvals", "Jobs", "MCP Tools", "Repos", "Templates", "Data"].map((view, index) => `<button type="button" data-view-target="${slug(view)}" aria-selected="${index === 0 ? "true" : "false"}">${escapeHtml(view)}</button>`).join("")}
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

      <section id="cockpit" class="view grid" data-view="cockpit">
        <article class="panel span-7" data-panel="today-plan">
          <div class="panel-header"><h2>Today's Plan</h2><span class="badge">${escapeHtml(snapshot.operating.todayPlan?.status || "missing")}</span></div>
          <div class="panel-body">${renderTodayPlan(snapshot.operating.todayPlan)}</div>
        </article>
        <article class="panel span-5" data-panel="risk-gates">
          <div class="panel-header"><h2>Risk And Gates</h2><span class="badge">${escapeHtml(snapshot.operating.evals.status)}</span></div>
          <div class="panel-body">${renderRiskGates(snapshot.operating.todayPlan, snapshot.operating.evals)}</div>
        </article>
        <article class="panel span-6" data-panel="runbooks">
          <div class="panel-header"><h2>Runbooks</h2><span class="badge">${snapshot.operating.runbooks.length} available</span></div>
          <div class="panel-body"><ul class="list">${snapshot.operating.runbooks.map(renderRunbook).join("") || "<li>No runbooks available.</li>"}</ul></div>
        </article>
        <article class="panel span-6" data-panel="experiment-history">
          <div class="panel-header"><h2>Experiment History</h2><span class="badge">${escapeHtml(snapshot.operating.experiments?.status || "planned")}</span></div>
          <div class="panel-body">${renderExperiment(snapshot.operating.experiments)}</div>
        </article>
      </section>

      <section id="workflows" class="view grid" data-view="workflows">
        <article class="panel span-12"><div class="panel-header"><h2>Daily Workflows</h2><span class="badge badge-ok">ready</span></div><div class="panel-body command-grid">${workflowCommands.map(renderCommand).join("")}</div></article>
        <article class="panel span-12"><div class="panel-header"><h2>Workflow Result Summary</h2><span class="badge">live</span></div><div class="panel-body"><div id="workflow-status" class="status-box">Ready.</div></div></article>
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
          setWorkflowStatus(payload);
          await refreshSnapshot();
        } catch (error) {
          setWorkflowStatus({ status: "failed", error: error.message });
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
      if (!workflowStatus) return;
      if (typeof value === "string") {
        workflowStatus.textContent = value;
        return;
      }
      workflowStatus.replaceChildren(renderWorkflowResult(value));
    }
    function renderWorkflowResult(payload) {
      const wrap = document.createElement("div");
      wrap.className = "workflow-result";
      const status = String(payload?.status || "unknown");
      const workflow = payload?.workflow || {};
      const result = payload?.result || {};
      const stdout = parseJsonish(result.stdout);
      const stderr = String(result.stderr || "");
      const title = workflow.label || workflow.id || payload?.approval?.action || "Workflow";
      const rows = [
        ["Status", status],
        ["Workflow", workflow.id || "n/a"],
        ["Tool", workflow.tool || inferTool(stdout) || "n/a"],
        ["Risk", workflow.risk || "n/a"],
        ["Exit", result.status ?? "n/a"]
      ];
      if (payload?.approval?.id) rows.push(["Approval", payload.approval.id]);
      if (payload?.error) rows.push(["Error", payload.error]);
      const headline = document.createElement("div");
      headline.className = "workflow-headline";
      const heading = document.createElement("h3");
      heading.textContent = title;
      const badge = document.createElement("span");
      badge.className = "badge " + badgeClassFor(status);
      badge.textContent = status;
      headline.append(heading, badge);
      const grid = document.createElement("dl");
      grid.className = "workflow-kv";
      for (const [key, raw] of rows) {
        const dt = document.createElement("dt");
        dt.textContent = key;
        const dd = document.createElement("dd");
        dd.textContent = String(raw);
        grid.append(dt, dd);
      }
      wrap.append(headline, grid);
      const highlights = workflowHighlights(stdout, result, stderr, payload);
      if (highlights.length) {
        const list = document.createElement("ul");
        list.className = "list workflow-highlights";
        for (const item of highlights) {
          const li = document.createElement("li");
          li.textContent = item;
          list.append(li);
        }
        wrap.append(list);
      }
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Raw audit payload";
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(payload, null, 2);
      details.append(summary, pre);
      wrap.append(details);
      return wrap;
    }
    function parseJsonish(value) {
      if (!value || typeof value !== "string") return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    function inferTool(stdout) {
      return stdout?.tool || stdout?.workflow || null;
    }
    function badgeClassFor(status) {
      if (["executed", "passed", "ready", "ok"].includes(status)) return "badge-ok";
      if (["approval_required", "queued", "pending"].includes(status)) return "badge-warn";
      return "badge-danger";
    }
    function workflowHighlights(stdout, result, stderr, payload) {
      const items = [];
      if (stdout?.profile?.id) items.push("Profile: " + stdout.profile.id);
      if (Array.isArray(stdout?.commands)) items.push("Verification commands: " + stdout.commands.length);
      if (Array.isArray(stdout?.phases)) items.push("Loop phases: " + stdout.phases.length);
      if (Array.isArray(stdout?.run)) {
        const failed = stdout.run.filter((item) => item.status !== "passed").length;
        items.push("Run checks: " + stdout.run.length + " total, " + failed + " needing attention");
      }
      if (Array.isArray(stdout?.nextActions) && stdout.nextActions.length) items.push("Next action: " + stdout.nextActions[0]);
      if (stdout?.pendingApprovals !== undefined) items.push("Pending approvals: " + stdout.pendingApprovals);
      if (payload?.approval?.id) items.push("Approval requested: " + payload.approval.id);
      if (stderr) items.push("Stderr: " + stderr.slice(0, 240));
      if (!items.length && result.stdout) items.push(String(result.stdout).slice(0, 320));
      return items;
    }
    const refreshMs = Number(shell?.dataset.refreshInterval || 0);
    if (refreshMs > 0) setInterval(() => { refreshSnapshot().catch(() => {}); }, refreshMs);
  </script>
</body>
</html>`;
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

function renderTodayPlan(plan) {
  if (!plan) return `<p>No daily plan generated yet.</p>`;
  return `<div data-search="${escapeHtml(`${plan.title} ${plan.objective} ${plan.status} daily plan cockpit`)}">
    <h3>${escapeHtml(plan.objective)}</h3>
    <p>${escapeHtml(plan.phase?.name || "Daily operations")} · ${escapeHtml(plan.status)}</p>
    <ul class="list">${plan.steps.map((step) => `<li data-search="${escapeHtml(`${step.title} ${step.command} ${step.evidence} plan step`)}">
      <div class="split"><h3>${escapeHtml(step.title)}</h3><code>${escapeHtml(step.command)}</code></div>
      <p>${escapeHtml(step.evidence)}</p>
    </li>`).join("")}</ul>
  </div>`;
}

function renderRiskGates(plan, evals) {
  const risks = plan?.risks || [];
  const gates = plan?.gates || [];
  return `<ul class="list">
    <li data-search="eval status latest report"><div class="split"><h3>Latest Evals</h3><strong class="status-${escapeHtml(evals.status)}">${escapeHtml(evals.status)}</strong></div><p>${escapeHtml(evals.summary.passed)}/${escapeHtml(evals.summary.total)} passed · ${escapeHtml(evals.latestId || "no latest run")}</p></li>
    ${risks.map((risk) => `<li data-search="${escapeHtml(`${risk.id} ${risk.level} ${risk.description} risk`)}"><div class="split"><h3>${escapeHtml(risk.id)}</h3><strong>${escapeHtml(risk.level)}</strong></div><p>${escapeHtml(risk.description)}</p></li>`).join("")}
    <li data-search="verification gates commands"><div class="split"><h3>Verification Gates</h3><strong>${gates.length}</strong></div><p>${escapeHtml(gates.join(" · "))}</p></li>
  </ul>`;
}

function renderRunbook(runbook) {
  return `<li data-search="${escapeHtml(`${runbook.id} ${runbook.title} ${runbook.risk} runbook`)}">
    <div class="split"><h3>${escapeHtml(runbook.title)}</h3><strong class="status-${escapeHtml(runbook.risk)}">${escapeHtml(runbook.risk)}</strong></div>
    <p>${escapeHtml(runbook.stepCount)} steps · ${escapeHtml(runbook.verificationCount)} verification commands · ${runbook.requiresApproval ? "approval required" : "read-only"}</p>
  </li>`;
}

function renderExperiment(experiment) {
  if (!experiment) return `<p>No experiment history available yet.</p>`;
  return `<ul class="list">
    <li data-search="${escapeHtml(`${experiment.id} ${experiment.status} ${experiment.hypothesis} experiment`)}">
      <div class="split"><h3>${escapeHtml(experiment.id)}</h3><strong class="status-${escapeHtml(experiment.status)}">${escapeHtml(experiment.status)}</strong></div>
      <p>${escapeHtml(experiment.hypothesis)}</p>
    </li>
    <li data-search="experiment evaluation metric"><div class="split"><h3>Evaluation</h3><strong>${escapeHtml(experiment.evaluation?.metric || "metric")}</strong></div><p>${escapeHtml(experiment.evaluation?.command || "No command recorded.")}</p></li>
  </ul>`;
}
