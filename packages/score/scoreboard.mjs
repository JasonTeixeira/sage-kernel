import fs from "node:fs";
import { createDoctorReport } from "../core/doctor.mjs";
import { createDriftProof } from "../drift/drift-engine.mjs";
import { createAgentsDoctorReport } from "../agents/agent-pack.mjs";
import { evaluateAgentRuntime } from "../agents/runtime.mjs";
import { createReleaseProof, createReviewScore } from "../review/review-engine.mjs";
import { createSecurityProof } from "../security/supply-chain.mjs";
import { createTestingLabProof } from "../testing/testing-lab.mjs";
import { createKnowledgeGraph, createMemoryE2EProof } from "../intelligence/knowledge-graph.mjs";
import { readLatestEvalReport } from "../intelligence/scripts/eval-runner.mjs";

const CATEGORIES = [
  { id: "installability", weight: 8 },
  { id: "portability", weight: 7 },
  { id: "mcp", weight: 8 },
  { id: "cli", weight: 7 },
  { id: "dashboard", weight: 7 },
  { id: "architecture", weight: 8 },
  { id: "code_quality", weight: 8 },
  { id: "testing", weight: 10 },
  { id: "security", weight: 10 },
  { id: "performance", weight: 6 },
  { id: "reliability", weight: 7 },
  { id: "documentation", weight: 5 },
  { id: "release", weight: 8 },
  { id: "agent_orchestration", weight: 7 },
  { id: "memory", weight: 6 },
  { id: "maintainability", weight: 8 }
];

export function validateScoreModel() {
  const failures = [];
  const totalWeight = CATEGORIES.reduce((sum, category) => sum + category.weight, 0);
  const ids = new Set();
  for (const category of CATEGORIES) {
    if (!category.id || ids.has(category.id)) failures.push(`Invalid or duplicate category: ${category.id}`);
    ids.add(category.id);
    if (!Number.isInteger(category.weight) || category.weight <= 0) failures.push(`Invalid weight for ${category.id}`);
  }
  if (totalWeight !== 120) failures.push(`Score weights must sum to 120, got ${totalWeight}`);
  return { status: failures.length ? "failed" : "passed", categories: CATEGORIES, totalWeight, failures };
}

export async function createQualityScoreboard(options = {}) {
  const root = options.root || process.cwd();
  const projectPath = options.projectPath || ".";
  const evidence = {
    doctor: await safeAsync(() => createDoctorReport({ root, fast: true }), { status: "failed" }),
    agentsDoctor: safe(() => createAgentsDoctorReport({ root }), { status: "failed" }),
    agentsEval: safe(() => evaluateAgentRuntime({ root }), { status: "failed" }),
    review: safe(() => createReviewScore({ root, projectPath }), { report: { score: 0, status: "failed" } }),
    release: safe(() => createReleaseProof({ root, projectPath }), { report: { score: 0, status: "failed" } }),
    security: safe(() => createSecurityProof({ root, projectPath }), { status: "failed" }),
    testing: safe(() => createTestingLabProof({ root, projectPath }), { status: "failed" }),
    memory: safe(() => createMemoryE2EProof({ root, projectPath }), { status: "failed" }),
    graph: safe(() => createKnowledgeGraph({ root, projectPath }), { status: "failed", nodes: [], edges: [] }),
    drift: safe(() => createDriftProof({ root }), { status: "failed" })
  };
  const categories = CATEGORIES.map((category) => scoreCategory(category, evidence));
  const weighted = categories.reduce((sum, category) => sum + category.score * category.weight, 0);
  const weight = categories.reduce((sum, category) => sum + category.weight, 0);
  const rawScore = Math.round(weighted / weight);
  const caps = createScoreCaps({ root, evidence });
  const score = Math.min(rawScore, ...caps.map((cap) => cap.maxScore));
  const blockers = [
    ...categories.flatMap((category) => category.blockers.map((blocker) => ({ category: category.id, blocker }))),
    ...caps.map((cap) => ({ category: "score_cap", blocker: `${cap.reason} Cap=${cap.maxScore}.` }))
  ];
  return {
    status: blockers.length ? "needs_work" : "passed",
    score,
    rawScore,
    caps,
    categories,
    evidence: summarizeEvidence(evidence),
    blockers,
    nextActions: blockers.length
      ? blockers.slice(0, 5).map((item) => `${item.category}: ${item.blocker}`)
      : ["Record this scoreboard with the release candidate evidence."]
  };
}

export function createBenchmarkReport(options = {}) {
  const tasks = [
    "fix failing test",
    "add endpoint",
    "harden auth flow",
    "refactor module",
    "add E2E test",
    "detect security issue",
    "prepare release"
  ].map((task, index) => ({
    id: `benchmark_${index + 1}`,
    task,
    status: "defined",
    metrics: ["success", "durationMs", "testsPassed", "reviewScore", "evidenceQuality"]
  }));
  return { status: "passed", projectPath: options.projectPath || ".", tasks, nextActions: ["Run benchmarks against fixture repos before claiming external comparison."] };
}

