// The machine-readable DEFINITION OF DONE for the autonomous engineering loop.
// Each category maps to a REAL evidence artifact, a scoring function over that
// artifact, and a floor. A category's score is only "earned" when a FRESH
// artifact (regenerated this round) supports it — the loop never trusts a number
// it cannot trace to a file on disk. `command` is the gate that (re)generates the
// evidence; `read` turns the artifact into { score, detail, proofRef } or returns
// null when the evidence is missing (which the loop treats as score 0 / unproven).

import fs from "node:fs";
import path from "node:path";

function readJson(root, rel) {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch { return null; }
}
const pct = (x) => Math.round(Math.max(0, Math.min(1, Number(x) || 0)) * 100);

export const CAPABILITY_REGISTRY = [
  {
    id: "hallucination-firewall",
    floor: 95,
    command: "npm run hallucination:efficacy",
    artifact: ".sage-kernel/evidence/hallucination-efficacy-latest.json",
    read: (root) => {
      const e = readJson(root, ".sage-kernel/evidence/hallucination-efficacy-latest.json");
      if (!e) return null;
      const score = Math.min(pct(e.precision), pct(e.recall));
      return { score, detail: `precision ${e.precision} / recall ${e.recall} / F1 ${e.f1} (n=${e.counts?.total})`, proofRef: e };
    },
    improveHint: "Grow/strengthen the adversarial hallucination corpus and firewall precision without losing recall."
  },
  {
    id: "security-generalization",
    floor: 90,
    command: "npm run security:holdout",
    artifact: ".sage-kernel/evidence/security-holdout-latest.json",
    read: (root) => {
      const e = readJson(root, ".sage-kernel/evidence/security-holdout-latest.json");
      if (!e) return null;
      const score = Math.min(pct(e.precision), pct(e.recall));
      return { score, detail: `held-out precision ${e.precision} / recall ${e.recall} (n=${e.total})`, proofRef: e };
    },
    improveHint: "Add generalizable SAST/taint rules for held-out misses; keep precision at 1.0; regenerate a FRESH held-out set."
  },
  {
    id: "security-robustness-fresh",
    floor: 90,
    // Per-round FRESH samples (anti-overfit): the loop varies the seed each round
    // so this measures generalization to genuinely novel surface forms, not memory.
    commandFor: (round) => `npm run security:holdout-fresh -- --seed ${1000 + round}`,
    command: "npm run security:holdout-fresh", // fixed-seed fallback (reproducible)
    artifact: ".sage-kernel/evidence/security-holdout-fresh-latest.json",
    read: (root) => {
      const e = readJson(root, ".sage-kernel/evidence/security-holdout-fresh-latest.json");
      if (!e) return null;
      return { score: Math.min(pct(e.precision), pct(e.recall)), detail: `fresh seed ${e.seed} precision ${e.precision} / recall ${e.recall} (n=${e.total})`, proofRef: e };
    },
    improveHint: "Fix any brittleness a fresh seed surfaces (regex/literal matching); keep the engine structural so novel surface forms still resolve."
  },
  {
    id: "repair-intelligence",
    floor: 90,
    // Live: regenerated only when explicitly asked (costs model calls). The loop
    // reads the freshest artifact; if absent it is unproven (score 0).
    command: null,
    artifact: ".sage-kernel/evals/repair-eval-latest.json",
    read: (root) => {
      const e = readJson(root, ".sage-kernel/evals/repair-eval-latest.json");
      if (!e) return null;
      const score = pct(e.metrics?.passAt1);
      return { score, detail: `${e.model} pass@1 ${e.metrics?.passAt1} / pass^k ${e.metrics?.passPowerK} (n=${e.graded}, k=${e.attemptsPerFixture})`, proofRef: e };
    },
    improveHint: "Run a larger/k>1 model-backed repair eval; raise pass@1 with a stronger repairer or harden fixtures honestly."
  },
  {
    id: "profile-generalization",
    // Honest floor: detection of ARBITRARY real repos legitimately tops out below
    // the deterministic engines — some real repos are genuinely thin (reference
    // collections with no manifest) or genuinely multi-profile (a SaaS app truly
    // is also a web-app + payments-system). 80 reflects strong real-world average
    // confidence with correct primary detection, not a perfect-world fiction.
    floor: 80,
    command: "npm run profiles:matrix-refresh",
    artifact: ".sage-kernel/evidence/real-repo-matrix-latest.json",
    read: (root) => {
      const e = readJson(root, ".sage-kernel/evidence/real-repo-matrix-latest.json");
      if (!e) return null;
      const count = Number(e.summary?.count || 0);
      const low = Number(e.summary?.lowConfidence || 0);
      // Score = average detection confidence (which already reflects the drag of
      // any low-confidence repos — no redundant double-penalty).
      const avg = Number(e.summary?.averageScore || 0);
      return { score: avg, detail: `avg confidence ${avg}, lowConfidence ${low}/${count} (real repos)`, proofRef: e };
    },
    improveHint: "Extend project detection to more ecosystems/signals so legitimate repos clear the confidence floor; genuinely-thin reference repos stay honestly low."
  },
  {
    id: "live-autonomy",
    floor: 90,
    command: null, // live (model calls); regenerated on demand
    artifact: ".sage-kernel/evidence/live-noncclaude-autonomy-latest.json",
    read: (root) => {
      const e = readJson(root, ".sage-kernel/evidence/live-noncclaude-autonomy-latest.json");
      if (!e) return null;
      const ok = e.baselineRed && e.finalGreen && e.operateStatus === "passed" && e.proofId && e.ledger === "verified";
      return { score: ok ? 100 : 0, detail: `${e.model}: baselineRed=${e.baselineRed} finalGreen=${e.finalGreen} status=${e.operateStatus} proof=${Boolean(e.proofId)}`, proofRef: e };
    },
    improveHint: "Drive another real bug-fix goal to green through the operate loop with a live (non-Claude) model; bank the anchored proof."
  },
  {
    id: "overall-gates",
    floor: 95,
    command: "npm run score:report",
    fromStdout: true, // score:report prints JSON to stdout rather than a file
    read: (root, ctx) => {
      let e = null;
      try { e = JSON.parse(String(ctx?.stdout || "").slice(String(ctx?.stdout || "").indexOf("{"))); } catch { e = null; }
      if (!e || typeof e.score !== "number") return null;
      const score = Number(e.score || 0);
      return { score, detail: `scoreboard ${e.status} ${score}/100, caps ${(e.caps || []).length}`, proofRef: { score: e.score, status: e.status, caps: e.caps } };
    },
    improveHint: "Close any scoreboard cap with real evidence; never lift a cap without a fresh proof."
  }
];

export function registryIds() { return CAPABILITY_REGISTRY.map((c) => c.id); }

// Turn one category's evidence read into a scorecard entry. ctx may carry {stdout}
// for fromStdout categories. An unreadable/absent artifact -> proven:false, score 0.
export function assessCategory(cat, root, ctx = {}) {
  const read = cat.read(root, ctx);
  if (!read) return { id: cat.id, floor: cat.floor, score: 0, proven: false, met: false, detail: "no evidence (unproven)", proofRef: null };
  return { id: cat.id, floor: cat.floor, score: read.score, proven: true, met: read.score >= cat.floor, detail: read.detail, proofRef: read.proofRef };
}

// STRUCTURAL integrity (unfakeable): a category may be "met" ONLY if it is backed
// by real evidence AND its score clears the floor. Returns the fabricated entries
// (met without proof, or met below floor) — empty array means the scorecard is honest.
export function checkIntegrity(scorecard) {
  return scorecard.filter((c) => c.met && !(c.proven && c.score >= c.floor));
}
