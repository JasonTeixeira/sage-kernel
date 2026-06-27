#!/usr/bin/env node
// Repo cleanup harness. DRY-RUN BY DEFAULT: it classifies every tracked file and
// writes a removal PLAN; it deletes NOTHING without `--apply --confirm`. Even then
// it only `git rm`s the `residual` bucket (internal scratch/planning/proof logs) —
// never essential code/docs, never `ambiguous` files (those are human decisions),
// and it refuses to run while `blocker` files are present. Every removal is via git
// so it is fully reversible (git restore --staged + checkout).
//
//   npm run repo:cleanup                 # dry-run plan (safe)
//   npm run repo:cleanup -- --apply --confirm   # actually git rm the residual set
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { classifyRepoFiles } from "../packages/companion/repo-cleanup.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirm = args.includes("--confirm");

function trackedFiles() {
  const r = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 32 });
  if (r.status !== 0) { console.error("not a git repo (git ls-files failed)"); process.exit(2); }
  return r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
}

const files = trackedFiles();
const plan = classifyRepoFiles(files);

const planDir = path.join(root, ".sage-kernel/cleanup");
fs.mkdirSync(planDir, { recursive: true });
fs.writeFileSync(path.join(planDir, "cleanup-plan.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), ...plan }, null, 2)}\n`);

console.log(`\nRepo cleanup plan (${plan.summary.total} tracked files):`);
console.log(`  essential : ${plan.summary.essential}  (kept, never removed)`);
console.log(`  residual  : ${plan.summary.residual}  (proposed for removal)`);
console.log(`  ambiguous : ${plan.summary.ambiguous}  (HUMAN decides — never auto-removed)`);
console.log(`  blocker   : ${plan.summary.blocker}  (MUST resolve before publishing)`);

if (plan.blocker.length) {
  console.log(`\nBLOCKERS (resolve first):`);
  for (const b of plan.blocker) console.log(`  ! ${b.path} — ${b.reason}`);
}
if (plan.residual.length) {
  console.log(`\nRESIDUAL (proposed for removal):`);
  for (const r of plan.residual) console.log(`  - ${r.path} — ${r.reason}`);
}
if (plan.ambiguous.length) {
  console.log(`\nAMBIGUOUS (review manually; NOT removed by this tool):`);
  for (const a of plan.ambiguous.slice(0, 40)) console.log(`  ? ${a.path} — ${a.reason}`);
  if (plan.ambiguous.length > 40) console.log(`  … and ${plan.ambiguous.length - 40} more (see cleanup-plan.json)`);
}

if (!apply) {
  console.log(`\nDRY-RUN only. Plan written to .sage-kernel/cleanup/cleanup-plan.json`);
  console.log(`To execute the residual removals: npm run repo:cleanup -- --apply --confirm`);
  process.exit(0);
}

// --- apply path (double-gated) ---
if (!confirm) { console.error("\nRefusing to apply without --confirm. Re-run with --apply --confirm."); process.exit(2); }
if (plan.blocker.length) { console.error("\nRefusing to apply while blockers exist. Resolve blockers first."); process.exit(2); }
if (!plan.residual.length) { console.log("\nNothing to remove."); process.exit(0); }

const removed = [];
for (const r of plan.residual) {
  const res = spawnSync("git", ["rm", "-q", "--", r.path], { cwd: root, encoding: "utf8" });
  if (res.status === 0) removed.push(r.path);
  else console.error(`  failed to git rm ${r.path}: ${res.stderr}`);
}
console.log(`\nApplied: git-removed ${removed.length}/${plan.residual.length} residual files (staged, reversible with 'git restore --staged' + 'git checkout').`);
console.log(`Review with 'git status', then run 'npm run release:check' and 'npm run publish:ready' before committing.`);
