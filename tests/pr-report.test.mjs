import test from "node:test";
import assert from "node:assert/strict";
import { buildPrReport, evaluatePrGate } from "../scripts/pr-report.mjs";

test("buildPrReport renders score, delta, security, and gaps", () => {
  const md = buildPrReport({ score: 87, baselineScore: 84, profile: "mobile-app", sast: { high: 0, medium: 3 }, gaps: ["missing idempotency"] });
  assert.match(md, /Sage Kernel Review/);
  assert.match(md, /mobile-app/);
  assert.match(md, /87\/100/);
  assert.match(md, /\+3 vs base/);
  assert.match(md, /0 high · 3 medium/);
  assert.match(md, /missing idempotency/);
  assert.match(md, /✅ passed/);
});

test("the gate fails on a high-severity security finding", () => {
  const verdict = evaluatePrGate({ score: 90, sast: { high: 1 } });
  assert.equal(verdict.status, "failed");
  assert.match(verdict.reasons.join(" "), /high-severity/);
});

test("the gate fails on a score regression beyond the allowed drop", () => {
  assert.equal(evaluatePrGate({ score: 80, baselineScore: 84 }).status, "failed");
  assert.equal(evaluatePrGate({ score: 84, baselineScore: 84 }).status, "passed");
  assert.equal(evaluatePrGate({ score: 83, baselineScore: 84, allowedDrop: 2 }).status, "passed");
});

test("a clean run with no baseline and no highs passes", () => {
  const verdict = evaluatePrGate({ score: 100, sast: { high: 0 } });
  assert.equal(verdict.status, "passed");
  assert.deepEqual(verdict.reasons, []);
});
