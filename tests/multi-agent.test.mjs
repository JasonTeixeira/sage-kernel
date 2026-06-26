import test from "node:test";
import assert from "node:assert/strict";
import { runMultiAgent } from "../packages/agents/multi-agent.mjs";

test("blocks honestly when no agent is configured and none injected", async () => {
  const result = await runMultiAgent(["code-review", "impacted-tests"], { env: {} });
  assert.equal(result.status, "blocked_not_implemented");
  assert.ok(result.routes.length === 2);
});

test("routes a plan to agents and runs them concurrently", async () => {
  const ran = [];
  const agentRunner = async (route) => {
    ran.push(route.agent);
    await new Promise((r) => setTimeout(r, 15));
    return { ok: true, summary: `${route.agent} done` };
  };
  const result = await runMultiAgent(["impacted-tests", "code-review", "secret-scan"], { agentRunner, limit: 4, context: { languages: ["typescript"] } });
  assert.equal(result.status, "passed");
  assert.equal(result.results.length, 3);
  assert.ok(result.agents.includes("tdd-guide"));
  assert.ok(result.agents.includes("security-reviewer"));
  // TypeScript review gate routes to the language-specialized reviewer.
  assert.ok(result.agents.includes("typescript-reviewer"));
  assert.ok(result.peakConcurrency > 1, "agents should run concurrently");
});

test("reports needs_work when an agent fails", async () => {
  const agentRunner = async (route) => ({ ok: route.gate !== "secret-scan", summary: route.gate });
  const result = await runMultiAgent(["impacted-tests", "secret-scan"], { agentRunner });
  assert.equal(result.status, "needs_work");
});
