import test from "node:test";
import assert from "node:assert/strict";
import { scoreProfileAccuracy } from "../packages/profiles/profile-accuracy.mjs";
import { generateRepoSpecs, templateCount } from "../packages/profiles/synthetic-repo-generator.mjs";

// Ground-truth accuracy (not confidence): synthetic repos with a known-correct
// profile by construction. Fresh seed each round; clear-cut types must classify.

test("generator produces ground-truth specs, deterministic per seed, novel across seeds", () => {
  const a1 = generateRepoSpecs(5);
  const a2 = generateRepoSpecs(5);
  const b = generateRepoSpecs(6);
  assert.equal(a1.length, templateCount());
  assert.deepEqual(a1.map((s) => s.files["package.json"]), a2.map((s) => s.files["package.json"]), "same seed reproduces");
  const differs = a1.some((s, i) => JSON.stringify(s.files) !== JSON.stringify(b[i]?.files));
  assert.ok(differs, "different seed must vary the surface");
  for (const s of a1) assert.ok(Array.isArray(s.accept) && s.accept.length >= 1, "each spec declares acceptable profiles");
});

test("detection accuracy meets the floor on clear-cut synthetic repos (real correctness)", () => {
  for (const seed of [1, 9, 77, 314]) {
    const r = scoreProfileAccuracy(seed);
    assert.ok(r.accuracy >= 0.9, `seed ${seed} accuracy ${r.accuracy} below floor — misses: ${JSON.stringify(r.misses)}`);
  }
});
