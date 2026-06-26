#!/usr/bin/env node
// Generate a FRESH held-out security set from a seed, score the engine on it, and
// write evidence. Used two ways: (a) release:check / tests with a FIXED seed for
// reproducibility; (b) the autonomous loop with a per-round seed so generalization
// is re-proven on genuinely novel samples each round (anti-overfit). Records the
// seed so any result is reproducible.
//
//   node scripts/security-holdout-fresh.mjs --seed 1337 [--rounds 2]
import fs from "node:fs";
import path from "node:path";
import { scoreSecurityCorpus } from "../packages/security/corpus.mjs";
import { generateHoldout, familyCount } from "../packages/security/holdout-generator.mjs";

const args = process.argv.slice(2);
const num = (f, d) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : d; };
const seed = num("--seed", 1337);
const rounds = num("--rounds", 2);

const corpus = generateHoldout(seed, rounds);
const result = scoreSecurityCorpus({ corpus });
const payload = { type: "security-holdout-fresh", seed, families: familyCount(), total: result.total, precision: result.precision, recall: result.recall, f1: result.f1, fp: result.fp, fn: result.fn, misses: result.misses, generatedAt: new Date().toISOString() };

const dir = path.join(process.cwd(), ".sage-kernel/evidence");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "security-holdout-fresh-latest.json"), `${JSON.stringify(payload, null, 2)}\n`);

console.error(`fresh held-out (seed ${seed}, n=${result.total}): precision ${result.precision} / recall ${result.recall} / F1 ${result.f1}`);
if (result.misses.length) console.error(`misses: ${result.misses.map((m) => `${m.id}:${m.kind}`).join(", ")}`);

// Honest floor: novel surface variation of known classes should not break the
// engine — precision >= 0.95 AND recall >= 0.9. A drop means brittleness crept in.
const ok = result.precision >= 0.95 && result.recall >= 0.9;
process.exit(ok ? 0 : 1);
