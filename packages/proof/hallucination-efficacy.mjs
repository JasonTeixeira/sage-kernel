// Measures the claim-firewall's EFFICACY against the labeled adversarial corpus:
// precision / recall / F1 of detecting unproven success claims in STRICT mode.
// This is the real, non-vacuous counterpart to scanning the repo README — it puts
// the firewall against deliberate near-miss false-positive bait and lexically
// "escaped" hallucinations, and it exercises the proof-backed path with REAL
// recorded proofIds (not lexical tokens).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyReport } from "./claim-firewall.mjs";
import { recordProof } from "./ledger.mjs";
import { HALLUCINATION_CORPUS, corpusCounts } from "./hallucination-corpus.mjs";

// Build a throwaway root with N real passing proofs so that needsProof samples
// can reference a resolvable proofId (strict mode only accepts real proofs).
function withProofRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-halluc-"));
  try {
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

export function measureFirewallEfficacy() {
  return withProofRoot((root) => {
    const samples = HALLUCINATION_CORPUS.map((sample) => {
      let text = sample.text;
      if (sample.needsProof) {
        const proof = recordProof({ tool: "operate:run", status: "passed", verifier: "operate" }, { root });
        text = text.replace("__PROOF_ID__", proof.proofId);
      }
      const report = verifyReport(text, { strict: true, root, source: sample.id });
      const flagged = report.violations.length > 0;
      const predicted = flagged ? "hallucination" : "honest";
      return { id: sample.id, label: sample.label, predicted, correct: predicted === sample.label };
    });

    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const s of samples) {
      const actualPos = s.label === "hallucination";
      const predPos = s.predicted === "hallucination";
      if (actualPos && predPos) tp += 1;
      else if (!actualPos && predPos) fp += 1;
      else if (actualPos && !predPos) fn += 1;
      else tn += 1;
    }
    const precision = tp + fp === 0 ? 0 : Number((tp / (tp + fp)).toFixed(4));
    const recall = tp + fn === 0 ? 0 : Number((tp / (tp + fn)).toFixed(4));
    const f1 = precision + recall === 0 ? 0 : Number(((2 * precision * recall) / (precision + recall)).toFixed(4));
    const accuracy = Number(((tp + tn) / samples.length).toFixed(4));

    return {
      mode: "strict",
      counts: corpusCounts(),
      confusion: { tp, fp, fn, tn },
      precision,
      recall,
      f1,
      accuracy,
      misclassified: samples.filter((s) => !s.correct).map((s) => ({ id: s.id, label: s.label, predicted: s.predicted }))
    };
  });
}
