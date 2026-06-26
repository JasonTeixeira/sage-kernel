import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateLighthouse,
  evaluateConsole,
  evaluateSmoke,
  runtimeVerdict,
  detectRuntimeCapability,
  runtimeGateForTarget,
  DEFAULT_THRESHOLDS
} from "../packages/runtime/gate.mjs";

const goodLighthouse = { categories: { performance: { score: 0.95 }, accessibility: { score: 0.98 }, "best-practices": { score: 0.93 }, seo: { score: 0.92 } } };

test("lighthouse evaluation passes above thresholds and fails below", () => {
  assert.equal(evaluateLighthouse(goodLighthouse).status, "passed");
  const bad = { categories: { ...goodLighthouse.categories, performance: { score: 0.4 } } };
  const r = evaluateLighthouse(bad);
  assert.equal(r.status, "failed");
  assert.ok(r.checks.find((c) => c.category === "performance").status === "failed");
});

test("lighthouse evaluation flags missing categories", () => {
  const r = evaluateLighthouse({ categories: {} });
  assert.equal(r.status, "failed");
  assert.ok(r.checks.every((c) => c.status === "missing"));
});

test("console evaluation fails on any error-level message", () => {
  assert.equal(evaluateConsole([{ type: "log" }, { type: "warning" }]).status, "passed");
  assert.equal(evaluateConsole([{ type: "error", text: "boom" }]).status, "failed");
  assert.equal(evaluateConsole([{ level: "error" }]).errorCount, 1);
});

test("smoke evaluation requires at least one flow and all passing", () => {
  assert.equal(evaluateSmoke([{ name: "login", status: "passed" }]).status, "passed");
  assert.equal(evaluateSmoke([{ name: "login", status: "failed" }]).status, "failed");
  assert.equal(evaluateSmoke([]).status, "empty");
});

test("runtimeVerdict combines all three signals (production-grade = all green)", () => {
  const pass = runtimeVerdict({ lighthouse: goodLighthouse, console: [{ type: "log" }], smoke: [{ name: "home", status: "passed" }] });
  assert.equal(pass.status, "passed");
  const failConsole = runtimeVerdict({ lighthouse: goodLighthouse, console: [{ type: "error" }], smoke: [{ name: "home", status: "passed" }] });
  assert.equal(failConsole.status, "failed");
  const failEmptySmoke = runtimeVerdict({ lighthouse: goodLighthouse, console: [], smoke: [] });
  assert.equal(failEmptySmoke.status, "failed");
});

test("capability detection requires Playwright + a runnable server script", () => {
  assert.equal(detectRuntimeCapability("/nonexistent-xyz").available, false);
});

test("gate honestly reports blocked_not_available when no toolchain (no fake pass)", async () => {
  const r = await runtimeGateForTarget({ capability: { available: false, reasons: ["no Playwright dependency"] } });
  assert.equal(r.status, "blocked_not_available");
  assert.match(r.reason, /Playwright/);
});

test("gate runs live and passes when a capture function supplies green evidence", async () => {
  const capture = async () => ({ lighthouse: goodLighthouse, console: [{ type: "log" }], smoke: [{ name: "home", status: "passed" }] });
  const r = await runtimeGateForTarget({ capability: { available: true }, capture });
  assert.equal(r.status, "passed");
});

test("gate runs live and fails on a real runtime regression", async () => {
  const capture = async () => ({ lighthouse: goodLighthouse, console: [{ type: "error", text: "Uncaught" }], smoke: [{ name: "home", status: "passed" }] });
  const r = await runtimeGateForTarget({ capability: { available: true }, capture });
  assert.equal(r.status, "failed");
});

test("default thresholds are production-sensible (>= 0.9)", () => {
  for (const v of Object.values(DEFAULT_THRESHOLDS)) assert.ok(v >= 0.9);
});
