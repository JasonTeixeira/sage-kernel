import { createDriftProof } from "../drift/drift-engine.mjs";
import { createReleaseProof, createSeniorReview } from "../review/review-engine.mjs";
import { createSecurityProof } from "../security/supply-chain.mjs";
import { createTestingLabProof } from "../testing/testing-lab.mjs";
import { createMemoryE2EProof } from "../intelligence/knowledge-graph.mjs";
import { createSelfHealingProof } from "../self-healing/self-healing.mjs";
import { createBenchmarkReport, createExternalComparisonReport, createQualityScoreboard } from "../score/scoreboard.mjs";

export async function createFinalAuditReport(options = {}) {
  const root = options.root || process.cwd();
  const projectPath = options.projectPath || ".";
  const checks = [
    check("review", () => createSeniorReview({ root, projectPath })),
    check("release", () => createReleaseProof({ root, projectPath })),
    check("security", () => createSecurityProof({ root, projectPath })),
    check("testing", () => createTestingLabProof({ root, projectPath })),
    check("memory_e2e", () => createMemoryE2EProof({ root, projectPath })),
    check("self_healing", () => createSelfHealingProof({ root })),
    check("drift", () => createDriftProof({ root })),
    check("benchmarks", () => createBenchmarkReport({ root, projectPath })),
    check("external_comparison", () => createExternalComparisonReport())
  ];
  const resolved = [];
  for (const item of checks) resolved.push(await item);
  const scoreboard = await createQualityScoreboard({ root, projectPath });
  const criticalGaps = [
    ...resolved.filter((item) => item.status === "failed").map((item) => `${item.id} failed: ${item.error || "status failed"}`),
    ...scoreboard.blockers.map((item) => `${item.category}: ${item.blocker}`)
  ];
  return {
    status: criticalGaps.length ? "needs_work" : "passed",
    generatedAt: new Date().toISOString(),
    scoreboard: { status: scoreboard.status, score: scoreboard.score },
    checks: resolved,
    criticalGaps,
    nextActions: criticalGaps.length
      ? criticalGaps.slice(0, 10)
      : ["Run external proof, attach public install evidence, then create release candidate."]
  };
}

export function formatFinalAuditOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  return `Final audit ${value.status}: score=${value.scoreboard.score}, gaps=${value.criticalGaps.length}\n`;
}

async function check(id, fn) {
  try {
    const result = await fn();
    return { id, status: normalizeStatus(result), evidence: summarize(result) };
  } catch (error) {
    return { id, status: "failed", error: error.message, evidence: {} };
  }
}

function normalizeStatus(result) {
  if (["passed", "defined", "needs_external_evidence"].includes(result?.status)) return "passed";
  if (result?.report?.status === "passed") return "passed";
  return result?.status === "needs_work" ? "warning" : "failed";
}

function summarize(result) {
  return {
    status: result?.status || result?.report?.status || "unknown",
    score: result?.score || result?.report?.score || null,
    count: result?.checks?.length || result?.tasks?.length || result?.criticalGaps?.length || null
  };
}
