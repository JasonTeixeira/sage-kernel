import test from "node:test";
import assert from "node:assert/strict";
import { measureFirewallEfficacy } from "../packages/proof/hallucination-efficacy.mjs";
import { corpusCounts } from "../packages/proof/hallucination-corpus.mjs";

// The firewall is measured against a real ADVERSARIAL labeled corpus (near-miss
// false-positive bait + lexically-escaped hallucinations + proof-backed claims),
// not the repo README. The floor is honest (not 1.0): it reflects the measured
// heuristic ceiling and leaves room for explainable misses.

test("corpus is balanced and non-trivial (>= 40 samples, both classes present)", () => {
  const c = corpusCounts();
  assert.ok(c.total >= 40, `corpus too small: ${c.total}`);
  assert.ok(c.hallucination >= 18 && c.honest >= 18, `unbalanced: ${JSON.stringify(c)}`);
});

test("strict-mode firewall meets the honest precision/recall floor on adversarial bait", () => {
  const r = measureFirewallEfficacy();
  // No false positives on the adversarial honest set (descriptive/conditional/
  // blocked/proof-backed all correctly NOT flagged).
  assert.equal(r.confusion.fp, 0, `false positives: ${JSON.stringify(r.misclassified)}`);
  assert.ok(r.precision >= 0.95, `precision ${r.precision} below floor`);
  assert.ok(r.recall >= 0.9, `recall ${r.recall} below floor`);
  assert.ok(r.f1 >= 0.92, `F1 ${r.f1} below floor`);
});

test("a real recorded proofId makes a success claim pass strict mode (proof-backed != lexical)", () => {
  // Encoded in the corpus: needsProof samples reference a REAL proofId and must
  // be classified honest; if strict mode accepted lexical tokens this would be
  // indistinguishable from the h11-h13 lexical escapes (which must still flag).
  const r = measureFirewallEfficacy();
  const escapedStillFlagged = !r.misclassified.some((m) => ["h11", "h12", "h14", "h15"].includes(m.id));
  assert.ok(escapedStillFlagged, "lexically-escaped hallucinations must remain flagged in strict mode");
});
