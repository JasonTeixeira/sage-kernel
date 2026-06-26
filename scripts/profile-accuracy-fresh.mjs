#!/usr/bin/env node
// Score profile-detection ACCURACY against a fresh ground-truth synthetic corpus
// and write evidence. Fixed seed in release:check (reproducible); per-round seed in
// the autonomous loop (anti-overfit). This is real correctness, not confidence.
import fs from "node:fs";
import path from "node:path";
import { scoreProfileAccuracy } from "../packages/profiles/profile-accuracy.mjs";

const args = process.argv.slice(2);
const seedIdx = args.indexOf("--seed");
const seed = seedIdx >= 0 ? Number(args[seedIdx + 1]) : 1;

const result = scoreProfileAccuracy(seed);
const payload = { type: "profile-accuracy", ...result, generatedAt: new Date().toISOString() };
const dir = path.join(process.cwd(), ".sage-kernel/evidence");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "profile-accuracy-latest.json"), `${JSON.stringify(payload, null, 2)}\n`);

console.error(`profile accuracy (seed ${seed}, n=${result.total}): ${result.accuracy} (near ${result.nearAccuracy})`);
if (result.misses.length) console.error(`misses: ${result.misses.map((m) => `${m.key}->${m.got}`).join(", ")}`);

// Honest floor: clear-cut project types must classify correctly. 0.9 leaves room
// for one genuinely-borderline template without masking a real regression.
process.exit(result.accuracy >= 0.9 ? 0 : 1);
