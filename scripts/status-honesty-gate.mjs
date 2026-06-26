import { createBenchmarkReport, createExternalComparisonReport, createScoreRegressionReport, validateScoreModel } from "../packages/score/scoreboard.mjs";
import { createReleasePipelineProof } from "./release-pipeline-proof.mjs";
import { validateStatusHonesty } from "../packages/audit/status-honesty.mjs";
import { createFullStressMatrix } from "../packages/testing/stress-matrix.mjs";
import { createMcpClientProof } from "../packages/core/mcp-client-proof.mjs";

const root = process.cwd();

const reports = [
  ["score.validate", validateScoreModel()],
  ["score.benchmarks", createBenchmarkReport({ root, projectPath: "." })],
  ["score.regression", createScoreRegressionReport({ scoreboard: { score: 80, categories: [] } })],
  ["score.external_comparison", createExternalComparisonReport()],
  ["release.pipeline", createReleasePipelineProof({ root })],
  ["mcp.clients", await createMcpClientProof({ root, clients: ["codex"] })],
  ["stress.matrix", await createFullStressMatrix({ root })]
];

const failures = [];
for (const [label, report] of reports) {
  const result = validateStatusHonesty(report, { label });
  failures.push(...result.failures);
}

if (failures.length > 0) {
  console.error(`Status honesty gate failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log(`Status honesty gate passed. Reports checked: ${reports.length}`);
