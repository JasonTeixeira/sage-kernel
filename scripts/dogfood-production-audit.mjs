import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const defaults = ["commerce-command-os", "jobcopilot", "trayd"];

export function sourceRootForCatalog(catalog, env = process.env) {
  return catalog.sourceRootEnv && env[catalog.sourceRootEnv] ? env[catalog.sourceRootEnv] : catalog.sourceRoot || "";
}

export function inspectRepo(repoName, options = {}) {
  const root = options.root || process.cwd();
  const sourceRoot = options.sourceRoot || "";
  const runQa = options.runQa || ((repoPath) => spawnSync("node", ["packages/qa/scripts/qa-runner.mjs", repoPath], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  }));
  const repoPath = sourceRoot ? path.join(sourceRoot, repoName) : "";
  const exists = fs.existsSync(repoPath);
  const packagePath = path.join(repoPath, "package.json");
  const packageJson = exists && fs.existsSync(packagePath) ? JSON.parse(fs.readFileSync(packagePath, "utf8")) : null;
  const checks = [
    ["exists", exists],
    ["packageJson", Boolean(packageJson)],
    ["readme", exists && fs.existsSync(path.join(repoPath, "README.md"))],
    ["envExample", exists && fs.existsSync(path.join(repoPath, ".env.example"))],
    ["tests", Boolean(packageJson?.scripts?.test)],
    ["lint", Boolean(packageJson?.scripts?.lint)],
    ["build", Boolean(packageJson?.scripts?.build)]
  ];
  const qa = exists ? runQa(repoPath) : null;
  let qaReport = null;
  if (qa?.stdout) {
    try {
      qaReport = JSON.parse(qa.stdout);
    } catch {
      qaReport = null;
    }
  }
  const failedQaChecks = qaReport?.checks
    ?.filter((check) => check.status === "failed")
    .map((check) => ({
      name: check.name,
      command: check.result?.command || null,
      stderr: check.result?.stderr || null
    })) || [];
  return {
    repo: repoName,
    path: repoPath,
    configured: Boolean(sourceRoot),
    checks: Object.fromEntries(checks),
    score: checks.filter(([, pass]) => pass).length,
    maxScore: checks.length,
    qaStatus: qa ? (qa.status === 0 ? "passed" : "failed") : "missing",
    failedQaChecks
  };
}

export function createDogfoodReport(options = {}) {
  const root = options.root || process.cwd();
  const env = options.env || process.env;
  const catalog = options.catalog || JSON.parse(fs.readFileSync(path.join(root, "catalog/repos.json"), "utf8"));
  const sourceRoot = sourceRootForCatalog(catalog, env);
  const targets = options.targets?.length ? options.targets : defaults;
  return {
    auditedAt: new Date().toISOString(),
    sourceRoot,
    configured: Boolean(sourceRoot),
    targets,
    results: targets.map((repoName) => inspectRepo(repoName, {
      root,
      sourceRoot,
      runQa: options.runQa
    }))
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const requested = process.argv.slice(2);
  console.log(JSON.stringify(createDogfoodReport({ targets: requested }), null, 2));
}
