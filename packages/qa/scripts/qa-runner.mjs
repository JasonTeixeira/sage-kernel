import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { signRecord } from "../../security/guard.mjs";

export function allowedRoots({ root = process.cwd(), env = process.env } = {}) {
  const configured = (env.SAGE_KERNEL_ALLOWED_ROOTS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  return [root, ...configured].map((item) => realPath(path.resolve(item)));
}

export function isAllowedProjectPath(absolutePath, options = {}) {
  const resolvedPath = realPath(absolutePath);
  return allowedRoots(options).some((allowedRoot) => resolvedPath === allowedRoot || resolvedPath.startsWith(`${allowedRoot}${path.sep}`));
}

function realPath(absolutePath) {
  try {
    return fs.realpathSync.native(absolutePath);
  } catch {
    return absolutePath;
  }
}

export function parseMode(args) {
  return args.includes("--deep") ? "deep" : args.includes("--standard") ? "standard" : "fast";
}

export function run(command, commandArgs, cwd, timeoutMs = 120000, spawn = spawnSync) {
  const result = spawn(command, commandArgs, { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024 * 8 });
  return {
    command: [command, ...commandArgs].join(" "),
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim().slice(-5000),
    stderr: (result.stderr || "").trim().slice(-5000)
  };
}

export function packageChecks(cwd, { mode = "fast", spawn = spawnSync } = {}) {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) return [];
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const scripts = mode === "fast" ? ["lint", "test"] : ["lint", "typecheck", "test", "build"];
  return scripts
    .filter((script) => pkg.scripts?.[script])
    .map((script) => ({ name: `npm:${script}`, result: run("npm", ["run", script], cwd, 120000, spawn) }));
}

export function staticChecks(cwd) {
  const checks = [];
  for (const file of ["package.json", "README.md", ".env.example"]) {
    checks.push({ name: `file:${file}`, status: fs.existsSync(path.join(cwd, file)) ? "passed" : "warning" });
  }
  if (fs.existsSync(path.join(cwd, ".env.local"))) {
    checks.push({ name: "secret-boundary:.env.local", status: "passed", note: "local env file present but should remain ignored" });
  }
  return checks;
}

export function createQaReport(projectPath, options = {}) {
  const mode = options.mode || "fast";
  const startedAt = new Date().toISOString();
  const commandChecks = packageChecks(projectPath, { mode, spawn: options.spawn || spawnSync });
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
  return report;
}

export function runQaCli(args = process.argv.slice(2), options = {}) {
  const root = options.root || process.cwd();
  const env = options.env || process.env;
  const projectPath = path.resolve(root, args[0] || ".");
  const mode = parseMode(args);
  if (!isAllowedProjectPath(projectPath, { root, env })) {
    return {
      status: 1,
      stderr: `Refusing to run QA outside allowed roots: ${allowedRoots({ root, env }).join(", ")}`
    };
  }
  const report = createQaReport(projectPath, { mode, spawn: options.spawn });
  return {
    status: report.status === "passed" ? 0 : 1,
    stdout: JSON.stringify(report, null, 2)
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runQaCli();
  if (result.stderr) console.error(result.stderr);
  if (result.stdout) console.log(result.stdout);
  process.exit(result.status);
}
