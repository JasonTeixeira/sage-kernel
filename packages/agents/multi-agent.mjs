// Live multi-agent orchestration: route a gate plan to specialized agents and
// run them concurrently through the bounded pool, recording a real trace
// (assigned agents + observed peak concurrency). Provider-gated: with no agent
// configured and no injected runner it returns blocked_not_implemented (honest),
// never fabricated agent work.

import { spawnSync } from "node:child_process";
import { routePlan } from "./router.mjs";
import { isAgentConfigured } from "./executor.mjs";
import { runConcurrent, maxConcurrencyObserved } from "../orchestration/concurrent.mjs";

export async function runMultiAgent(plan = [], options = {}) {
  const routes = routePlan(plan, options.context || {});
  const runner = options.agentRunner || (isAgentConfigured(options.env) ? commandAgentRunner : null);
  if (!runner) {
    return {
      status: "blocked_not_implemented",
      reason: "no agent configured (set SAGE_AGENT_COMMAND or inject agentRunner)",
      routes
    };
  }
  const tasks = routes.map((route) => async () => ({ ...route, result: await runner(route, options) }));
  const raw = await runConcurrent(tasks, { limit: options.limit ?? 4 });
  const results = raw.filter(Boolean).map((entry) => entry.value).filter(Boolean);
  const allOk = results.length === routes.length && results.every((entry) => entry.result && entry.result.ok !== false);
  return {
    status: allOk ? "passed" : "needs_work",
    agents: routes.map((route) => route.agent),
    peakConcurrency: maxConcurrencyObserved(raw),
    routes,
    results
  };
}

function commandAgentRunner(route, options = {}) {
  const command = (options.env || process.env).SAGE_AGENT_COMMAND;
  const result = spawnSync(command, [route.agent, JSON.stringify(route)], {
    cwd: options.root || process.cwd(),
    encoding: "utf8",
    timeout: 600000,
    shell: true
  });
  return { ok: result.status === 0, summary: (result.stdout || result.stderr || "").trim().slice(0, 200) };
}
