import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateReleaseProvenance } from "./validate-release-provenance.mjs";
import { verifyGlobalInstall } from "./verify-global-install.mjs";

export function createReleasePipelineProof(options = {}) {
  const root = options.root || process.cwd();
  const provenance = validateReleaseProvenance({ root });
  const npmWhoami = run("npm", ["whoami"], { cwd: root });
  const npmView = run("npm", ["view", "sage-kernel", "version", "--json"], { cwd: root });
  const globalInstall = verifyGlobalInstall({ root });
  const publicGlobalInstall = npmView.status === 0
    ? runPublicGlobalInstall(root)
    : { status: "blocked", reason: "Package is not published on npm." };
  const readyForPublish = provenance.status === "passed" && globalInstall.status === "passed";
  const report = {
    type: "release-pipeline-proof",
    status: readyForPublish ? "ready_without_external_publish" : "blocked",
    provenance,
    npmAuth: {
      status: npmWhoami.status === 0 ? "authenticated" : "missing_or_invalid",
      stdout: npmWhoami.stdout.trim(),
      stderr: npmWhoami.stderr.trim()
    },
    registry: {
      status: npmView.status === 0 ? "published" : "not_published",
      stdout: npmView.stdout.trim(),
      stderr: npmView.stderr.trim()
    },
    globalInstall,
    publicGlobalInstall,
    publishBoundary: "This proof does not publish. Publish only through GitHub Release/trusted publishing or explicit npm-token approval."
  };
  writeLatest(root, report);
  return report;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  });
  return { status: result.status ?? 1, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function runPublicGlobalInstall(root) {
  const prefix = fs.mkdtempSync(path.join(root, ".sage-kernel/tmp-public-install-"));
  const install = run("npm", ["install", "-g", "--prefix", prefix, "sage-kernel"], { cwd: root });
  if (install.status !== 0) return { status: "failed", step: "npm install -g sage-kernel", stderr: install.stderr.trim() };
  const sageBin = path.join(prefix, "bin", process.platform === "win32" ? "sage.cmd" : "sage");
  const doctor = run(sageBin, ["doctor", "--fast", "--json"], { cwd: root });
  const smoke = run(sageBin, ["mcp", "smoke"], { cwd: root });
  return {
    status: doctor.status === 0 && smoke.status === 0 ? "passed" : "failed",
    prefix,
    checks: [
      { command: "npm install -g sage-kernel", status: install.status },
      { command: "sage doctor --fast --json", status: doctor.status },
      { command: "sage mcp smoke", status: smoke.status }
    ]
  };
}

function writeLatest(root, report) {
  const file = path.join(root, ".sage-kernel/evidence/release-pipeline-latest.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createReleasePipelineProof({ root: process.cwd() });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "blocked" ? 1 : 0);
}
