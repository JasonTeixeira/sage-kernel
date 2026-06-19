import fs from "node:fs";
import path from "node:path";
import { detectProjectProfile, generateDefinitionOfDone } from "../profiles/project-detector.mjs";
import { createReviewScore } from "../review/review-engine.mjs";
import { createSecurityProof } from "../security/supply-chain.mjs";
import { createTestingLabProof } from "../testing/testing-lab.mjs";

export function createBenchmarkMatrixReport(options = {}) {
  const root = options.root || process.cwd();
  const paths = Array.isArray(options.paths) && options.paths.length ? options.paths : ["."];
  const risk = options.risk || "high";
  const results = paths.map((projectPath) => benchmarkPath(root, projectPath, risk));
  const current = {
    type: "benchmark-matrix",
    status: results.every((result) => result.status === "passed") ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    root,
    risk,
    results,
    summary: summarize(results),
    stressCommands: [
      "npm run stress:queue -- --count=5000000",
      "npm run stress:dashboard -- --count=50000 --concurrency=250",
      "npm run soak:run -- --profile=release --cycles=50 --dashboard"
    ],
    scoreCaps: [
      "Cap at 89 without real repo matrix.",
      "Cap at 94 without public install and external client proof."
    ]
  };
  const previous = options.compare ? readLatest(root) : null;
  const comparison = previous ? compareMatrices(previous, current) : null;
  const report = {
    ...current,
    comparison,
    status: comparison?.status === "failed" && options.failOnRegression ? "failed" : current.status
  };
  if (options.save) writeLatest(root, report);
  return report;
}

function benchmarkPath(root, projectPath, risk) {
  try {
    const profile = detectProjectProfile({ root, projectPath });
    const done = generateDefinitionOfDone({ projectPath, risk }, { root });
    const loop = createLocalLoopScore(root, projectPath, risk);
    const security = createSecurityProof({ root, projectPath });
    const testing = createTestingLabProof({ root, projectPath, risk });
    const review = createReviewScore({ root, projectPath });
    const score = Math.round([
      profile.confidence,
      loop.score,
      security.status === "passed" ? 96 : 70,
      testing.status === "passed" ? 96 : 70,
      review.report?.score || 0
    ].reduce((sum, value) => sum + value, 0) / 5);
    return {
      projectPath,
      status: "passed",
      profile: profile.profile.id,
      confidence: profile.confidence,
      decision: profile.profileDecision,
      recommendedCommands: done.recommendedCommands,
      requiredChecks: done.requiredChecks,
      score,
      proofs: {
        loop: loop.status,
        security: security.status,
        testing: testing.status,
        review: review.report?.status || "unknown"
      },
      warnings: profile.warnings
    };
  } catch (error) {
    return { projectPath, status: "failed", error: error.message, score: 0 };
  }
}

function createLocalLoopScore(root, projectPath, risk) {
  const profile = detectProjectProfile({ root, projectPath });
  const done = generateDefinitionOfDone({ projectPath, risk }, { root });
  const missingEvidence = done.evidenceRequired.filter((item) => /external|real client|fresh install|release/i.test(item));
  const ambiguityPenalty = profile.profileDecision?.ambiguous ? 8 : 0;
  return {
    status: profile.confidence >= 80 && !profile.profileDecision?.ambiguous ? "passed" : "needs_hardening",
    score: Math.max(0, 100 - missingEvidence.length * 3 - ambiguityPenalty - (profile.confidence < 70 ? 10 : 0))
  };
}

function summarize(results) {
  const scores = results.map((result) => Number(result.score || 0));
  return {
    count: results.length,
    failed: results.filter((result) => result.status !== "passed").length,
    averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
    ambiguous: results.filter((result) => result.decision?.ambiguous).length,
    lowConfidence: results.filter((result) => Number(result.confidence || 0) < 70).length
  };
}

function compareMatrices(previous, current) {
  const previousByPath = new Map((previous.results || []).map((result) => [result.projectPath, result]));
  const regressions = [];
  for (const result of current.results) {
    const before = previousByPath.get(result.projectPath);
    if (!before) continue;
    if (result.score < Number(before.score || 0) - 5) {
      regressions.push({
        projectPath: result.projectPath,
        previousScore: before.score,
        currentScore: result.score,
        delta: result.score - before.score
      });
    }
    if (before.profile && result.profile && before.profile !== result.profile) {
      regressions.push({
        projectPath: result.projectPath,
        previousProfile: before.profile,
        currentProfile: result.profile,
        delta: "profile_changed"
      });
    }
  }
  return {
    status: regressions.length ? "failed" : "passed",
    regressions
  };
}

function latestPath(root) {
  return path.join(root, ".sage-kernel/evidence/benchmark-matrix-latest.json");
}

function readLatest(root) {
  try {
    return JSON.parse(fs.readFileSync(latestPath(root), "utf8"));
  } catch {
    return null;
  }
}

function writeLatest(root, report) {
  const file = latestPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}

export const __benchmarkMatrixTestInternals = {
  compareMatrices,
  summarize
};
