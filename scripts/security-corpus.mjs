// Security corpus gate (P5). Gates the security engines on MEASURED precision/
// recall against a labeled vulnerable/safe corpus — the score is earned from real
// numbers, not asserted. Floor is conservative and meant to ratchet UP as the
// corpus grows toward an OWASP/Juliet-scale benchmark.
import fs from "node:fs";
import path from "node:path";
import { scoreSecurityCorpus } from "../packages/security/corpus.mjs";

const root = process.cwd();
// Ratcheted up as the corpus grew (27→77 samples, measured 1.0/1.0). Keep
// raising these toward 1.0 as the corpus expands toward OWASP/Juliet scale.
const MIN_PRECISION = 0.95;
const MIN_RECALL = 0.92;

const r = scoreSecurityCorpus();
const status = r.precision >= MIN_PRECISION && r.recall >= MIN_RECALL ? "passed" : "failed";

const report = {
  type: "security-corpus",
  status,
  samples: r.total,
  precision: r.precision,
  recall: r.recall,
  f1: r.f1,
  counts: { tp: r.tp, fp: r.fp, tn: r.tn, fn: r.fn },
  floor: { precision: MIN_PRECISION, recall: MIN_RECALL },
  misses: r.misses,
  note: `Curated ${r.total}-sample corpus (${r.tp + r.fn} vulnerable / ${r.tn + r.fp} safe across js/py/swift), including adversarial-safe cases that stress false positives. MEASURED, not asserted. Still smaller than the full OWASP Benchmark/Juliet — keep expanding + ratchet the floor up.`,
  generatedAt: new Date().toISOString()
};
const target = path.join(root, ".sage-kernel/evidence/security-corpus-latest.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({ status, samples: r.total, precision: r.precision, recall: r.recall, f1: r.f1, misses: r.misses }, null, 2));
process.exit(status === "passed" ? 0 : 1);
