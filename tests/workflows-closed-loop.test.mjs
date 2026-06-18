import assert from "node:assert/strict";
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
  const validation = validateClosedLoopWorkflows({ root });
  assert.match(formatClosedLoopOutput(validation), /Closed-loop validation passed/);

  const proof = proveClosedLoopWorkflows({ root });
  assert.match(formatClosedLoopOutput(proof), /Closed-loop proof passed/);

  const planned = createClosedLoopWorkflow({ projectPath: ".", mode: "unknown", risk: "invalid" }, { root });
  assert.equal(planned.mode, "plan");
  assert.equal(planned.risk, "medium");
  assert.match(formatClosedLoopOutput(planned), /Closed Loop passed/);

  const unsafe = __closedLoopTestInternals.executeLoopCommands(root, ["rm -rf /tmp/nope"], null);
  assert.equal(unsafe[0].status, 125);

  const selected = __closedLoopTestInternals.selectVerificationCommands(["not allowlisted"]);
  assert.deepEqual(selected, ["npm run qa:gate"]);

  const shell = __closedLoopTestInternals.runShell("node -e \"process.stdout.write('ok')\"", { root });
  assert.equal(shell.status, 0);
  assert.equal(shell.stdout, "ok");
});
