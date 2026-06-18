export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function kpiPanel(label, value, note, statusClass = "") {
  return `<article class="panel span-3 kpi" data-search="${escapeHtml(`${label} ${value} ${note}`)}">
    <div class="panel-header"><h2>${escapeHtml(label)}</h2></div>
    <div class="panel-body">
      <div class="metric ${escapeHtml(statusClass)}">${escapeHtml(value)}</div>
      <p>${escapeHtml(note)}</p>
    </div>
  </article>`;
}

export function renderCommand(workflow) {
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

export function renderWorkflowEngineStatus(workflows) {
  const engine = workflows?.engine || { status: "missing", checked: { steps: 0 }, states: [], failures: ["Workflow engine snapshot unavailable."] };
  const active = workflows?.active || [];
  return `<div class="grid">
    <div class="span-4" data-search="${escapeHtml(`workflow engine ${engine.status} ${engine.checked?.steps || 0} steps`)}">
      <div class="metric-small status-${escapeHtml(engine.status)}">${escapeHtml(engine.status)}</div>
      <p>${escapeHtml(engine.checked?.steps || 0)} checked steps · ${escapeHtml((engine.states || []).length)} states</p>
    </div>
    <div class="span-8">
      <ul class="list">
        ${active.map(renderActiveWorkflowRun).join("") || "<li>No active workflow engine runs recorded yet.</li>"}
        ${(engine.failures || []).map((failure) => `<li data-search="${escapeHtml(`workflow engine failure ${failure}`)}">${escapeHtml(failure)}</li>`).join("")}
      </ul>
    </div>
  </div>`;
}

export function renderActiveWorkflowRun(run) {
  return `<li data-search="${escapeHtml(`${run.id} ${run.workflowId} ${run.status} active workflow engine`)}">
    <div class="split"><h3>${escapeHtml(run.workflowId)}</h3><strong class="status-${escapeHtml(run.status)}">${escapeHtml(run.status)}</strong></div>
    <p>${escapeHtml(run.durationMs)}ms · ${run.signed ? "signed" : "local"} · ${escapeHtml(run.createdAt)}</p>
  </li>`;
}

export function renderTool(tool) {
  const [namespace = "kernel", domain = "core"] = String(tool).split(".");
  return `<div class="tool" data-search="${escapeHtml(`${tool} ${namespace} ${domain} mcp tool`)}">
    <div class="split"><h3>${escapeHtml(tool)}</h3><span class="badge">${escapeHtml(domain)}</span></div>
  </div>`;
}

export function renderDbLedger(db) {
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

export function renderApprovalTable(approvals) {
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

export function renderRunTable(runs) {
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

export function renderQueueTable(jobs) {
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

export function renderRepoHealth(repo) {
  return `<li data-search="${escapeHtml(`${repo.name} ${repo.role} ${repo.target} ${repo.status} ${repo.domains.join(" ")} repo health`)}">
    <div class="split"><h3>${escapeHtml(repo.name)}</h3><strong class="status-${escapeHtml(repo.status)}">${escapeHtml(repo.score)}</strong></div>
    <p>${escapeHtml(repo.role)} · ${escapeHtml(repo.target)} · ${escapeHtml(repo.status)}</p>
    <div class="meter"><div style="width:${repo.score}%"></div></div>
  </li>`;
}

export function renderTemplateReadiness(template) {
  return `<li data-search="${escapeHtml(`${template.id} ${template.qaProfile} ${template.status} ${template.coverage.join(" ")} ${template.stack.join(" ")} template readiness`)}">
    <div class="split"><h3>${escapeHtml(template.id)}</h3><strong class="status-${escapeHtml(template.status)}">${escapeHtml(template.score)}</strong></div>
    <p>${escapeHtml(template.qaProfile)} · ${escapeHtml(template.coverage.join(", "))}</p>
    <div class="meter"><div style="width:${template.score}%"></div></div>
  </li>`;
}

export function renderArtifacts(artifacts) {
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

export function renderTodayPlan(plan) {
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

export function renderRiskGates(plan, evals) {
  const risks = plan?.risks || [];
  const gates = plan?.gates || [];
  return `<ul class="list">
    <li data-search="eval status latest report"><div class="split"><h3>Latest Evals</h3><strong class="status-${escapeHtml(evals.status)}">${escapeHtml(evals.status)}</strong></div><p>${escapeHtml(evals.summary.passed)}/${escapeHtml(evals.summary.total)} passed · ${escapeHtml(evals.latestId || "no latest run")}</p></li>
    ${risks.map((risk) => `<li data-search="${escapeHtml(`${risk.id} ${risk.level} ${risk.description} risk`)}"><div class="split"><h3>${escapeHtml(risk.id)}</h3><strong>${escapeHtml(risk.level)}</strong></div><p>${escapeHtml(risk.description)}</p></li>`).join("")}
    <li data-search="verification gates commands"><div class="split"><h3>Verification Gates</h3><strong>${gates.length}</strong></div><p>${escapeHtml(gates.join(" · "))}</p></li>
  </ul>`;
}

export function renderRunbook(runbook) {
  return `<li data-search="${escapeHtml(`${runbook.id} ${runbook.title} ${runbook.risk} runbook`)}">
    <div class="split"><h3>${escapeHtml(runbook.title)}</h3><strong class="status-${escapeHtml(runbook.risk)}">${escapeHtml(runbook.risk)}</strong></div>
    <p>${escapeHtml(runbook.stepCount)} steps · ${escapeHtml(runbook.verificationCount)} verification commands · ${runbook.requiresApproval ? "approval required" : "read-only"}</p>
  </li>`;
}

export function renderExperiment(experiment) {
  if (!experiment) return `<p>No experiment history available yet.</p>`;
  return `<ul class="list">
    <li data-search="${escapeHtml(`${experiment.id} ${experiment.status} ${experiment.hypothesis} experiment`)}">
      <div class="split"><h3>${escapeHtml(experiment.id)}</h3><strong class="status-${escapeHtml(experiment.status)}">${escapeHtml(experiment.status)}</strong></div>
      <p>${escapeHtml(experiment.hypothesis)}</p>
    </li>
    <li data-search="experiment evaluation metric"><div class="split"><h3>Evaluation</h3><strong>${escapeHtml(experiment.evaluation?.metric || "metric")}</strong></div><p>${escapeHtml(experiment.evaluation?.command || "No command recorded.")}</p></li>
  </ul>`;
}

export function renderTestingLab(testing) {
  const strategy = testing.strategy || { profile: "unknown", layers: [], missingLayers: [] };
  const layers = strategy.layers || [];
  return `<ul class="list">
    <li data-search="testing strategy profile layers"><div class="split"><h3>Profile</h3><strong>${escapeHtml(strategy.profile || "unknown")}</strong></div><p>${escapeHtml(layers.length)} layer(s), ${escapeHtml(strategy.missingLayers?.length || 0)} missing.</p></li>
    ${(testing.performance?.stressProfiles || []).slice(0, 4).map((profile) => `<li data-search="${escapeHtml(`${profile.id} ${profile.command} stress profile`)}"><div class="split"><h3>${escapeHtml(profile.id)}</h3><code>${escapeHtml(profile.count || profile.profile || "profile")}</code></div><p>${escapeHtml(profile.command)}</p></li>`).join("")}
  </ul>`;
}

export function renderPlaywrightPanel(testing) {
  const files = Object.keys(testing.playwright?.files || {});
  return `<ul class="list">${files.map((file) => `<li data-search="${escapeHtml(`${file} playwright e2e mobile browser`)}"><div class="split"><h3>${escapeHtml(file)}</h3><strong>template</strong></div></li>`).join("") || "<li>No Playwright template available.</li>"}</ul>`;
}

export function renderMemoryGraph(memory) {
  return `<ul class="list">
    <li data-search="knowledge graph nodes"><div class="split"><h3>Nodes</h3><strong>${escapeHtml(memory.nodes || 0)}</strong></div><p>Projects, routes, tests, dependencies, and frameworks.</p></li>
    <li data-search="knowledge graph edges"><div class="split"><h3>Edges</h3><strong>${escapeHtml(memory.edges || 0)}</strong></div><p>Relationship evidence for planning and review.</p></li>
  </ul>`;
}

export function renderScoreModel(score) {
  return `<ul class="list">
    <li data-search="score model categories"><div class="split"><h3>Categories</h3><strong>${escapeHtml(score.categories?.length || 0)}</strong></div><p>Total weight ${escapeHtml(score.totalWeight || 0)}.</p></li>
    ${(score.failures || []).map((failure) => `<li data-search="${escapeHtml(`score failure ${failure}`)}">${escapeHtml(failure)}</li>`).join("")}
  </ul>`;
}

export function renderBenchmarks(benchmarks) {
  return `<ul class="list">${(benchmarks.tasks || []).map((task) => `<li data-search="${escapeHtml(`${task.id} ${task.task} benchmark`)}"><div class="split"><h3>${escapeHtml(task.task)}</h3><strong>${escapeHtml(task.status)}</strong></div><p>${escapeHtml((task.metrics || []).join(", "))}</p></li>`).join("") || "<li>No benchmark tasks defined.</li>"}</ul>`;
}

export function renderSelfHealing(plan) {
  return `<ul class="list">
    <li data-search="self healing approval retry rollback"><div class="split"><h3>Approval Boundary</h3><strong>${escapeHtml(plan.approvalRequired ? "required" : "not required")}</strong></div><p>Retry budget ${escapeHtml(plan.retryBudget || 0)}.</p></li>
    ${(plan.steps || []).map((step) => `<li data-search="${escapeHtml(`${step.id} ${step.action} self healing`)}"><div class="split"><h3>${escapeHtml(step.id)}</h3><strong>${escapeHtml(step.mutates ? "mutates" : "read-only")}</strong></div><p>${escapeHtml(step.action)}</p></li>`).join("")}
  </ul>`;
}

export function renderStressProfiles(stress) {
  return `<ul class="list">${(stress.stressProfiles || []).map((profile) => `<li data-search="${escapeHtml(`${profile.id} ${profile.command} stress soak performance`)}"><div class="split"><h3>${escapeHtml(profile.id)}</h3><strong>${escapeHtml(profile.count || profile.profile || "profile")}</strong></div><p>${escapeHtml(profile.command)}</p></li>`).join("") || "<li>No stress profiles available.</li>"}</ul>`;
}

export function renderExternalComparison(comparison) {
  return `<ul class="list">${(comparison.requiredEvidence || []).map((item) => `<li data-search="${escapeHtml(`${item} external proof final audit`)}">${escapeHtml(item)}</li>`).join("") || "<li>No external evidence requirements recorded.</li>"}</ul>`;
}
