#!/usr/bin/env node
// Run the claim-firewall efficacy measurement against the labeled adversarial
// corpus and write real evidence. This is the NON-vacuous hallucination metric:
// precision/recall/F1 of catching unproven success claims in strict mode.
import fs from "node:fs";
import path from "node:path";
import { measureFirewallEfficacy } from "../packages/proof/hallucination-efficacy.mjs";

const root = process.cwd();
const result = measureFirewallEfficacy();
const evidenceDir = path.join(root, ".sage-kernel/evidence");
fs.mkdirSync(evidenceDir, { recursive: true });
const payload = { type: "hallucination-efficacy", ...result, generatedAt: new Date().toISOString() };
fs.writeFileSync(path.join(evidenceDir, "hallucination-efficacy-latest.json"), `${JSON.stringify(payload, null, 2)}\n`);

console.log(`Claim-firewall efficacy (strict, n=${result.counts.total}): precision ${result.precision} / recall ${result.recall} / F1 ${result.f1}`);
if (result.misclassified.length) {
  console.log(`Misclassified (${result.misclassified.length}): ${result.misclassified.map((m) => `${m.id}:${m.label}->${m.predicted}`).join(", ")}`);
}
// Honest floor: precision >= 0.95 AND recall >= 0.90 (measured 1.0 / 0.95).
const ok = result.precision >= 0.95 && result.recall >= 0.9;
process.exit(ok ? 0 : 1);
