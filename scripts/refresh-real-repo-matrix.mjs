#!/usr/bin/env node
// Re-run the real-repo profile matrix on the SAME corpus of real repos recorded in
// the prior artifact, so the autonomous loop can regenerate fresh profile-detection
// evidence each round (capturing detector improvements). If no prior artifact /
// paths exist, it exits cleanly without overwriting (honest no-op).
import fs from "node:fs";
import path from "node:path";
import { createRealRepoMatrixProof } from "./benchmark-real-repos.mjs";

const root = process.cwd();
let paths = [];
try {
  const prior = JSON.parse(fs.readFileSync(path.join(root, ".sage-kernel/evidence/real-repo-matrix-latest.json"), "utf8"));
  paths = (prior.results || []).map((r) => r.projectPath).filter((p) => p && fs.existsSync(p));
} catch { paths = []; }

if (paths.length < 20) {
  console.error(`refresh-real-repo-matrix: only ${paths.length} real repo paths available (need >=20) — leaving prior artifact unchanged.`);
  process.exit(0);
}
const report = createRealRepoMatrixProof({ root, paths });
console.error(`real-repo matrix: status ${report.status}, avg ${report.summary.averageScore}, lowConfidence ${report.summary.lowConfidence}/${report.summary.count}`);
console.log(JSON.stringify(report.summary));
process.exit(report.status === "passed" ? 0 : 1);
