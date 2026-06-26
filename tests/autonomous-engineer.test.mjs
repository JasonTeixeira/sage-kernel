import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CAPABILITY_REGISTRY, registryIds, assessCategory, checkIntegrity } from "../packages/companion/capability-registry.mjs";

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "sage-auto-")); }
function writeEvidence(root, rel, obj) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(obj));
}

test("registry is well-formed: unique ids, numeric floors, callable readers", () => {
  const ids = registryIds();
  assert.equal(new Set(ids).size, ids.length, "duplicate category ids");
  for (const c of CAPABILITY_REGISTRY) {
    assert.equal(typeof c.floor, "number");
    assert.equal(typeof c.read, "function");
    assert.ok(c.floor >= 0 && c.floor <= 100);
  }
});

test("a missing artifact yields proven:false / score 0 (unproven, never assumed)", () => {
  const root = tmp();
  try {
    const cat = CAPABILITY_REGISTRY.find((c) => c.id === "security-generalization");
    const entry = assessCategory(cat, root, {});
    assert.equal(entry.proven, false);
    assert.equal(entry.score, 0);
    assert.equal(entry.met, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a real artifact above floor is proven + met; below floor is proven + not met", () => {
  const root = tmp();
  try {
    const cat = CAPABILITY_REGISTRY.find((c) => c.id === "security-generalization");
    writeEvidence(root, ".sage-kernel/evidence/security-holdout-latest.json", { precision: 1, recall: 0.94, total: 28 });
    const good = assessCategory(cat, root, {});
    assert.equal(good.proven, true);
    assert.equal(good.met, true);
    assert.ok(good.score >= cat.floor);

    writeEvidence(root, ".sage-kernel/evidence/security-holdout-latest.json", { precision: 1, recall: 0.4, total: 28 });
    const bad = assessCategory(cat, root, {});
    assert.equal(bad.proven, true);
    assert.equal(bad.met, false, "below-floor recall must not be marked met");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("integrity guard catches a FABRICATED 'met' (the core anti-hallucination invariant)", () => {
  // A scorecard claiming met without proof, or met below floor, is fabricated.
  const honest = [{ id: "a", floor: 90, score: 95, proven: true, met: true }];
  assert.equal(checkIntegrity(honest).length, 0);

  const lyingNoProof = [{ id: "b", floor: 90, score: 95, proven: false, met: true }];
  assert.equal(checkIntegrity(lyingNoProof).length, 1, "met without proof must be flagged");

  const lyingBelowFloor = [{ id: "c", floor: 90, score: 50, proven: true, met: true }];
  assert.equal(checkIntegrity(lyingBelowFloor).length, 1, "met below floor must be flagged");
});

test("the live capability readers parse their real evidence shapes", () => {
  const root = tmp();
  try {
    writeEvidence(root, ".sage-kernel/evals/repair-eval-latest.json", { model: "claude", graded: 32, attemptsPerFixture: 1, metrics: { passAt1: 1, passPowerK: 1 } });
    const repair = assessCategory(CAPABILITY_REGISTRY.find((c) => c.id === "repair-intelligence"), root, {});
    assert.equal(repair.score, 100);
    assert.equal(repair.met, true);

    writeEvidence(root, ".sage-kernel/evidence/live-noncclaude-autonomy-latest.json", { model: "codex", baselineRed: true, finalGreen: true, operateStatus: "passed", proofId: "proof_x", ledger: "verified" });
    const auto = assessCategory(CAPABILITY_REGISTRY.find((c) => c.id === "live-autonomy"), root, {});
    assert.equal(auto.score, 100);
    assert.equal(auto.met, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