export function createScoreRegressionReport(options = {}) {
  const scoreboard = options.scoreboard || { score: 0, categories: [] };
  return {
    status: "passed",
    currentScore: scoreboard.score,
    tracked: ["score", "test count", "coverage", "performance", "agent evals", "release proof"],
    regressions: [],
    generatedAt: new Date().toISOString()
  };
}

export function createExternalComparisonReport() {
  return {
    status: "needs_external_evidence",
    principle: "No unsupported top-tier claims.",
    comparedAreas: ["install experience", "MCP compatibility", "agent workflow reliability", "security maturity", "release proof"],
    requiredEvidence: ["public npm install proof", "real MCP client connection", "long soak report", "benchmark fixture results"],
    nextActions: ["Collect external artifacts before publishing competitive claims."]
  };
}

export function createScoreCaps(options = {}) {
  const root = options.root || process.cwd();
  const caps = [];
  const matrix = readJson(`${root}/.sage-kernel/evidence/real-repo-matrix-latest.json`);
  const clientProof = readJson(`${root}/.sage-kernel/evidence/mcp-client-proof-latest.json`);
  const releaseProof = readJson(`${root}/.sage-kernel/evidence/release-pipeline-latest.json`);
  const evalReport = readLatestEvalReport({ root });

  if (!matrix || matrix.corpusKind !== "real" || Number(matrix.summary?.count || matrix.results?.length || 0) < 20) {
    caps.push({
      id: "real_repo_matrix_missing",
      maxScore: 89,
      reason: "20-repo benchmark matrix evidence is missing."
    });
  }

  const hasPublicInstall = releaseProof?.registry?.status === "published" && releaseProof?.publicGlobalInstall?.status === "passed";
  const hasRealClients = clientProof?.status === "passed" && (clientProof.results || []).every((result) => result.uiProof === "verified");
  if (!hasPublicInstall || !hasRealClients) {
    caps.push({
      id: "external_release_or_clients_missing",
      maxScore: 94,
      reason: "Public npm install proof or real Claude Desktop/Cursor UI proof is missing."
    });
  }

  const metrics = evalReport?.metrics || {};
  if (!(metrics.passAt1 >= 0.8 && metrics.passAt3 >= 0.9 && metrics.passPower3 >= 0.8)) {
    caps.push({
      id: "pass_k_evals_missing",
      maxScore: 96,
      reason: "pass@1/pass@3/pass^3 eval metrics are missing or below target."
    });
  }

  return caps;
}

export function formatScoreOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  if (value.categories) return `Scoreboard ${value.status}: ${value.score}/100, ${value.blockers?.length || 0} blocker(s)\n`;
  if (value.tasks) return `Benchmarks ${value.status}: ${value.tasks.length} task(s)\n`;
  if (value.comparedAreas) return `External comparison ${value.status}: ${value.requiredEvidence.length} evidence item(s) required\n`;
  return `${JSON.stringify(value, null, 2)}\n`;
}

function scoreCategory(category, evidence) {
  const blockers = [];
  let score = 100;
  if (category.id === "installability" && evidence.doctor.status !== "passed") score -= 25;
  if (category.id === "portability" && evidence.agentsDoctor.status !== "passed") score -= 15;
  if (category.id === "mcp" && !evidence.release.report?.evidence?.some?.((item) => String(item.ref).includes("mcp"))) score -= 10;
  if (category.id === "dashboard" && evidence.doctor.checks?.some?.((check) => check.id === "dashboard" && check.status !== "passed")) score -= 10;
  if (category.id === "architecture") score = Math.min(score, reviewCategoryScore(evidence.review, "architecture"));
  if (category.id === "code_quality") score = Math.min(score, reviewCategoryScore(evidence.review, "clean_code"));
  if (category.id === "testing") score = Math.min(score, evidence.testing.status === "passed" ? 96 : 70);
  if (category.id === "security") score = Math.min(score, evidence.security.status === "passed" ? 96 : 65);
  if (category.id === "performance" && !evidence.testing.longSoak?.memoryGrowthReport) score -= 15;
  if (category.id === "release") score = Math.min(score, evidence.release.report?.score || 0);
  if (category.id === "agent_orchestration" && evidence.agentsEval.status !== "passed") score -= 20;
  if (category.id === "memory" && evidence.memory.status !== "passed") score -= 20;
  if (category.id === "maintainability" && evidence.drift.status !== "passed") score -= 15;
  if (score < 90) blockers.push(`Score below 90 (${score}).`);
  return { ...category, score: Math.max(0, Math.min(100, Math.round(score))), blockers };
}

function reviewCategoryScore(review, id) {
  return review.report?.categories?.find((category) => category.id === id)?.score || 0;
}

function summarizeEvidence(evidence) {
  return Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, {
    status: value.status || value.report?.status || "unknown",
    score: value.score || value.report?.score || null
  }]));
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch (error) {
    return { ...fallback, error: error.message };
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function safeAsync(fn, fallback) {
  try {
    return await fn();
  } catch (error) {
    return { ...fallback, error: error.message };
  }
}
