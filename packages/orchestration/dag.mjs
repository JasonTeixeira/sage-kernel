// DAG orchestration (cat 15). Runs an arbitrary dependency graph of nodes:
// topologically ordered, independent nodes executed concurrently (bounded pool),
// a failed node skips its dependents (fail-closed), and the result is a typed
// per-node report. Builds on the bounded concurrency pool + lease primitives.

import { runConcurrent, maxConcurrencyObserved } from "./concurrent.mjs";

// Topologically order nodes; throws on a cycle or an unknown dependency.
export function topoSort(nodes = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const state = new Map(); // id -> "visiting" | "done"
  const order = [];
  const visit = (id) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") throw new Error(`dependency cycle at node: ${id}`);
    const node = byId.get(id);
    if (!node) throw new Error(`unknown node referenced as dependency: ${id}`);
    state.set(id, "visiting");
    for (const dep of node.deps || []) visit(dep);
    state.set(id, "done");
    order.push(id);
  };
  for (const node of nodes) visit(node.id);
  return order;
}

export async function runDag(nodes = [], options = {}) {
  if (new Set(nodes.map((n) => n.id)).size !== nodes.length) throw new Error("DAG node ids must be unique");
  topoSort(nodes); // validate acyclic + resolvable before running anything
  const limit = options.limit ?? 4;
  const run = options.runner || ((node) => (typeof node.task === "function" ? node.task(node) : undefined));
  const status = new Map();
  const values = new Map();
  let peakConcurrency = 0;

  const ready = () => nodes.filter((node) => !status.has(node.id) && (node.deps || []).every((dep) => status.has(dep)));

  while (true) {
    const batch = ready();
    if (batch.length === 0) break;
    // A node whose any dependency did not pass is skipped (fail-closed).
    const runnable = [];
    for (const node of batch) {
      if ((node.deps || []).some((dep) => status.get(dep) !== "passed")) status.set(node.id, "skipped");
      else runnable.push(node);
    }
    if (runnable.length === 0) continue;
    const results = await runConcurrent(runnable.map((node) => async () => run(node)), { limit });
    peakConcurrency = Math.max(peakConcurrency, maxConcurrencyObserved(results));
    runnable.forEach((node, index) => {
      const result = results[index];
      if (result && result.status === "fulfilled") {
        values.set(node.id, result.value);
        status.set(node.id, result.value && result.value.ok === false ? "failed" : "passed");
      } else {
        status.set(node.id, "failed");
        values.set(node.id, { ok: false, error: result?.reason || "node threw" });
      }
    });
  }

  const report = nodes.map((node) => ({ id: node.id, status: status.get(node.id) || "skipped", value: values.get(node.id) ?? null }));
  const failed = report.filter((node) => node.status === "failed");
  const skipped = report.filter((node) => node.status === "skipped");
  return {
    status: failed.length ? "failed" : skipped.length ? "needs_work" : "passed",
    order: topoSort(nodes),
    peakConcurrency,
    nodes: report
  };
}
