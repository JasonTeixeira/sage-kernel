import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  __closedLoopTestInternals,
  createClosedLoopWorkflow,
  formatClosedLoopOutput,
  proveClosedLoopWorkflows,
  validateClosedLoopWorkflows
} from "../packages/workflows/closed-loop.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

const root = new URL("..", import.meta.url).pathname;

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-loop-profile-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return dir;
}

test("closed-loop workflow creates enforceable phases from detected profile", () => {
  const loop = createClosedLoopWorkflow({
    projectPath: ".",
    mode: "plan",
    objective: "Ship Program 3 closed-loop workflow.",
    risk: "high"
  }, { root });

  assert.equal(loop.status, "passed");
  assert.equal(loop.profile.id, "mcp-server");
  assert.equal(loop.phases.length >= 5, true);
  assert.equal(loop.commands.includes("npm run mcp:validate"), true);
  assert.equal(loop.commands.includes("npm run release:check"), true);
  assert.equal(loop.rollback.required, true);
  assert.equal(loop.run.length, 0);
});

test("closed-loop workflow validates, proves, and executes through an injected runner", () => {
  assert.equal(validateClosedLoopWorkflows({ root }).status, "passed");
  assert.equal(proveClosedLoopWorkflows({ root }).status, "passed");

  const loop = createClosedLoopWorkflow({ projectPath: ".", mode: "run", risk: "low" }, {
    root,
    runner: (command) => ({ command, status: command === "git diff --check" ? 1 : 0, stdout: "", stderr: "diff issue" })
  });

  assert.equal(loop.status, "failed");
  assert.equal(loop.nextActions.some((item) => item.includes("git diff --check")), true);

  const passed = createClosedLoopWorkflow({ projectPath: ".", mode: "run", risk: "low" }, {
    root,
    runner: (command) => ({ command, status: 0, stdout: "ok", stderr: "" })
  });
  assert.equal(passed.status, "passed");
  assert.match(passed.nextActions.at(-1), /Executed/);
});

test("closed-loop workflow applies framework-specific refinements", () => {
  const web = fixture({
    "package.json": JSON.stringify({ name: "web", dependencies: { next: "1", react: "1" }, scripts: { test: "node --test" } }),
    "next.config.mjs": "export default {}\n"
  });
  const webLoop = createClosedLoopWorkflow({ projectPath: ".", mode: "plan", risk: "medium" }, { root: web });
  assert.equal(webLoop.profile.id, "web-app");
  assert.equal(webLoop.phases.find((phase) => phase.id === "verify").evidence.includes("browser proof"), true);

  const api = fixture({
    "pyproject.toml": "[project]\ndependencies = ['fastapi']\n",
    "app/main.py": "from fastapi import FastAPI\n"
  });
  const apiLoop = createClosedLoopWorkflow({ projectPath: ".", mode: "plan", risk: "critical" }, { root: api });
  assert.equal(apiLoop.profile.id, "backend-api");
  assert.equal(apiLoop.commands.includes("npm run release:check"), true);
  assert.equal(apiLoop.phases.find((phase) => phase.id === "verify").evidence.includes("API contract proof"), true);

  const cli = fixture({
    "package.json": JSON.stringify({ name: "cli", bin: { cli: "bin/cli.mjs" }, scripts: { test: "node --test" } }),
    "bin/cli.mjs": "#!/usr/bin/env node\nconsole.log('ok')\n"
  });
  const cliLoop = createClosedLoopWorkflow({ projectPath: ".", mode: "plan", risk: "low" }, { root: cli });
  assert.equal(cliLoop.profile.id, "cli-tool");
  assert.equal(cliLoop.commands.includes("npm pack --dry-run"), true);

  const infra = fixture({
    "package.json": JSON.stringify({ name: "infra" }),
    "Dockerfile": "FROM node:22\n",
    "infra/main.tf": "terraform {}\n"
  });
  const infraLoop = createClosedLoopWorkflow({ projectPath: ".", mode: "plan", risk: "low" }, { root: infra });
  assert.equal(infraLoop.profile.id, "infrastructure");
  assert.equal(infraLoop.commands.includes("npm run infra:validate"), true);

  assert.deepEqual(__closedLoopTestInternals.createFrameworkLoopRefinements("unknown").verificationCommands, ["npm run qa:gate"]);
});

