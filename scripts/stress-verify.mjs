#!/usr/bin/env node
// Stress / stability verifier. Re-runs the deterministic capability measurements K
// times back-to-back and asserts the result is STABLE across all passes (same met
// set, scores within a small tolerance). A category whose verdict flips between
// passes is flagged as flaky — the opposite of a proven system. Deterministic only
// (no model calls), so it is cheap to run many times.
//
//   node scripts/stress-verify.mjs --passes 5
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CAPABILITY_REGISTRY } from "../packages/companion/capability-registry.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const passes = (() => { const i = args.indexOf("--passes"); return i >= 0 ? Number(args[i + 1]) : 5; })();
// Live categories are excluded from stress (model calls aren't free to repeat).
const DETERMINISTIC = CAPABILITY_REGISTRY.filter((c) => c.command || c.commandFor);

function run(cmd) { spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8", timeout: 1_200_000, maxBuffer: 1024 * 1024 * 64 }); }
function readJson(rel) { try { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch { return null; } }

const passesData = [];
for (let p = 1; p <= passes; p += 1) {
  const row = {};
  for (const cat of DETERMINISTIC) {
    if (cat.fromStdout) continue; // stdout-only categories aren't re-derivable from a file here
    // Fresh-seed categories get a DIFFERENT seed each pass, so stability here means
    // "stable verdict across genuinely novel inputs" — a stronger claim.
    run(cat.commandFor ? cat.commandFor(p * 31 + 7) : cat.command);
    const read = cat.read(root, {});
    row[cat.id] = read ? { score: read.score, met: read.score >= cat.floor } : { score: 0, met: false };
  }
  passesData.push(row);
  console.error(`stress pass ${p}/${passes}: ${Object.entries(row).map(([k, v]) => `${k}=${v.score}${v.met ? "" : "!"}`).join(" ")}`);
}

// Stability: for each category, the met verdict must be identical across all passes
// and the score spread must be within tolerance (5 points).
const TOL = 5;
const categories = Object.keys(passesData[0] || {});
const flaky = [];
for (const id of categories) {
  const scores = passesData.map((row) => row[id].score);
  const mets = passesData.map((row) => row[id].met);
  const metStable = mets.every((m) => m === mets[0]);
  const spread = Math.max(...scores) - Math.min(...scores);
  if (!metStable || spread > TOL) flaky.push({ id, mets, scores, spread });
}

const report = {
  type: "stress-verify", passes, categories,
  stable: flaky.length === 0,
  flaky,
  perPass: passesData,
  generatedAt: new Date().toISOString()
};
const dir = path.join(root, ".sage-kernel/autonomy");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "stress-verify-latest.json"), `${JSON.stringify(report, null, 2)}\n`);
console.error(`\nstress: ${report.stable ? "STABLE" : "FLAKY"} across ${passes} passes${flaky.length ? ` — flaky: ${flaky.map((f) => f.id).join(", ")}` : ""}`);
console.log(JSON.stringify({ stable: report.stable, passes, flaky: flaky.map((f) => f.id) }));
process.exit(report.stable ? 0 : 1);
