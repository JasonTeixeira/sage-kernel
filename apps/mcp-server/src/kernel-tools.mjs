import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureKernelSchema, sqlJson, sqlString, runSql } from "../../../packages/db/scripts/db-lib.mjs";
import { assertToolAllowed, listApprovals, requestApproval } from "../../../packages/security/guard.mjs";
import { dashboardSnapshot } from "../../dashboard/server.mjs";

export function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function runNode(root, script, args = []) {
  const result = spawnSync("node", [script, ...args], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Command failed: ${script}`);
  }
  return result.stdout.trim();
}

function searchCatalog(root, query, limit = 20) {
  const q = query.toLowerCase();
  const files = [
    ["repos", "catalog/repos.json", "repos"],
    ["modules", "catalog/modules.json", "modules"],
    ["templates", "catalog/templates.json", "templates"],
    ["integrations", "catalog/integrations.json", "integrations"],
    ["phases", "catalog/phases.json", "phases"]
  ];

  const results = [];
  for (const [kind, file, key] of files) {
    const data = readJson(root, file);
    for (const item of data[key]) {
      const text = JSON.stringify(item).toLowerCase();
      if (text.includes(q)) {
        results.push({ kind, item });
      }
    }
  }

  return results.slice(0, limit);
}

function getQaProfile(root, templateId) {
  const templates = readJson(root, "catalog/templates.json").templates;
  const profiles = readJson(root, "packages/qa/profiles.json").profiles;
  const template = templates.find((item) => item.id === templateId);
  if (!template) throw new Error(`Unknown template: ${templateId}`);
  const profile = profiles.find((item) => item.id === template.qaProfile);
  if (!profile) throw new Error(`Missing QA profile: ${template.qaProfile}`);
  return { template, profile };
}

function qaPlan(root, templateId, mode = "standard") {
  const { template, profile } = getQaProfile(root, templateId);
  const modes = ["fast", "standard", "thorough", "deep"];
  const selected = modes.slice(0, Math.max(1, modes.indexOf(mode) + 1));
  return {
    template: template.id,
    profile: profile.id,
    mode,
    runners: selected.flatMap((item) => profile[item] || []),
    hardBlockers: profile.hardBlockers,
    risk: profile.risk
  };
}

function infraPlan(root, templateId, target = "vercel") {
  const output = runNode(root, "packages/infra/scripts/infra-plan.mjs", [
    "--template",
    templateId,
    "--target",
    target
  ]);
  return JSON.parse(output);
}

function listRuns(root, limit = 20) {
  const dir = path.join(root, ".sage-kernel", "runs");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((file) => {
      const run = readJson(root, path.join(".sage-kernel", "runs", file));
      return {
        runId: run.runId,
        jobId: run.jobId,
        status: run.status,
        durationMs: run.durationMs,
        finishedAt: run.finishedAt
      };
    });
}

function warehouseSearch(root, query, limit = 10, verdict = null) {
  const sourceRoot = process.env.AI_WAREHOUSE_ROOT || "/Users/Sage/.graphify/repos/JasonTeixeira/ai-warehouse";
  const indexPath = path.join(sourceRoot, "index.json");
  if (!fs.existsSync(indexPath)) throw new Error(`AI Warehouse index not found: ${indexPath}`);
  const { tools } = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const q = query.toLowerCase();
  return tools
    .filter((tool) => !verdict || tool.verdict === verdict)
    .map((tool) => ({ tool, text: JSON.stringify(tool).toLowerCase() }))
    .filter((item) => item.text.includes(q))
    .slice(0, limit)
    .map(({ tool }) => ({
      slug: tool.slug,
      name: tool.name,
      category: tool.category,
      verdict: tool.verdict,
      maturity: tool.maturity,
      tags: tool.tags || [],
      summary: tool.summary || tool.description || null
    }));
}

function inspectRepo(root, repoName) {
  const catalog = readJson(root, "catalog/repos.json");
  const repo = catalog.repos.find((item) => item.name === repoName);
  if (!repo) throw new Error(`Unknown catalog repo: ${repoName}`);
  const repoPath = path.join(catalog.sourceRoot, repo.name);
  const exists = fs.existsSync(repoPath);
  const packagePath = path.join(repoPath, "package.json");
  const pyprojectPath = path.join(repoPath, "pyproject.toml");
  const readmePath = path.join(repoPath, "README.md");
  return {
    ...repo,
    path: repoPath,
    exists,
    package: exists && fs.existsSync(packagePath) ? JSON.parse(fs.readFileSync(packagePath, "utf8")) : null,
    hasPyproject: exists && fs.existsSync(pyprojectPath),
    readmePreview: exists && fs.existsSync(readmePath) ? fs.readFileSync(readmePath, "utf8").slice(0, 1200) : null
  };
}

function qaRun(root, projectPath = root, mode = "fast") {
  const absolute = path.resolve(root, projectPath);
  if (!absolute.startsWith(root) && !absolute.startsWith("/Users/Sage")) {
    throw new Error("Refusing to run QA outside allowed local workspace");
  }
  const args = [absolute];
  if (mode === "deep") args.push("--deep");
  if (mode === "standard") args.push("--standard");
  const result = runCommand(root, "node", ["packages/qa/scripts/qa-runner.mjs", ...args], 180000);
  const parsed = result.stdout ? JSON.parse(result.stdout) : { status: "failed", result };
  return parsed;
}

function deployPrepare(root, templateId, target = "vercel") {
  const plan = infraPlan(root, templateId, target);
  const qa = qaPlan(root, templateId, "standard");
  return {
    template: templateId,
    target,
    status: "prepared",
    approvalRequiredFor: plan.approvalRequiredFor,
    environment: plan.requiredEnvironment,
    qa,
    readinessChecks: plan.readinessChecks,
    rollback: plan.rollback,
    nextActions: [
      "Create preview deployment only",
      "Inject secrets through provider",
      "Run QA standard gate",
      "Verify health endpoint",
      "Require explicit approval before production"
    ]
  };
}

function runCommand(cwd, command, args, timeoutMs) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024 * 8 });
  return { command, args, status: result.status, stdout: result.stdout?.trim() || "", stderr: result.stderr?.trim() || "" };
}

export async function callKernelTool(root, toolName, input = {}) {
  assertToolAllowed(root, toolName.replace("kernel.", ""), input);
  switch (toolName) {
    case "kernel.phase.status":
      return readJson(root, "catalog/phases.json").phases;

    case "kernel.catalog.search":
      if (!input.query) throw new Error("kernel.catalog.search requires input.query");
      return searchCatalog(root, input.query, input.limit ?? 20);

    case "kernel.template.list":
      return readJson(root, "catalog/templates.json").templates;

    case "kernel.project.plan": {
      if (!input.template) throw new Error("kernel.project.plan requires input.template");
      const { template, profile } = getQaProfile(root, input.template);
      return {
        name: input.name ?? null,
        template,
        qaProfile: profile,
        infraPlan: infraPlan(root, input.template, input.target ?? "vercel")
      };
    }

    case "kernel.project.scaffold": {
      if (!input.template || !input.name) {
        throw new Error("kernel.project.scaffold requires input.template and input.name");
      }
      const args = ["--template", input.template, "--name", input.name];
      if (input.out) args.push("--out", input.out);
      return {
        output: runNode(root, "packages/templates/scripts/template-scaffold-v2.mjs", args)
      };
    }

    case "kernel.warehouse.summary":
      return JSON.parse(runNode(root, "packages/ai-warehouse/scripts/warehouse-summary.mjs"));

    case "kernel.warehouse.search":
      if (!input.query) throw new Error("kernel.warehouse.search requires input.query");
      return warehouseSearch(root, input.query, input.limit ?? 10, input.verdict ?? null);

    case "kernel.qa.profile":
      if (!input.template) throw new Error("kernel.qa.profile requires input.template");
      return getQaProfile(root, input.template);

    case "kernel.qa.plan":
      if (!input.template) throw new Error("kernel.qa.plan requires input.template");
      return qaPlan(root, input.template, input.mode ?? "standard");

    case "kernel.qa.run":
      return qaRun(root, input.projectPath ?? root, input.mode ?? "fast");

    case "kernel.repo.inspect":
      if (!input.repo) throw new Error("kernel.repo.inspect requires input.repo");
      return inspectRepo(root, input.repo);

    case "kernel.infra.plan":
      if (!input.template) throw new Error("kernel.infra.plan requires input.template");
      return infraPlan(root, input.template, input.target ?? "vercel");

    case "kernel.deploy.prepare":
      if (!input.template) throw new Error("kernel.deploy.prepare requires input.template");
      return deployPrepare(root, input.template, input.target ?? "vercel");

    case "kernel.jobs.list":
      return readJson(root, "apps/worker/jobs.json").jobs;

    case "kernel.jobs.run": {
      if (!input.job) throw new Error("kernel.jobs.run requires input.job");
      const output = runNode(root, "apps/worker/scripts/jobs-run.mjs", [input.job]);
      return JSON.parse(output);
    }

    case "kernel.jobs.runs":
      return listRuns(root, input.limit ?? 20);

    case "kernel.jobs.enqueue": {
      if (!input.job) throw new Error("kernel.jobs.enqueue requires input.job");
      ensureKernelSchema(root);
      const id = cryptoRandomId();
      const now = new Date().toISOString();
      const nextRunAt = input.delayMs ? new Date(Date.now() + Number(input.delayMs)).toISOString() : null;
      runSql(root, `INSERT INTO job_queue (id, job_id, payload_json, created_at, next_run_at) VALUES (${sqlString(id)}, ${sqlString(input.job)}, ${sqlJson(input.payload || {})}, ${sqlString(now)}, ${nextRunAt ? sqlString(nextRunAt) : "NULL"});`);
      return { id, job: input.job, status: "queued", nextRunAt };
    }

    case "kernel.worker.tick": {
      const output = runNode(root, "apps/worker/scripts/worker-daemon.mjs", ["--once"]);
      return { status: "ticked", output };
    }

    case "kernel.approvals.request":
      if (!input.action || !input.reason) throw new Error("kernel.approvals.request requires input.action and input.reason");
      return requestApproval(root, input.action, input.reason, input.payload || {});

    case "kernel.approvals.list":
      return listApprovals(root, input.status ?? null);

    case "kernel.dashboard.snapshot":
      return dashboardSnapshot();

    case "kernel.dogfood.prod": {
      const output = runNode(root, "scripts/dogfood-production-audit.mjs", input.repos || []);
      return JSON.parse(output);
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

function cryptoRandomId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function toMcpTextContent(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}
