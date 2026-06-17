import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { dashboardSnapshot } from "../../apps/dashboard/server.mjs";
import { readLatestEvalReport } from "./scripts/eval-runner.mjs";
import { createMemoryStore } from "./memory-store.mjs";

export function createProjectState(options = {}) {
  const root = options.root || process.cwd();
  const pkg = readJson(path.join(root, "package.json"), {});
  const git = inspectGit(root);
  const memory = safeValue(() => createMemoryStore({ root, schemaRoot: options.schemaRoot }).audit(), { total: 0, kinds: [], sources: [], latest: [] });
  const evalReport = readLatestEvalReport({ root });
  const dashboard = safeValue(() => dashboardSnapshot({ root, schemaRoot: options.schemaRoot }), null);
  const pendingApprovals = dashboard?.approvals?.inbox?.filter((approval) => approval.status === "pending").length || 0;
  const checks = [
    { name: "git-clean", status: git.clean ? "passed" : "warning" },
    { name: "eval-report", status: evalReport.status === "passed" ? "passed" : "warning" },
    { name: "dashboard-health", status: dashboard?.system?.health?.status === "degraded" ? "warning" : "passed" },
    { name: "pending-approvals", status: pendingApprovals === 0 ? "passed" : "warning" }
  ];

  return {
    project: {
      name: pkg.name || path.basename(root),
      version: pkg.version || null,
      root
    },
    status: checks.some((check) => check.status === "failed")
      ? "blocked"
      : checks.some((check) => check.status === "warning")
        ? "needs_attention"
        : "ready",
    generatedAt: new Date().toISOString(),
    git,
    evals: {
      status: evalReport.status,
      summary: evalReport.summary || { total: 0, passed: 0, failed: 0 }
    },
    memory,
    dashboard: dashboard
      ? {
          health: dashboard.system.health.status,
          summary: dashboard.system.health.summary,
          tools: dashboard.tools.length,
          pendingApprovals
        }
      : null,
    checks,
    nextActions: nextActions(checks)
  };
}

function inspectGit(root) {
  const branch = runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = runGit(root, ["status", "--short"]);
  const commit = runGit(root, ["rev-parse", "--short", "HEAD"]);
  return {
    available: branch.status === 0 && commit.status === 0,
    branch: branch.stdout || null,
    commit: commit.stdout || null,
    clean: status.status === 0 && status.stdout.length === 0,
    changed: status.stdout ? status.stdout.split("\n").filter(Boolean) : []
  };
}

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

function nextActions(checks) {
  const actions = [];
  if (checks.find((check) => check.name === "git-clean")?.status === "warning") actions.push("Review and commit or intentionally discard local changes.");
  if (checks.find((check) => check.name === "eval-report")?.status === "warning") actions.push("Run npm run eval:run to refresh deterministic eval evidence.");
  if (checks.find((check) => check.name === "pending-approvals")?.status === "warning") actions.push("Review pending approvals before executing mutating workflows.");
  if (actions.length === 0) actions.push("Continue with the next implementation program.");
  return actions;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function safeValue(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
