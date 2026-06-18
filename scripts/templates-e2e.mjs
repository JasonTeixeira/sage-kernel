import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const templates = ["worker-service", "node-api-service", "agent-workflow-app"];

export function runTemplatesE2E(options = {}) {
  const workspace = options.workspace || fs.mkdtempSync(path.join(os.tmpdir(), "sage-templates-e2e-"));
  const results = templates.map((template) => proveTemplate(template, workspace));
  const status = results.every((item) => item.status === "passed") ? "passed" : "failed";
  return {
    status,
    workspace,
    templates: results,
    summary: {
      total: results.length,
      passed: results.filter((item) => item.status === "passed").length,
      failed: results.filter((item) => item.status !== "passed").length
    }
  };
}

function proveTemplate(template, workspace) {
  const name = `proof-${template}`;
  const start = Date.now();
  const scaffold = run("node", ["packages/templates/scripts/template-scaffold-v2.mjs", "--template", template, "--name", name, "--out", workspace], root);
  const projectRoot = path.join(workspace, name);
  const install = scaffold.status === 0 ? run("npm", ["install", "--ignore-scripts"], projectRoot) : skipped("scaffold failed");
  const qa = install.status === 0 ? run("npm", ["run", "qa"], projectRoot) : skipped("install failed");
  const required = ["package.json", "README.md", "AGENTS.md", ".github/workflows/ci.yml", "Dockerfile", ".sage/project-plan.json"];
  const missing = required.filter((file) => !fs.existsSync(path.join(projectRoot, file)));
  return {
    template,
    name,
    projectRoot,
    status: scaffold.status === 0 && install.status === 0 && qa.status === 0 && missing.length === 0 ? "passed" : "failed",
    durationMs: Date.now() - start,
    missing,
    steps: { scaffold, install, qa }
  };
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 * 8 });
  return compactResult(`${command} ${args.join(" ")}`, result);
}

function skipped(reason) {
  return { command: "skipped", status: 1, stdout: "", stderr: reason };
}

function compactResult(command, result) {
  return {
    command,
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim().slice(0, 1000),
    stderr: String(result.stderr || "").trim().slice(0, 1000)
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const report = runTemplatesE2E();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
