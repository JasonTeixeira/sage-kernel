import test from "node:test";
import assert from "node:assert/strict";
import { SECURITY_CORPUS, scoreSecurityCorpus } from "../packages/security/corpus.mjs";

test("the corpus is labeled with both vulnerable and safe samples (so FPs are measurable)", () => {
  assert.ok(SECURITY_CORPUS.length >= 20);
  assert.ok(SECURITY_CORPUS.some((s) => s.vulnerable));
  assert.ok(SECURITY_CORPUS.some((s) => !s.vulnerable));
  // covers all three languages
  for (const lang of ["js", "py", "swift"]) assert.ok(SECURITY_CORPUS.some((s) => s.lang === lang));
});

test("security engines hit the (ratcheted) measured precision/recall floor on the labeled corpus", () => {
  const r = scoreSecurityCorpus();
  assert.ok(r.total >= 70, `corpus should have grown (got ${r.total})`);
  assert.ok(r.precision >= 0.95, `precision ${r.precision} < 0.95 (false positives: ${JSON.stringify(r.misses.filter((m) => m.kind === "false_positive"))})`);
  assert.ok(r.recall >= 0.92, `recall ${r.recall} < 0.92 (false negatives: ${JSON.stringify(r.misses.filter((m) => m.kind === "false_negative"))})`);
});

test("a deliberately-missed vulnerability shows up as a false negative (the metric is real, not rigged)", () => {
  // An unknown sink the engines do not model must be counted FN, not silently TP.
  const r = scoreSecurityCorpus({ corpus: [{ id: "unknown-sink", lang: "js", vulnerable: true, code: "export function h(req){ customDangerousSink(req.body.x); }" }] });
  assert.equal(r.fn, 1);
  assert.equal(r.recall, 0);
});
