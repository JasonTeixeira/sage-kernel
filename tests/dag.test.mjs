import test from "node:test";
import assert from "node:assert/strict";
import { topoSort, runDag } from "../packages/orchestration/dag.mjs";

test("topoSort orders dependencies and rejects cycles + unknown deps", () => {
  const order = topoSort([{ id: "a" }, { id: "b", deps: ["a"] }, { id: "c", deps: ["a", "b"] }]);
  assert.ok(order.indexOf("a") < order.indexOf("b"));
  assert.ok(order.indexOf("b") < order.indexOf("c"));
  assert.throws(() => topoSort([{ id: "x", deps: ["y"] }, { id: "y", deps: ["x"] }]), /cycle/);
  assert.throws(() => topoSort([{ id: "x", deps: ["ghost"] }]), /unknown node/);
});

test("runDag runs independent nodes concurrently and respects dependencies", async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const order = [];
  const node = (id, deps) => ({ id, deps, task: async () => { await sleep(15); order.push(id); return { ok: true }; } });
  const report = await runDag([node("a", []), node("b1", ["a"]), node("b2", ["a"]), node("c", ["b1", "b2"])], { limit: 4 });
  assert.equal(report.status, "passed");
  assert.equal(order.indexOf("a") < order.indexOf("b1"), true);
  assert.equal(order.indexOf("b2") < order.indexOf("c"), true);
  assert.ok(report.peakConcurrency >= 2, "b1 and b2 should run concurrently");
});

test("a failed node fails-closed: its dependents are skipped", async () => {
  const report = await runDag([
    { id: "root", deps: [], task: async () => ({ ok: true }) },
    { id: "bad", deps: ["root"], task: async () => ({ ok: false }) },
    { id: "child", deps: ["bad"], task: async () => ({ ok: true }) },
    { id: "sibling", deps: ["root"], task: async () => ({ ok: true }) }
  ]);
  assert.equal(report.status, "failed");
  const byId = Object.fromEntries(report.nodes.map((n) => [n.id, n.status]));
  assert.equal(byId.bad, "failed");
  assert.equal(byId.child, "skipped"); // dependent of a failed node
  assert.equal(byId.sibling, "passed"); // independent branch still runs
});

test("a thrown node is captured as failed, not a crash", async () => {
  const report = await runDag([{ id: "boom", deps: [], task: async () => { throw new Error("kaboom"); } }]);
  assert.equal(report.status, "failed");
  assert.equal(report.nodes[0].status, "failed");
  assert.match(report.nodes[0].value.error, /kaboom/);
});
