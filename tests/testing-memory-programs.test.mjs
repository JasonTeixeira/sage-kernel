import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  createPerformanceBudget,
  createPlaywrightTemplate,
  createTestingLabProof,
  generateTestStrategy
} from "../packages/testing/testing-lab.mjs";
import {
  approveLearningUpdate,
  createKnowledgeGraph,
  enforceMemoryPolicy,
  proposeLearningUpdate
} from "../packages/intelligence/knowledge-graph.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");

function run(args, options = {}) {
  return spawnSync(args[0], args.slice(1), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
    ...options
  });
}

function makeProject(pkg) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-program-7-8-"));
  fs.writeFileSync(path.join(workspace, "package.json"), JSON.stringify(pkg));
  fs.mkdirSync(path.join(workspace, "src", "routes"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "routes", "health.js"), "export function health() { return 'ok'; }\n");
  fs.mkdirSync(path.join(workspace, "tests"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "tests", "health.test.js"), "import '../src/routes/health.js';\n");
  return workspace;
}

test("testing lab generates profile-aware strategy, Playwright template, budgets, and proof", async () => {
  const workspace = makeProject({
    name: "next-proof-app",
    dependencies: { next: "latest", react: "latest" },
    scripts: { test: "node --test", "test:coverage": "node --test --experimental-test-coverage" }
  });
  process.env.SAGE_REVIEW_ALLOWED_ROOTS = workspace;
  try {
    const strategy = generateTestStrategy({ root, projectPath: workspace, risk: "high" });
    assert.equal(strategy.profile, "web-app");
    assert.equal(strategy.layers.some((layer) => layer.id === "browser-e2e"), true);
    assert.equal(strategy.requiredCommands.includes("npm run test:coverage"), true);

    const template = createPlaywrightTemplate({ root, projectPath: workspace });
    assert.equal(template.status, "passed");
    assert.match(template.files["playwright.config.ts"], /defineConfig/);
    assert.match(template.files["tests\/e2e\/smoke.spec.ts"], /mobile/);

    const budget = createPerformanceBudget({ root, projectPath: workspace, profile: "web-app" });
    assert.equal(budget.status, "passed");
    assert.equal(budget.budgets.http.p95Ms <= 500, true);
    assert.equal(budget.stressProfiles.some((profile) => profile.count >= 100000), true);

    const proof = createTestingLabProof({ root, projectPath: workspace, risk: "high" });
    assert.equal(proof.status, "passed");
    assert.equal(proof.longSoak.profile, "release");

    const cli = run(["node", "bin/sage.mjs", "testing", "proof", workspace, "--json"], {
      env: { ...process.env, SAGE_REVIEW_ALLOWED_ROOTS: workspace }
    });
    assert.equal(cli.status, 0, cli.stderr || cli.stdout);
    assert.equal(JSON.parse(cli.stdout).performance.status, "passed");

    const mcp = await callKernelTool(root, "kernel.testing.proof", { projectPath: workspace, risk: "high" });
    assert.equal(mcp.strategy.profile, "web-app");
  } finally {
    delete process.env.SAGE_REVIEW_ALLOWED_ROOTS;
  }
});

test("memory graph enforces policy, queries relationships, and approves learning updates", async () => {
  const workspace = makeProject({
    name: "memory-graph-app",
    dependencies: { "@modelcontextprotocol/sdk": "latest" },
    scripts: { test: "node --test" }
  });
  process.env.SAGE_REVIEW_ALLOWED_ROOTS = workspace;
  try {
    const safe = enforceMemoryPolicy({
      projectId: "memory-graph-app",
      scope: "project",
      kind: "decision",
      source: "test",
      summary: "Use contract tests for MCP tools.",
      confidence: 0.92,
      evidenceRef: "node --test"
    });
    assert.equal(safe.status, "passed");
    assert.equal(safe.requiresApproval, false);

    const global = enforceMemoryPolicy({
      projectId: "global",
      scope: "global",
      kind: "standard",
      source: "agent",
      summary: "Always add security tests for auth changes.",
      confidence: 0.91,
      evidenceRef: "review"
    });
    assert.equal(global.requiresApproval, true);

    assert.equal(enforceMemoryPolicy({
      projectId: "memory-graph-app",
      scope: "project",
      kind: "episode",
      source: "agent",
      summary: "Secret token ABC should be remembered.",
      confidence: 0.3,
      evidenceRef: "chat"
    }).status, "blocked");

    const graph = createKnowledgeGraph({ root, projectPath: workspace });
    assert.equal(graph.status, "passed");
    assert.equal(graph.nodes.some((node) => node.type === "project"), true);
    assert.equal(graph.query({ type: "route" }).length, 1);
    assert.equal(graph.edges.some((edge) => edge.type === "has_test"), true);

    const proposal = proposeLearningUpdate({
      root,
      projectPath: workspace,
      failure: "Route test was missing.",
      fix: "Added tests/health.test.js.",
      scope: "project"
    });
    assert.equal(proposal.status, "proposed");
    assert.equal(proposal.memory.policy.status, "passed");

    const approved = approveLearningUpdate(proposal, { approvedBy: "tester" });
    assert.equal(approved.status, "approved");
    assert.equal(approved.memory.source, "learning-loop");

    const cli = run(["node", "bin/sage.mjs", "memory", "graph", workspace, "--json"], {
      env: { ...process.env, SAGE_REVIEW_ALLOWED_ROOTS: workspace }
    });
    assert.equal(cli.status, 0, cli.stderr || cli.stdout);
    assert.equal(JSON.parse(cli.stdout).status, "passed");

    const mcp = await callKernelTool(root, "kernel.memory.graph", { projectPath: workspace });
    assert.equal(mcp.status, "passed");
    const mcpProposal = await callKernelTool(root, "kernel.memory.learning_propose", {
      projectPath: workspace,
      failure: "A regression escaped.",
      fix: "Added focused regression test."
    });
    assert.equal(mcpProposal.status, "proposed");
  } finally {
    delete process.env.SAGE_REVIEW_ALLOWED_ROOTS;
  }
});
