import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "apps/dashboard/dist");

function readJson(relativePath, fallback = null) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return fallback;
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function latestRuns(limit = 8) {
  const dir = path.join(root, ".sage-kernel/runs");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((file) => readJson(path.join(".sage-kernel/runs", file)));
}

const phases = readJson("catalog/phases.json").phases;
const repos = readJson("catalog/repos.json").repos;
const modules = readJson("catalog/modules.json").modules;
const templates = readJson("catalog/templates.json").templates;
const integrations = readJson("catalog/integrations.json").integrations;
const jobs = readJson("apps/worker/jobs.json").jobs;
const tools = readJson("apps/mcp-server/tools.json").tools;
const runs = latestRuns();

const completed = phases.filter((phase) => phase.status === "complete").length;
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sage Kernel Command Center</title>
  <style>
    :root {
      --bg: #07110e;
      --panel: rgba(255,255,255,0.075);
      --panel-strong: rgba(255,255,255,0.12);
      --text: #effff7;
      --muted: #9ab5aa;
      --line: rgba(181, 255, 220, 0.18);
      --ok: #6df7b3;
      --warn: #ffd166;
      --accent: #8ee8ff;
      --danger: #ff7a90;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 20% 10%, rgba(109,247,179,0.22), transparent 30rem),
        radial-gradient(circle at 85% 15%, rgba(142,232,255,0.18), transparent 28rem),
        linear-gradient(135deg, #050807, #07110e 45%, #111827);
    }
    main { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; padding: 40px 0; }
    header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 28px; }
    h1 { font-size: clamp(2.5rem, 6vw, 5.5rem); line-height: 0.9; margin: 0; letter-spacing: -0.08em; }
    h2 { margin: 0 0 14px; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent); }
    p { color: var(--muted); }
    .badge { border: 1px solid var(--line); background: var(--panel); border-radius: 999px; padding: 10px 14px; color: var(--ok); }
    .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
    .card { border: 1px solid var(--line); background: var(--panel); border-radius: 24px; padding: 20px; box-shadow: 0 24px 80px rgba(0,0,0,0.25); }
    .span-3 { grid-column: span 3; }
    .span-4 { grid-column: span 4; }
    .span-6 { grid-column: span 6; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }
    .metric { font-size: 2.4rem; font-weight: 800; letter-spacing: -0.06em; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
    li { padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.08); color: var(--muted); }
    code { color: var(--ok); }
    .status-complete { color: var(--ok); }
    .status-in-progress { color: var(--warn); }
    .status-planned { color: var(--muted); }
    .status-failed, .status-blocked { color: var(--danger); }
    @media (max-width: 850px) {
      .span-3, .span-4, .span-6, .span-8 { grid-column: span 12; }
      header { display: block; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="badge">Sage Kernel OS · Local Command Center</p>
        <h1>Engineering Kernel</h1>
        <p>Federated, non-destructive control plane for templates, QA, infra, MCP tools, and local jobs.</p>
      </div>
      <div class="card">
        <h2>Terminal</h2>
        <code>sage status</code><br />
        <code>sage plan next-saas-app vercel</code><br />
        <code>sage run nightly-local-audit</code>
      </div>
    </header>

    <section class="grid">
      <div class="card span-3"><h2>Phases</h2><div class="metric">${completed}/${phases.length}</div><p>complete</p></div>
      <div class="card span-3"><h2>Repos</h2><div class="metric">${repos.length}</div><p>federated sources</p></div>
      <div class="card span-3"><h2>Templates</h2><div class="metric">${templates.length}</div><p>project starters</p></div>
      <div class="card span-3"><h2>MCP Tools</h2><div class="metric">${tools.length}</div><p>callable tools</p></div>

      <div class="card span-6">
        <h2>Phase Status</h2>
        <ul>${phases.map((phase) => `<li><strong>${phase.id}. ${escapeHtml(phase.name)}</strong> · <span class="status-${phase.status}">${phase.status}</span></li>`).join("")}</ul>
      </div>

      <div class="card span-6">
        <h2>Recent Runs</h2>
        <ul>${runs.length ? runs.map((run) => `<li><strong>${escapeHtml(run.jobId)}</strong> · <span class="status-${run.status}">${run.status}</span> · ${run.durationMs}ms</li>`).join("") : "<li>No runs yet.</li>"}</ul>
      </div>

      <div class="card span-4">
        <h2>Jobs</h2>
        <ul>${jobs.map((job) => `<li><strong>${escapeHtml(job.id)}</strong><br />${escapeHtml(job.kind)} · ${escapeHtml(job.risk)}</li>`).join("")}</ul>
      </div>

      <div class="card span-4">
        <h2>Templates</h2>
        <ul>${templates.map((template) => `<li><strong>${escapeHtml(template.id)}</strong><br />QA: ${escapeHtml(template.qaProfile)}</li>`).join("")}</ul>
      </div>

      <div class="card span-4">
        <h2>Integrations</h2>
        <ul>${integrations.map((integration) => `<li><strong>${escapeHtml(integration.id)}</strong><br />${escapeHtml(integration.category)}</li>`).join("")}</ul>
      </div>

      <div class="card span-12">
        <h2>Modules</h2>
        <ul>${modules.map((module) => `<li><strong>${escapeHtml(module.id)}</strong> · ${escapeHtml(module.package)} · ${module.scoreCurrent}→${module.scoreTarget}</li>`).join("")}</ul>
      </div>
    </section>
  </main>
</body>
</html>`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), html);

console.log(path.join(outDir, "index.html"));
