import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/repos.json"), "utf8"));
const requested = process.argv.slice(2);
const defaults = ["commerce-command-os", "jobcopilot", "trayd"];
const targets = requested.length ? requested : defaults;

function inspect(repoName) {
  const repoPath = path.join(catalog.sourceRoot, repoName);
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
  const qa = exists
    ? spawnSync("node", ["packages/qa/scripts/qa-runner.mjs", repoPath], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 8 })
    : null;
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
    checks: Object.fromEntries(checks),
    score: checks.filter(([, pass]) => pass).length,
    maxScore: checks.length,
    qaStatus: qa ? (qa.status === 0 ? "passed" : "failed") : "missing",
    failedQaChecks
  };
}

const report = {
  auditedAt: new Date().toISOString(),
  targets,
  results: targets.map(inspect)
};

console.log(JSON.stringify(report, null, 2));
