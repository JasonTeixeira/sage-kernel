import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { findJob, makeRunId, nowIso, readJson, runCommand, runsDir, writeJson } from "./lib.mjs";
import { runSql, sqlJson, sqlString } from "../../../packages/db/scripts/db-lib.mjs";

export async function runJob(id, options = {}) {
  const root = options.root || process.cwd();
  const parentRunId = options.parentRunId || null;
  const commandRunner = options.commandRunner || runCommand;
  const shouldPersist = options.persist !== false;
  const approvalPolicy = readJson(root, "apps/worker/approval-policy.json");
  const job = findJob(root, id);
  if (job.approval === "required") {
    return {
      id,
      status: "blocked",
      startedAt: nowIso(),
      finishedAt: nowIso(),
      parentRunId,
      steps: [
        {
          type: "approval-required",
          status: "blocked",
          reason: "Job requires explicit approval and cannot run through the local safe runner."
        }
      ]
    };
  }

  const run = {
    runId: makeRunId(job.id),
    jobId: job.id,
    kind: job.kind,
    risk: job.risk,
    status: "running",
    parentRunId,
    startedAt: nowIso(),
    finishedAt: null,
    durationMs: null,
    approvalPolicy: approvalPolicy.default,
    steps: []
  };

  const started = Date.now();

  for (const step of job.steps) {
    if (step.type === "npm-script") {
      const result = commandRunner(root, "npm", ["run", step.script], job.timeoutMs);
      run.steps.push({ ...step, result, status: result.status === 0 ? "passed" : "failed" });
      if (result.status !== 0) {
        run.status = "failed";
        break;
      }
    } else if (step.type === "builtin" && step.name === "repo-health") {
      const result = repoHealth(root);
      run.steps.push({ ...step, result, status: result.missing.length === 0 ? "passed" : "warning" });
    } else if (step.type === "job") {
      const nested = await runJob(step.job, { ...options, root, parentRunId: run.runId });
      run.steps.push({ ...step, nested, status: nested.status === "passed" ? "passed" : nested.status });
      if (nested.status === "failed" || nested.status === "blocked") {
        run.status = nested.status;
        break;
      }
    } else if (step.type === "approval-required") {
      run.steps.push({ ...step, status: "blocked" });
      run.status = "blocked";
      break;
    } else {
      run.steps.push({ ...step, status: "failed", error: `Unknown step type: ${step.type}` });
      run.status = "failed";
      break;
    }
  }

  if (run.status === "running") run.status = "passed";
  run.finishedAt = nowIso();
  run.durationMs = Date.now() - started;

  if (shouldPersist) {
    persistRun(root, run);
    writeJson(root, path.join(".sage-kernel", "runs", `${run.runId}.json`), run);
  }
  return run;
}

export function persistRun(root, run) {
  runSql(root, `.read packages/db/schema.sql`);
  const signature = crypto.createHash("sha256").update(JSON.stringify(run)).digest("hex");
  run.signature = signature;
  runSql(
    root,
    `INSERT OR REPLACE INTO job_runs (id, job_id, status, duration_ms, result_json, signature, created_at)
     VALUES (${sqlString(run.runId)}, ${sqlString(run.jobId)}, ${sqlString(run.status)}, ${Number(run.durationMs ?? 0)}, ${sqlJson(run)}, ${sqlString(signature)}, ${sqlString(run.finishedAt || nowIso())});`
  );
}

export function repoHealth(root = process.cwd()) {
  const catalog = readJson(root, "catalog/repos.json");
  const sourceRoot = catalogSourceRoot(catalog);
  const checked = [];
  const missing = [];

  for (const repo of catalog.repos) {
    const repoPath = sourceRoot ? path.join(sourceRoot, repo.name) : "";
    const exists = fs.existsSync(repoPath);
    const hasPackageJson = exists && fs.existsSync(path.join(repoPath, "package.json"));
    const hasPyproject = exists && fs.existsSync(path.join(repoPath, "pyproject.toml"));
    const hasReadme = exists && fs.existsSync(path.join(repoPath, "README.md"));
    const item = {
      name: repo.name,
      path: repoPath,
      exists,
      role: repo.role,
      target: repo.target,
      hasPackageJson,
      hasPyproject,
      hasReadme
    };
    checked.push(item);
    if (sourceRoot && !exists) missing.push(item);
  }

  return {
    sourceRoot,
    configured: Boolean(sourceRoot),
    checkedCount: checked.length,
    missingCount: missing.length,
    missing,
    checked
  };
}

export function catalogSourceRoot(catalog) {
  if (catalog.sourceRootEnv && process.env[catalog.sourceRootEnv]) return process.env[catalog.sourceRootEnv];
  return catalog.sourceRoot || "";
}

export async function runJobCli(args = process.argv.slice(2), options = {}) {
  const root = options.root || process.cwd();
  const [jobId] = args;
  if (!jobId) {
    return { status: 1, stderr: "Usage: npm run jobs:run -- <job-id>" };
  }

  const run = await runJob(jobId, { root, commandRunner: options.commandRunner, persist: options.persist });
  const runId = run.runId || run.id;
  const runPath = path.join(runsDir(root), `${runId}.json`);
  return {
    status: 0,
    stdout: JSON.stringify({
      runId,
      jobId: run.jobId || run.id,
      status: run.status,
      durationMs: run.durationMs,
      path: runPath
    }, null, 2)
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runJobCli();
  if (result.stderr) console.error(result.stderr);
  if (result.stdout) console.log(result.stdout);
  process.exit(result.status);
}
