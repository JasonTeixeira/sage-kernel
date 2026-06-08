import fs from "node:fs";
import path from "node:path";
import { findJob, makeRunId, nowIso, readJson, runCommand, runsDir, writeJson } from "./lib.mjs";

const root = process.cwd();
const [jobId] = process.argv.slice(2);

if (!jobId) {
  console.error("Usage: npm run jobs:run -- <job-id>");
  process.exit(1);
}

const approvalPolicy = readJson(root, "apps/worker/approval-policy.json");

async function runJob(id, parentRunId = null) {
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
      const result = runCommand(root, "npm", ["run", step.script], job.timeoutMs);
      run.steps.push({ ...step, result, status: result.status === 0 ? "passed" : "failed" });
      if (result.status !== 0) {
        run.status = "failed";
        break;
      }
    } else if (step.type === "builtin" && step.name === "repo-health") {
      const result = repoHealth();
      run.steps.push({ ...step, result, status: result.missing.length === 0 ? "passed" : "warning" });
    } else if (step.type === "job") {
      const nested = await runJob(step.job, run.runId);
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

  writeJson(root, path.join(".sage-kernel", "runs", `${run.runId}.json`), run);
  return run;
}

function repoHealth() {
  const catalog = readJson(root, "catalog/repos.json");
  const sourceRoot = catalog.sourceRoot;
  const checked = [];
  const missing = [];

  for (const repo of catalog.repos) {
    const repoPath = path.join(sourceRoot, repo.name);
    const exists = fs.existsSync(repoPath);
    const hasPackageJson = fs.existsSync(path.join(repoPath, "package.json"));
    const hasPyproject = fs.existsSync(path.join(repoPath, "pyproject.toml"));
    const hasReadme = fs.existsSync(path.join(repoPath, "README.md"));
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
    if (!exists) missing.push(item);
  }

  return {
    sourceRoot,
    checkedCount: checked.length,
    missingCount: missing.length,
    missing,
    checked
  };
}

const run = await runJob(jobId);
const runPath = path.join(runsDir(root), `${run.runId}.json`);

console.log(JSON.stringify({
  runId: run.runId,
  jobId: run.jobId,
  status: run.status,
  durationMs: run.durationMs,
  path: runPath
}, null, 2));
