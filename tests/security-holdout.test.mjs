import test from "node:test";
import assert from "node:assert/strict";
import { scoreSecurityCorpus } from "../packages/security/corpus.mjs";
import { HOLDOUT_CORPUS } from "../packages/security/holdout-corpus.mjs";

// Generalization, not memorization: the held-out corpus is distinct from the
// authored one. The floor is honest (recall >= 0.85, not 1.0) and we assert NO
// false positives — precision is the property that must not degrade.

test("held-out corpus is non-trivial and distinct (>= 24 samples, both classes)", () => {
  assert.ok(HOLDOUT_CORPUS.length >= 24, `held-out too small: ${HOLDOUT_CORPUS.length}`);
  assert.ok(HOLDOUT_CORPUS.some((s) => s.vulnerable) && HOLDOUT_CORPUS.some((s) => !s.vulnerable));
});

test("engine GENERALIZES to unseen real-world variants (precision 1.0, recall >= 0.85)", () => {
  const r = scoreSecurityCorpus({ corpus: HOLDOUT_CORPUS });
  assert.equal(r.fp, 0, `false positives on held-out: ${r.misses.filter((m) => m.kind === "false_positive").map((m) => m.id).join(", ")}`);
  assert.ok(r.precision >= 0.95, `precision ${r.precision}`);
  assert.ok(r.recall >= 0.85, `recall ${r.recall} below honest generalization floor`);
  // The remaining miss is a documented, genuinely-ambiguous case (a variable
  // passed to setTimeout, indistinguishable from a function at parse time).
  const fns = r.misses.filter((m) => m.kind === "false_negative").map((m) => m.id);
  assert.ok(fns.every((id) => id === "ho-js-settimeout-string"), `unexpected new misses: ${fns.join(", ")}`);
});
