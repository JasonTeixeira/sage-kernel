#!/usr/bin/env node
// Generalization gate: score the security engines against the HELD-OUT corpus
// (samples the rules were not authored against) and write honest evidence. A high
// score on the authored corpus only proves self-consistency; this proves the
// engine catches real-world variants it has not seen.
import fs from "node:fs";
import path from "node:path";
import { scoreSecurityCorpus } from "../packages/security/corpus.mjs";
import { HOLDOUT_CORPUS } from "../packages/security/holdout-corpus.mjs";

const result = scoreSecurityCorpus({ corpus: HOLDOUT_CORPUS });
const evidenceDir = path.join(process.cwd(), ".sage-kernel/evidence");
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(
  path.join(evidenceDir, "security-holdout-latest.json"),
  `${JSON.stringify({ type: "security-holdout", ...result, generatedAt: new Date().toISOString() }, null, 2)}\n`
);

console.log(`Security HELD-OUT (n=${result.total}): precision ${result.precision} / recall ${result.recall} / F1 ${result.f1}`);
if (result.misses.length) console.log(`Residual (honest) misses: ${result.misses.map((m) => `${m.id}:${m.kind}`).join(", ")}`);

// Honest floor (measured precision 1.0 / recall 0.94). Generalization, so the
// floor is below the authored-corpus 1.0 and tolerates documented misses.
const ok = result.precision >= 0.95 && result.recall >= 0.85;
process.exit(ok ? 0 : 1);
