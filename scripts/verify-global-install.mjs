import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function verifyGlobalInstall(options = {}) {
  const root = options.root || process.cwd();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sage-global-install-"));
  const prefix = path.join(temp, "prefix");
  const pack = run("npm", ["pack", "--json"], { cwd: root });
  const tarball = JSON.parse(pack.stdout)[0].filename;
  const tarballPath = path.join(root, tarball);
  const install = run("npm", ["install", "-g", "--prefix", prefix, tarballPath], { cwd: root });
  const bin = path.join(prefix, "bin", process.platform === "win32" ? "sage.cmd" : "sage");
  const doctor = run(bin, ["doctor", "--fast", "--json"], { cwd: root });
  const smoke = run(bin, ["mcp", "smoke"], { cwd: root });
  const config = run(bin, ["mcp", "config", "all", "--json"], { cwd: root });
  fs.rmSync(tarballPath, { force: true });
  return {
    type: "global-install-proof",
    status: doctor.status === 0 && smoke.status === 0 && config.status === 0 ? "passed" : "failed",
    prefix,
    tarball,
    checks: [
      { command: "npm pack --json", status: pack.status },
      { command: "npm install -g --prefix <temp> <tarball>", status: install.status },
      { command: "sage doctor --fast --json", status: doctor.status, parsedStatus: safeJson(doctor.stdout)?.status || null },
      { command: "sage mcp smoke", status: smoke.status },
      { command: "sage mcp config all --json", status: config.status, clients: Object.keys(safeJson(config.stdout)?.clients || {}) }
    ]
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16
  });
  return { status: result.status ?? 1, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = verifyGlobalInstall({ root: process.cwd() });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