test("closed-loop CLI and MCP tools expose plan, validate, prove, and run paths", async () => {
  const cli = spawnSync("node", ["bin/sage.mjs", "loop", "plan", ".", "--objective=Program 3", "--risk=high", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.equal(JSON.parse(cli.stdout).profile.id, "mcp-server");

  const validate = spawnSync("node", ["packages/workflows/scripts/workflows-validate.mjs", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(validate.status, 0, validate.stderr || validate.stdout);
  assert.equal(JSON.parse(validate.stdout).status, "passed");

  const prove = spawnSync("node", ["packages/workflows/scripts/workflows-prove.mjs", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(prove.status, 0, prove.stderr || prove.stdout);
  assert.equal(JSON.parse(prove.stdout).status, "passed");

  const mcpPlan = await callKernelTool(root, "kernel.loop.plan", { projectPath: ".", objective: "Program 3", risk: "high" });
  assert.equal(mcpPlan.profile.id, "mcp-server");
  const mcpValidation = await callKernelTool(root, "kernel.loop.validate", {});
  assert.equal(mcpValidation.status, "passed");
  const mcpProof = await callKernelTool(root, "kernel.loop.prove", {});
  assert.equal(mcpProof.status, "passed");
});

test("closed-loop formatting and internals cover defensive branches", () => {
  const defaultLoop = createClosedLoopWorkflow(undefined, undefined);
  assert.equal(defaultLoop.mode, "plan");
  assert.equal(defaultLoop.objective, "Complete the requested engineering task with evidence.");

  const validation = validateClosedLoopWorkflows({ root });
  assert.match(formatClosedLoopOutput(validation), /Closed-loop validation passed/);

  const invalidValidation = validateClosedLoopWorkflows({
    root,
    sample: {
      profile: null,
      phases: [],
      commands: [],
      stopConditions: []
    }
  });
  assert.equal(invalidValidation.status, "failed");
  assert.equal(invalidValidation.failures.length, 4);

  const proof = proveClosedLoopWorkflows({ root });
  assert.match(formatClosedLoopOutput(proof), /Closed-loop proof passed/);

  const failedProof = proveClosedLoopWorkflows({
    root,
    createWorkflow(input) {
      if (input.mode === "dry-run") return { run: [1], status: "passed", commands: [] };
      if (input.mode === "run") return { run: [], status: "failed", commands: [] };
      return { profile: { id: "library" }, status: "passed", phases: [] };
    }
  });
  assert.equal(failedProof.status, "failed");

  const planned = createClosedLoopWorkflow({ projectPath: ".", mode: "unknown", risk: "invalid" }, { root });
  assert.equal(planned.mode, "plan");
  assert.equal(planned.risk, "medium");
  assert.match(formatClosedLoopOutput(planned), /Closed Loop passed/);

  const unsafe = __closedLoopTestInternals.executeLoopCommands(root, ["rm -rf /tmp/nope"], null);
  assert.equal(unsafe[0].status, 125);

  const selected = __closedLoopTestInternals.selectVerificationCommands(["not allowlisted"]);
  assert.deepEqual(selected, ["npm run qa:gate"]);

  const selectedMany = __closedLoopTestInternals.selectVerificationCommands(["npm run mcp:smoke", "npm pack --dry-run"]);
  assert.deepEqual(selectedMany, ["npm run mcp:smoke", "npm pack --dry-run"]);

  const shell = __closedLoopTestInternals.runShell("node -e \"process.stdout.write('ok')\"", { root });
  assert.equal(shell.status, 0);
  assert.equal(shell.stdout, "ok");

  const failedShell = __closedLoopTestInternals.runShell("node -e \"process.exit(7)\"", { root });
  assert.equal(failedShell.status, 7);

  const fallbackResult = __closedLoopTestInternals.formatCommandResult("fixture", {});
  assert.equal(fallbackResult.status, 1);
  assert.equal(fallbackResult.stdout, "");
  assert.equal(fallbackResult.stderr, "");

  assert.equal(__closedLoopTestInternals.normalizeMode("run"), "run");
  assert.equal(__closedLoopTestInternals.normalizeMode("bogus"), "plan");
  assert.equal(__closedLoopTestInternals.normalizeRisk("critical"), "critical");
  assert.equal(__closedLoopTestInternals.normalizeRisk("bogus"), "medium");
  assert.equal(__closedLoopTestInternals.slug("MCP Server!"), "mcp_server");
  assert.equal(__closedLoopTestInternals.slug(""), "workflow");
});
