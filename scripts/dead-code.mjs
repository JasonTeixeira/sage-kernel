import { analyzeDeadCode } from "../packages/refactor/dead-code.mjs";

// Dead-code / no-debt gate. Orphan files and unused dependencies fail the gate
// (high-confidence debt). Unused exports are reported as candidates and only fail
// under --strict (an export can be a public API surface).
//
// Usage: node scripts/dead-code.mjs [--strict]

const strict = process.argv.includes("--strict");
const result = analyzeDeadCode(process.cwd(), { strict });

console.log(
  JSON.stringify(
    {
      status: result.status,
      summary: result.summary,
      orphanFiles: result.orphanFiles,
      unusedDependencies: result.unusedDependencies,
      unusedExportCandidates: strict ? result.unusedExports : result.unusedExports.length
    },
    null,
    2
  )
);

if (result.status !== "passed") {
  console.error(
    `Dead-code gate failed: ${result.orphanFiles.length} orphan file(s), ${result.unusedDependencies.length} unused dependency(ies)${strict ? `, ${result.unusedExports.length} unused export(s)` : ""}.`
  );
  process.exit(1);
}

console.log(`Dead-code gate passed (${result.summary.unusedExportCandidates} export candidates to review).`);
