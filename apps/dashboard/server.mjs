import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureKernelSchema, runSql } from "../../packages/db/scripts/db-lib.mjs";

const root = process.cwd();
const port = Number(process.env.SAGE_DASHBOARD_PORT || 8787);

function readJson(relativePath, fallback = null) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function tableCount(table) {
  try {
    return Number(runSql(root, `SELECT COUNT(*) FROM ${table};`) || 0);
  } catch {
    return 0;
  }
}

export function dashboardSnapshot() {
  ensureKernelSchema(root);
  return {
    version: readJson("package.json").version,
    phases: readJson("catalog/phases.json").phases,
    repos: readJson("catalog/repos.json").repos,
    templates: readJson("catalog/templates.json").templates,
    jobs: readJson("apps/worker/jobs.json").jobs,
    tools: readJson("apps/mcp-server/tools.json").tools.map((tool) => tool.name),
    db: {
      projects: tableCount("projects"),
      queuedJobs: tableCount("job_queue"),
      runs: tableCount("job_runs"),
      approvals: tableCount("approvals"),
      decisions: tableCount("decisions"),
      artifacts: tableCount("artifacts")
    }
  };
}

function html(snapshot) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Sage Kernel Live</title><style>
body{margin:0;background:#06110d;color:#f2fff8;font-family:ui-sans-serif,system-ui;padding:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.card{border:1px solid rgba(141,255,205,.22);border-radius:20px;padding:18px;background:rgba(255,255,255,.07)}
h1{font-size:56px;letter-spacing:-.07em;margin:0 0 20px}.metric{font-size:36px;font-weight:900}code{color:#6df7b3}
</style></head><body><h1>Sage Kernel Live</h1><div class="grid">
${Object.entries(snapshot.db).map(([key, value]) => `<div class="card"><div>${key}</div><div class="metric">${value}</div></div>`).join("")}
<div class="card"><div>MCP tools</div><div class="metric">${snapshot.tools.length}</div></div>
<div class="card"><div>Templates</div><div class="metric">${snapshot.templates.length}</div></div>
</div><p><code>/api/snapshot</code> returns the live JSON control-plane state.</p></body></html>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = http.createServer((request, response) => {
    const snapshot = dashboardSnapshot();
    if (request.url === "/api/snapshot") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(snapshot, null, 2));
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(html(snapshot));
  });
  server.listen(port, () => console.log(`Sage dashboard live at http://localhost:${port}`));
}
