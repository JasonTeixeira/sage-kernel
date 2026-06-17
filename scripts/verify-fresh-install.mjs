import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const sourceRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-fresh-"));
const cloneRoot = path.join(tempRoot, "sage-kernel");
const skipInstall = process.argv.includes("--skip-install");
const worktreeCopy = process.argv.includes("--worktree-copy");

if (worktreeCopy) {
  copyWorktree(sourceRoot, cloneRoot);
} else {
  run("git", ["clone", "--depth=1", sourceRoot, cloneRoot], { cwd: tempRoot });
}
if (!skipInstall) run("npm", ["ci"], { cwd: cloneRoot });

for (const [command, args] of [
  ["npm", ["run", "mcp:validate"]],
  ["npm", ["run", "mcp:contracts"]],
  ["npm", ["run", "mcp:smoke"]],
  ["npm", ["run", "dashboard:build"]],
  ["npm", ["run", "release:pack"]]
]) {
  run(command, args, { cwd: cloneRoot });
}

console.log(JSON.stringify({
  status: "passed",
  sourceRoot,
  cloneRoot,
  source: worktreeCopy ? "worktree-copy" : "git-clone",
  install: skipInstall ? "skipped" : "npm ci"
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
