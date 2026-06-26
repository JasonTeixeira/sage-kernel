import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scoreCategory, CATEGORY_CRITERIA, createScoreCaps } from "../packages/score/scoreboard.mjs";

test("a FAILED eval suite caps the score even when its metrics clear thresholds (no fake-green)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-evalcap-"));
  fs.mkdirSync(path.join(root, ".sage-kernel/evals"), { recursive: true });
  const goodMetrics = { passAt1: 1, passAt3: 1, passPower3: 1 };
  const evalsPath = path.join(root, ".sage-kernel/evals/latest.json");
  try {
    fs.writeFileSync(evalsPath, JSON.stringify({ status: "failed", metrics: goodMetrics }));
    const cap = createScoreCaps({ root }).find((c) => c.id === "pass_k_evals_missing");
    assert.ok(cap, "a failed eval suite must add the pass_k cap");
    assert.match(cap.reason, /status is failed/);

    fs.writeFileSync(evalsPath, JSON.stringify({ status: "passed", metrics: goodMetrics }));
    assert.equal(createScoreCaps({ root }).some((c) => c.id === "pass_k_evals_missing"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Fully-positive evidence: every criterion across every category is met.
function fullEvidence() {
  return {
    doctor: { status: "passed", checks: [{ id: "dashboard", status: "passed" }, { id: "mcpManifest", status: "passed" }] },
    agentsDoctor: { status: "passed" },
    agentsEval: { status: "passed" },
    review: { report: { status: "passed", score: 95, categories: [{ id: "architecture", score: 90 }, { id: "clean_code", score: 90 }] } },
    release: { report: { status: "passed", score: 90, evidence: [{ ref: "mcp:smoke" }, { ref: "docs" }] } },
    security: { status: "passed", gates: [{ name: "secret-scan", status: "passed" }, { name: "dependency-audit", status: "passed" }] },
    testing: { status: "passed", executed: true, longSoak: { memoryGrowthReport: true }, performance: { status: "passed" } },
    memory: { status: "passed" },
    graph: { status: "passed", nodes: [{ id: "n1" }], edges: [] },
    drift: { status: "passed" }
  };
}

function emptyEvidence() {
  return {
    doctor: {},
    agentsDoctor: {},
    agentsEval: {},
    review: { report: {} },
    release: { report: {} },
    security: {},
    testing: {},
    memory: {},
    graph: {},
    drift: {}
  };
}

test("a category with no positive evidence scores 0 (not 100)", () => {
  const empty = emptyEvidence();
  for (const id of Object.keys(CATEGORY_CRITERIA)) {
    const result = scoreCategory({ id, weight: 1 }, empty);
    assert.equal(result.score, 0, `${id} should score 0 with no evidence, got ${result.score}`);
  }
});

test("a category reaches 100 only when all criteria are positively met", () => {
  const full = fullEvidence();
  for (const id of Object.keys(CATEGORY_CRITERIA)) {
    const result = scoreCategory({ id, weight: 1 }, full);
    assert.equal(result.score, 100, `${id} should score 100 with full evidence, got ${result.score}`);
  }
});

test("testing scores partial when the proof is plan-only (not executed)", () => {
  const planOnly = { ...fullEvidence(), testing: { status: "passed", executed: false, longSoak: { memoryGrowthReport: true }, performance: { status: "passed" } } };
  assert.equal(scoreCategory({ id: "testing", weight: 10 }, planOnly).score, 50);
  const executed = fullEvidence();
  assert.equal(scoreCategory({ id: "testing", weight: 10 }, executed).score, 100);
});

test("partial evidence yields a graded (not binary) score", () => {
  const partial = { ...fullEvidence(), doctor: { status: "passed", checks: [] } };
  // installability: doctor-passed met, doctor-ran unmet -> 50
  assert.equal(scoreCategory({ id: "installability", weight: 8 }, partial).score, 50);
});

test("unmet criteria are reported as blockers", () => {
  const result = scoreCategory({ id: "security", weight: 10 }, emptyEvidence());
  assert.ok(result.blockers.some((b) => /security-passed/.test(b)));
  assert.ok(result.blockers.some((b) => /real-detectors-ran/.test(b)));
});
