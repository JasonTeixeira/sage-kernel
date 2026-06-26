import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { selectAgent, routePlan, routeTask, AGENT_CATALOG } from "../packages/agents/router.mjs";
import { runGuard } from "../packages/operate/guard.mjs";
import { generatePreCommitHook, installGitHooks } from "../packages/operate/hooks.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-loopint-"));
}

// --- agent router ---

test("routes test gates to tdd-guide and security gates to security-reviewer", () => {
  assert.equal(selectAgent({ gate: "impacted-tests" }).agent, "tdd-guide");
  assert.equal(selectAgent({ gate: "security-proof", riskLevel: "high" }).agent, "security-reviewer");
  assert.equal(selectAgent({ gate: "release-check" }).agent, "release-engineer");
});

test("routes review gates to a language-specialized reviewer when a language is known", () => {
  assert.equal(selectAgent({ gate: "code-review", languages: ["typescript"] }).agent, "typescript-reviewer");
  assert.equal(selectAgent({ gate: "code-review", languages: ["python"] }).agent, "python-reviewer");
  assert.equal(selectAgent({ gate: "code-review", languages: [] }).agent, "code-reviewer");
});

test("falls back to general-purpose with low confidence for an unknown gate", () => {
  const route = selectAgent({ gate: "totally-unknown" });
  assert.equal(route.agent, "general-purpose");
  assert.ok(route.confidence < 0.5);
});

test("routePlan assigns an agent to every gate and AGENT_CATALOG covers core roles", () => {
  const routes = routePlan(["impacted-tests", "code-review", "security-proof"], { languages: ["go"] });
  assert.equal(routes.length, 3);
  assert.ok(routes.every((route) => route.agent));
  assert.equal(routes.find((r) => r.gate === "code-review").agent, "go-reviewer");
  for (const role of ["testing", "review", "security", "release"]) {
    assert.ok(AGENT_CATALOG.some((agent) => agent.role === role), `missing role ${role}`);
  }
});

test("routeTask routes a high-risk goal to security and senior review", () => {
  const routed = routeTask({ root: repoRoot, goal: "Add OAuth login and session auth", acceptanceCriteria: ["x"] });
  assert.equal(routed.riskLevel, "high");
  assert.ok(routed.routes.some((route) => route.agent === "security-reviewer"));
  assert.ok(routed.routes.some((route) => route.gate === "senior-review"));
});

// --- operate guard (auto-interception engine) ---

test("guard passes when impacted tests pass and records proofs", async () => {
  const root = tempRoot();
  const report = await runGuard({
    root,
    files: ["docs/readme.md"],
    testRunner: async () => ({ status: "passed" })
  });
  assert.equal(report.status, "passed");
  assert.ok(report.gates[0].proofId.startsWith("proof_"));
  assert.ok(report.gates[0].agent);
  assert.equal(report.claimFirewall.status, "passed");
});

test("guard fails when impacted tests fail", async () => {
  const root = tempRoot();
  const report = await runGuard({
    root,
    files: ["src/app.mjs"],
    testRunner: async () => ({ status: "failed" })
  });
  assert.equal(report.status, "failed");
});

test("guard fails a high-risk change that has no mapped test (no debt allowed)", async () => {
  const root = tempRoot();
  const report = await runGuard({
    root,
    files: ["src/auth/login.ts"],
    testRunner: async () => ({ status: "skipped" })
  });
  assert.equal(report.risk, "high");
  assert.equal(report.status, "failed");
  assert.ok(report.gates.some((gate) => gate.category === "risk-coverage" && gate.status === "failed"));
});

// --- git hook installer ---

test("generatePreCommitHook invokes the guard", () => {
  const hook = generatePreCommitHook();
  assert.match(hook, /#!\/bin\/sh/);
  assert.match(hook, /sage\.mjs guard/);
});

test("installGitHooks installs an executable pre-commit hook and skips a non-git dir", () => {
  const root = tempRoot();
  assert.equal(installGitHooks({ root }).status, "skipped");

  spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  const result = installGitHooks({ root });
  assert.equal(result.status, "installed");
  const hookPath = path.join(root, ".git/hooks/pre-commit");
  assert.equal(fs.existsSync(hookPath), true);
  assert.match(fs.readFileSync(hookPath, "utf8"), /sage\.mjs guard/);
  assert.ok((fs.statSync(hookPath).mode & 0o111) !== 0, "hook should be executable");
});
