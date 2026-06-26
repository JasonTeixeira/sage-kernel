import { spawnSync } from "node:child_process";
import { runMutationTesting } from "../packages/testing/mutation.mjs";
import { mapTestImpact } from "../packages/testing/impact-map.mjs";

// Mutation-test changed files against their impacted tests (real per-change
// scope), or an explicit --target. Falls back to the proof ledger so the gate
// is usable out of the box and in CI on a clean / non-git tree.
//
// Usage: node scripts/mutation.mjs [--changed] [--target <file>] [--tests <a,b>] [--threshold N]

const args = process.argv.slice(2);
const arg = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
};
const root = process.cwd();
const threshold = arg("threshold") ? Number(arg("threshold")) : 80;

function gitChangedSourceFiles() {
  const diff = spawnSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
  if (diff.status !== 0) return null; // not a git repo
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  const files = [...`${diff.stdout || ""}`.split("\n"), ...`${untracked.stdout || ""}`.split("\n")]
    .map((file) => file.trim())
    .filter(Boolean);
  return [...new Set(files)].filter((file) => /\.(mjs|js)$/.test(file) && !/\.(test|spec)\./.test(file));
}

function resolveTargets() {
  if (arg("target")) {
    return [{ targetFile: arg("target"), testFiles: (arg("tests") || "").split(",").map((t) => t.trim()).filter(Boolean), semantic: true, threshold }];
  }
  if (args.includes("--changed")) {
    const changed = gitChangedSourceFiles();
    if (changed && changed.length) {
      const impact = mapTestImpact(changed, { root });
      // Deep per-change scope: full token + semantic mutant set, realistic bar.
      const targets = impact.files
        .filter((entry) => entry.covered)
        .map((entry) => ({ targetFile: entry.file, testFiles: entry.tests, semantic: true, threshold: arg("threshold") ? threshold : 70 }));
      if (targets.length) return targets;
    }
  }
  // Default out-of-box gate: proven token mutators on a small, well-tested module.
  return [{ targetFile: "packages/proof/ledger.mjs", testFiles: ["tests/proof-ledger.test.mjs"], semantic: false, threshold }];
}

const targets = resolveTargets();
const reports = [];
for (const target of targets) {
  if (!target.testFiles.length) continue;
  reports.push(await runMutationTesting({ root, targetFile: target.targetFile, testFiles: target.testFiles, semantic: target.semantic, threshold: target.threshold }));
}

console.log(JSON.stringify({ targets: targets.map((t) => t.targetFile), reports }, null, 2));

const notRestored = reports.find((report) => !report.restored);
if (notRestored) {
  console.error(`CRITICAL: ${notRestored.targetFile} was not restored after mutation testing.`);
  process.exit(2);
}
const failed = reports.filter((report) => report.status === "failed");
if (failed.length) {
  console.error(`Mutation testing failed for: ${failed.map((r) => `${r.targetFile} (${r.mutationScore}<${r.threshold})`).join(", ")}.`);
  process.exit(1);
}
const summary = reports.map((r) => `${r.targetFile}: ${r.mutationScore} (${r.killed}/${r.total})`).join("; ");
console.log(`Mutation testing passed: ${summary || "no targets"}.`);
