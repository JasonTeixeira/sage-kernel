import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { signRecord } from "../../security/guard.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const projectPath = path.resolve(root, args[0] || ".");
const mode = args.includes("--deep") ? "deep" : args.includes("--standard") ? "standard" : "fast";

if (!projectPath.startsWith("/Users/Sage")) {
  console.error("Refusing to run QA outside /Users/Sage");
  process.exit(1);
}

function run(command, commandArgs, cwd, timeoutMs = 120000) {
  const result = spawnSync(command, commandArgs, { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024 * 8 });
  return {
    command: [command, ...commandArgs].join(" "),
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim().slice(-5000),
    stderr: (result.stderr || "").trim().slice(-5000)
  };
}

function packageChecks(cwd) {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) return [];
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const scripts = mode === "fast" ? ["lint", "test"] : ["lint", "typecheck", "test", "build"];
  return scripts
    .filter((script) => pkg.scripts?.[script])
    .map((script) => ({ name: `npm:${script}`, result: run("npm", ["run", script], cwd) }));
}

function staticChecks(cwd) {
  const checks = [];
  for (const file of ["package.json", "README.md", ".env.example"]) {
    checks.push({ name: `file:${file}`, status: fs.existsSync(path.join(cwd, file)) ? "passed" : "warning" });
  }
  if (fs.existsSync(path.join(cwd, ".env.local"))) {
    checks.push({ name: "secret-boundary:.env.local", status: "passed", note: "local env file present but should remain ignored" });
  }
  return checks;
}

const startedAt = new Date().toISOString();
const commandChecks = packageChecks(projectPath);
const fileChecks = staticChecks(projectPath);
const failed = commandChecks.some((check) => check.result.status !== 0);
const report = {
  projectPath,
  mode,
  status: failed ? "failed" : "passed",
  startedAt,
  finishedAt: new Date().toISOString(),
  checks: [
    ...fileChecks,
    ...commandChecks.map((check) => ({
      name: check.name,
      status: check.result.status === 0 ? "passed" : "failed",
      result: check.result
    }))
  ]
};
report.signature = signRecord(report);

console.log(JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
