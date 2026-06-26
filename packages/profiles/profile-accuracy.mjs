// Measure REAL profile-detection accuracy against the ground-truth synthetic
// corpus: materialize each generated repo in a temp dir, run detectProjectProfile,
// and check the detected PRIMARY profile is in the template's acceptable set.
// Accuracy = correct / total. Unlike confidence, this is correctness.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectProjectProfile } from "./project-detector.mjs";
import { generateRepoSpecs, templateCount } from "./synthetic-repo-generator.mjs";

function materialize(spec) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sage-synth-${spec.key}-`));
  for (const [file, content] of Object.entries(spec.files)) {
    const full = path.join(dir, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

export function scoreProfileAccuracy(seed = 1) {
  const specs = generateRepoSpecs(seed);
  const results = [];
  for (const spec of specs) {
    const dir = materialize(spec);
    try {
      const detected = detectProjectProfile({ root: dir, projectPath: "." });
      const primary = detected.profile?.id;
      const secondary = (detected.secondaryProfiles || []).map((p) => p.id);
      const correct = spec.accept.includes(primary);
      // "near" = the right answer was at least a secondary candidate.
      const near = correct || spec.accept.some((a) => secondary.includes(a));
      results.push({ id: spec.id, key: spec.key, expected: spec.accept, primary, correct, near, confidence: detected.confidence });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const correct = results.filter((r) => r.correct).length;
  const near = results.filter((r) => r.near).length;
  return {
    seed, total: results.length, templates: templateCount(),
    accuracy: Number((correct / results.length).toFixed(4)),
    nearAccuracy: Number((near / results.length).toFixed(4)),
    misses: results.filter((r) => !r.correct).map((r) => ({ key: r.key, expected: r.expected, got: r.primary })),
    results
  };
}
