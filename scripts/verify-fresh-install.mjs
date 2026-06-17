import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const sourceRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-fresh-"));
const cloneRoot = path.join(tempRoot, "sage-kernel");
const skipInstall = process.argv.includes("--skip-install");
const worktreeCopy = process.argv.includes("--worktree-copy");
const checks = [];

if (worktreeCopy) {
  copyWorktree(sourceRoot, cloneRoot);
} else {
  run("git", ["clone", "--depth=1", sourceRoot, cloneRoot], { cwd: tempRoot });
}
if (!skipInstall) run("npm", ["ci"], { cwd: cloneRoot });

for (const [command, args] of [
  ["npm", ["run", "public:validate"]],
  ["npm", ["run", "mcp:validate"]],
  ["npm", ["run", "mcp:contracts"]],
  ["npm", ["run", "mcp:smoke"]],
  ["node", ["bin/sage.mjs", "mcp", "smoke"]],
  ["npm", ["run", "dashboard:build"]],
  ["npm", ["run", "release:pack"]]
]) {
  const result = run(command, args, { cwd: cloneRoot });
  checks.push({ command: [command, ...args].join(" "), status: result.status });
}

const doctor = JSON.parse(runCapture("node", ["bin/sage.mjs", "doctor", "--fast", "--json"], { cwd: cloneRoot }));
if (doctor.status !== "passed") throw new Error("Fresh install doctor did not pass");
checks.push({ command: "node bin/sage.mjs doctor --fast --json", status: 0, assertion: "doctor status passed" });

const mcpConfig = JSON.parse(runCapture("node", ["bin/sage.mjs", "mcp", "config", "all", "--json"], { cwd: cloneRoot }));
if (!mcpConfig.clients?.codex || !mcpConfig.clients?.["claude-desktop"] || !mcpConfig.clients?.cursor) {
  throw new Error("Fresh install MCP config did not include codex, claude-desktop, and cursor clients");
}
checks.push({ command: "node bin/sage.mjs mcp config all --json", status: 0, assertion: "all MCP client configs generated" });

const pack = JSON.parse(runCapture("npm", ["pack", "--dry-run", "--json"], { cwd: cloneRoot }))[0];
const packedFiles = new Set(pack.files.map((file) => file.path));
for (const file of ["assets/sage-kernel-architecture.svg", "assets/sage-kernel-workflow.svg", "bin/sage.mjs"]) {
  if (!packedFiles.has(file)) throw new Error(`Fresh install package dry-run missing ${file}`);
}
checks.push({ command: "npm pack --dry-run --json", status: 0, assertion: "package includes visuals and sage binary" });

console.log(JSON.stringify({
  status: "passed",
  sourceRoot,
  cloneRoot,
  source: worktreeCopy ? "worktree-copy" : "git-clone",
  install: skipInstall ? "skipped" : "npm ci",
  checks
}, null, 2));

function copyWorktree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  const files = runCapture("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: from })
    .split("\n")
    .filter(Boolean);
  for (const file of files) {
    const source = path.join(from, file);
    const destination = path.join(to, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || sourceRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 12
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${[command, ...args].join(" ")} failed`);
  }
  return { status: result.status ?? 0, stdout: result.stdout, stderr: result.stderr };
}

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || sourceRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 12
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${[command, ...args].join(" ")} failed`);
  }
  return result.stdout;
}
