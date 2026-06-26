import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { runModelRubric, isModelGraderConfigured } from "../packages/evals/model-rubric.mjs";
import { groundClaims, groundClaimsAgainstRepo, repoFiles } from "../packages/evals/grounding.mjs";

const root = path.resolve(import.meta.dirname, "..");

const grader = (pattern) => {
  let i = 0;
  return async () => ({ passed: pattern[i++ % pattern.length], hallucinated: false });
};

// --- model-backed pass@k ---

test("model rubric is blocked_not_implemented without a grader", async () => {
  const r = await runModelRubric({ task: { id: "t" }, samples: 3 });
  assert.equal(r.status, "blocked_not_implemented");
  assert.equal(isModelGraderConfigured({}), false);
});

test("pass@1/pass@k/pass^k reflect real (stochastic) sample outcomes", async () => {
  const allPass = await runModelRubric({ task: {}, samples: 3, grader: grader([true, true, true]) });
  assert.deepEqual([allPass.passAt1, allPass.passAtK, allPass.passPowerK], [1, 1, 1]);

  const mixed = await runModelRubric({ task: {}, samples: 3, grader: grader([true, false, false]) });
  assert.deepEqual([mixed.passAt1, mixed.passAtK, mixed.passPowerK], [1, 1, 0]);

  const allFail = await runModelRubric({ task: {}, samples: 3, grader: grader([false, false, false]) });
  assert.deepEqual([allFail.passAt1, allFail.passAtK, allFail.passPowerK], [0, 0, 0]);
});

test("hallucination rate is measured per sample", async () => {
  let i = 0;
  const r = await runModelRubric({ task: {}, samples: 4, grader: async () => ({ passed: true, hallucinated: i++ < 1 }) });
  assert.equal(r.hallucinationRate, 0.25);
});

// --- factual grounding ---

test("groundClaims flags references to files that do not exist", () => {
  const result = groundClaims("I edited packages/real.mjs and packages/ghost.mjs", { files: ["packages/real.mjs"] });
  assert.equal(result.status, "ungrounded");
  assert.deepEqual(result.ungrounded, ["packages/ghost.mjs"]);
});

test("groundClaims passes when all referenced files exist", () => {
  const result = groundClaims("touched a.mjs and b.mjs", { files: ["a.mjs", "b.mjs"] });
  assert.equal(result.status, "grounded");
});

test("groundClaimsAgainstRepo grounds real repo files and flags invented ones", () => {
  const facts = repoFiles(root);
  assert.ok(facts.has("packages/proof/ledger.mjs"));
  const result = groundClaimsAgainstRepo("changed packages/proof/ledger.mjs and packages/proof/does-not-exist.mjs", root);
  assert.ok(result.ungrounded.includes("packages/proof/does-not-exist.mjs"));
  assert.ok(!result.ungrounded.includes("packages/proof/ledger.mjs"));
});
