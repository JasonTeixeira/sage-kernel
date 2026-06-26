import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recordOutcome, outcomeStats, recommendLoop } from "../packages/learning/outcomes.mjs";
import { tokenize, vectorize, cosineSimilarity, recordFix, recallFix } from "../packages/learning/knowledge.mjs";
import { selectLoop } from "../packages/loops/selector.mjs";

function tempProject(name = "learn-fixture") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-jlearn-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name }));
  return root;
}

// --- outcome learning ---

test("outcomeStats aggregates pass rate per loop for the repo", () => {
  const root = tempProject();
  recordOutcome({ loop: "refactor-clean", status: "passed" }, { root });
  recordOutcome({ loop: "refactor-clean", status: "passed" }, { root });
  recordOutcome({ loop: "refactor-clean", status: "needs_work" }, { root });
  const stats = outcomeStats({ root });
  const rc = stats.find((s) => s.loop === "refactor-clean");
  assert.equal(rc.runs, 3);
  assert.equal(rc.passes, 2);
  assert.ok(Math.abs(rc.passRate - 0.6667) < 0.01);
});

test("recommendLoop needs sufficient data and a strong pass rate", () => {
  const root = tempProject();
  recordOutcome({ loop: "feature", status: "passed" }, { root });
  recordOutcome({ loop: "feature", status: "passed" }, { root });
  assert.equal(recommendLoop({ root }), null); // < minRuns (3)
  recordOutcome({ loop: "feature", status: "passed" }, { root });
  const rec = recommendLoop({ root });
  assert.equal(rec.loop, "feature");
  assert.equal(rec.source, "outcome-learned");
});

test("selectLoop prefers an outcome-learned loop over the goal classifier", () => {
  const root = tempProject();
  for (let i = 0; i < 3; i += 1) recordOutcome({ loop: "refactor-clean", status: "passed" }, { root });
  // Goal would classify to "bugfix", but learned outcomes win.
  const choice = selectLoop({ root, goal: "fix the bug" });
  assert.equal(choice.loop, "refactor-clean");
  assert.equal(choice.source, "outcome-learned");
  // Disabling outcomes falls back to the classifier.
  assert.equal(selectLoop({ root, goal: "fix the bug", useOutcomes: false }).source, "classified");
});

// --- knowledge base (vector recall) ---

test("vectorize + cosineSimilarity behave (identical=1, disjoint=0)", () => {
  assert.deepEqual(tokenize("Cannot find module x.mjs"), ["cannot", "find", "module", "mjs"]);
  const a = vectorize("assertion failed in ledger record hash");
  assert.equal(cosineSimilarity(a, a), 1);
  assert.equal(cosineSimilarity(a, vectorize("totally unrelated network timeout")), 0);
});

test("recordFix + recallFix retrieves a similar past fix above threshold", () => {
  const root = tempProject();
  recordFix({ signature: { category: "assertion", message: "recordHash mismatch", primaryLocation: { file: "packages/proof/ledger.mjs" } }, fix: "recompute recordHash after edits" }, { root });
  const hit = recallFix({ category: "assertion", message: "recordHash mismatch detected", primaryLocation: { file: "packages/proof/ledger.mjs" } }, { root });
  assert.ok(hit);
  assert.match(hit.fix, /recompute recordHash/);
  assert.ok(hit.score >= 0.5);
  // A clearly different failure recalls nothing.
  assert.equal(recallFix({ category: "network", message: "ECONNREFUSED on port 9999" }, { root }), null);
});
