import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureKernelSchema, sqlJson, sqlString, runSql } from "../../../packages/db/scripts/db-lib.mjs";
import { assertToolAllowed, listApprovals, requestApproval } from "../../../packages/security/guard.mjs";
import { createSqliteAdapter } from "../../../packages/db/adapter.mjs";
import { createApprovalLedger } from "../../../packages/security/approvals.mjs";
import { dashboardSnapshot } from "../../dashboard/server.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function runNode(root, script, args = []) {
  const scriptPath = fs.existsSync(path.join(root, script)) ? path.join(root, script) : path.join(sourceRoot, script);
  const result = spawnSync("node", [scriptPath, ...args], {
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
  const sourceRoot = requiredEnvPath("AI_WAREHOUSE_ROOT", "AI Warehouse");
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
  const sourceRoot = catalogSourceRoot(catalog);
  if (!sourceRoot) throw new Error(`Repo source root is not configured. Set ${catalog.sourceRootEnv || "SAGE_KERNEL_SOURCE_ROOT"}.`);
  const repoPath = path.join(sourceRoot, repo.name);
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
  const resolvedProjectPath = realPath(absolute);
  const allowedRoots = [root, ...configuredAllowedRoots()].map((item) => realPath(path.resolve(item)));
  if (!allowedRoots.some((allowedRoot) => resolvedProjectPath === allowedRoot || resolvedProjectPath.startsWith(`${allowedRoot}${path.sep}`))) {
    throw new Error(`Refusing to run QA outside allowed roots: ${allowedRoots.join(", ")}`);
  }
  const args = [resolvedProjectPath];
  if (mode === "deep") args.push("--deep");
  if (mode === "standard") args.push("--standard");
  const result = runCommand(root, "node", [path.join(sourceRoot, "packages/qa/scripts/qa-runner.mjs"), ...args], 180000);
  const parsed = result.stdout ? JSON.parse(result.stdout) : { status: "failed", result };
  return parsed;
}

function configuredAllowedRoots() {
  return (process.env.SAGE_KERNEL_ALLOWED_ROOTS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function catalogSourceRoot(catalog) {
  if (catalog.sourceRootEnv && process.env[catalog.sourceRootEnv]) return process.env[catalog.sourceRootEnv];
  return catalog.sourceRoot || "";
}

function requiredEnvPath(name, label) {
  const value = process.env[name];
  if (!value) throw new Error(`${label} source root is not configured. Set ${name}.`);
  return value;
}

function realPath(absolutePath) {
  try {
    return fs.realpathSync.native(absolutePath);
  } catch {
    return absolutePath;
  }
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

function workflowAuditRepo(root, input = {}) {
  const qa = qaRun(root, input.projectPath ?? ".", input.mode ?? "fast");
  const snapshot = dashboardSnapshot({ root });
  const health = snapshot.system.health;
  return {
    workflow: "audit_repo",
    status: qa.status === "passed" && health.status !== "degraded" ? "passed" : "needs_attention",
    qa,
    dashboard: {
      status: health.status,
      summary: health.summary,
      tools: snapshot.tools.length
    },
    pendingApprovals: listApprovals(root, "pending").length,
    nextActions: workflowNextActions(qa)
  };
}

function workflowRunFullQa(root, input = {}) {
  const mode = input.mode || "standard";
  const qa = qaRun(root, input.projectPath ?? ".", mode);
  return {
    workflow: "run_full_qa",
    status: qa.status,
    qa,
    failures: summarizeFailures(qa),
    nextActions: workflowNextActions(qa)
  };
}

function workflowExplainFailures(root, input = {}) {
  const report = input.report || qaRun(root, input.projectPath ?? ".", input.mode ?? "fast");
  const failures = summarizeFailures(report);
  return {
    workflow: "explain_failures",
    status: report.status || (failures.length > 0 ? "failed" : "passed"),
    failures,
    nextActions: failures.length > 0
      ? failures.map((failure) => failure.recommendation)
      : ["No failed checks found in the provided report."]
  };
}

function workflowCreateApp(root, input = {}) {
  if (!input.template || !input.name) {
    throw new Error("kernel.workflow.create_app requires input.template and input.name");
  }
  const plan = {
    template: getQaProfile(root, input.template).template,
    infraPlan: infraPlan(root, input.template, input.target ?? "docker")
  };
  const args = ["--template", input.template, "--name", input.name];
  if (input.out) args.push("--out", input.out);
  const output = runNode(root, "packages/templates/scripts/template-scaffold-v2.mjs", args);
  return {
    workflow: "create_app",
    status: "created",
    plan,
    scaffold: { output },
    nextActions: [
      "Open the generated project.",
      "Run npm install inside the generated project.",
      "Run the generated QA command before adding features.",
      "Use Sage Kernel to plan infra and release readiness."
    ]
  };
}

function workflowReleaseReadiness(root, input = {}) {
  const template = input.template || "worker-service";
  const target = input.target || "docker";
  const deployment = deployPrepare(root, template, target);
  const snapshot = dashboardSnapshot({ root });
  const health = snapshot.system.health;
  const checks = [
    { name: "deployment-plan", status: deployment.status === "prepared" ? "passed" : "failed" },
    { name: "dashboard-health", status: health.status === "degraded" ? "failed" : "passed" },
    { name: "pending-approvals", status: listApprovals(root, "pending").length === 0 ? "passed" : "warning" }
  ];
  return {
    workflow: "release_readiness",
    status: checks.some((check) => check.status === "failed") ? "blocked" : "ready",
    template,
    target,
    deployment,
    checks,
    nextActions: deployment.nextActions
  };
}

function workflowPendingApprovals(root, input = {}) {
  const status = input.status || "pending";
  const approvals = listApprovals(root, status);
  return {
    workflow: "pending_approvals",
    status,
    count: approvals.length,
    approvals,
    nextActions: approvals.length > 0
      ? ["Review each approval payload and approve only scoped, expected actions."]
      : ["No pending approvals."]
  };
}

function workflowStressDashboard(root, input = {}) {
  const url = input.url || "http://127.0.0.1:8787";
  const count = String(input.count || 200);
  const concurrency = String(input.concurrency || 20);
  const endpoint = input.endpoint || "/api/snapshot";
  const result = runCommand(root, "node", [
    path.join(sourceRoot, "scripts/stress-dashboard.mjs"),
    `--url=${url}`,
    `--endpoint=${endpoint}`,
    `--count=${count}`,
    `--concurrency=${concurrency}`
  ], 120000);
  const report = result.stdout ? JSON.parse(result.stdout) : { status: "failed", result };
  return {
    workflow: "stress_dashboard",
    report,
    command: result.command,
    status: report.status
  };
}

function workflowDailySummary(root) {
  const snapshot = dashboardSnapshot({ root });
  const health = snapshot.system.health;
  const approvals = listApprovals(root, "pending");
  const runs = listRuns(root, 5);
  return {
    workflow: "daily_summary",
    status: health.status === "degraded" ? "needs_attention" : "ready",
    dashboard: {
      status: health.status,
      summary: health.summary,
      db: snapshot.db,
      tools: snapshot.tools.length
    },
    pendingApprovals: approvals.length,
    recentRuns: runs,
    nextActions: [
      "Run audit_repo on the active project.",
      "Review pending approvals before mutating actions.",
      "Run release_readiness before shipping."
    ]
  };
}

function summarizeFailures(report) {
  return (report.checks || [])
    .filter((check) => check.status === "failed")
    .map((check) => ({
      check: check.name,
      command: check.result?.command || null,
      stderr: check.result?.stderr || "",
      stdout: check.result?.stdout || "",
      recommendation: `Fix failed check ${check.name}, then rerun the same workflow.`
    }));
}

function workflowNextActions(qa) {
  const failures = summarizeFailures(qa);
  if (failures.length > 0) return failures.map((failure) => failure.recommendation);
  return [
    "Keep working from the current branch.",
    "Run release_readiness before deployment.",
    "Use create_app for new production-ready project scaffolds."
  ];
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

    case "kernel.approvals.approve": {
      if (!input.id) throw new Error("kernel.approvals.approve requires input.id");
      const db = createSqliteAdapter({ root });
      db.init();
      return createApprovalLedger({ db }).approve({ id: input.id, decidedBy: input.decidedBy || "local-user" });
    }

    case "kernel.dashboard.snapshot":
      return dashboardSnapshot({ root });

    case "kernel.dogfood.prod": {
      const output = runNode(root, "scripts/dogfood-production-audit.mjs", input.repos || []);
      return JSON.parse(output);
    }

    case "kernel.workflow.audit_repo":
      return workflowAuditRepo(root, input);

    case "kernel.workflow.run_full_qa":
      return workflowRunFullQa(root, input);

    case "kernel.workflow.explain_failures":
      return workflowExplainFailures(root, input);

    case "kernel.workflow.create_app":
      return workflowCreateApp(root, input);

    case "kernel.workflow.release_readiness":
      return workflowReleaseReadiness(root, input);

    case "kernel.workflow.pending_approvals":
      return workflowPendingApprovals(root, input);

    case "kernel.workflow.stress_dashboard":
      return workflowStressDashboard(root, input);

    case "kernel.workflow.daily_summary":
      return workflowDailySummary(root);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

function cryptoRandomId() {
  return `job_${crypto.randomUUID()}`;
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
