import test from "node:test";
import assert from "node:assert/strict";
import { generateHoldout, familyCount } from "../packages/security/holdout-generator.mjs";
import { scoreSecurityCorpus } from "../packages/security/corpus.mjs";

test("generator is deterministic per seed and NOVEL across seeds (anti-overfit)", () => {
  const a1 = generateHoldout(7, 2);
  const a2 = generateHoldout(7, 2);
  const b = generateHoldout(8, 2);
  assert.deepEqual(a1.map((s) => s.code), a2.map((s) => s.code), "same seed must reproduce identical samples");
  const overlap = a1.filter((s, i) => s.code === b[i]?.code).length;
  assert.ok(overlap < a1.length, "a different seed must produce different code (novelty)");
  assert.equal(a1.length, familyCount() * 2 * 2, "n = families * (vuln+safe) * rounds");
});

test("every generated sample carries a correct construction label", () => {
  const samples = generateHoldout(123, 2);
  assert.ok(samples.some((s) => s.vulnerable) && samples.some((s) => !s.vulnerable));
  for (const s of samples) {
    assert.equal(typeof s.vulnerable, "boolean");
    assert.ok(["js", "py", "swift"].includes(s.lang));
    assert.ok(s.code.length > 0);
  }
});

test("engine generalizes to fresh samples across many seeds (precision/recall floor)", () => {
  // Robustness to surface variation of known classes: no brittleness, no FP drift.
  for (const seed of [1, 13, 77, 404, 2026, 31337]) {
    const r = scoreSecurityCorpus({ corpus: generateHoldout(seed, 2) });
    assert.ok(r.precision >= 0.95, `seed ${seed} precision ${r.precision} — false-positive drift`);
    assert.ok(r.recall >= 0.9, `seed ${seed} recall ${r.recall} — brittleness on surface variation`);
  }
});
