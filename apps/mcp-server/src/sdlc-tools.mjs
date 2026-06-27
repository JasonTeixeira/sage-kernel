import fs from "node:fs";
import path from "node:path";
import {
  detectProjectProfile,
  generateDefinitionOfDone
} from "../../../packages/profiles/project-detector.mjs";
import { createSeniorReview, createReviewScore, inspectRepository } from "../../../packages/review/review-engine.mjs";
import { detectRequiredChecks } from "../../../packages/profiles/required-checks.mjs";
import { localizeCommands } from "../../../packages/profiles/toolchain.mjs";
import { createSecurityProof } from "../../../packages/security/supply-chain.mjs";
import { createTestingLabProof } from "../../../packages/testing/testing-lab.mjs";
import { createClosedLoopWorkflow } from "../../../packages/workflows/closed-loop.mjs";
import { createBenchmarkMatrixReport } from "../../../packages/benchmark/benchmark-matrix.mjs";
import { runExecutableRedteam } from "../../../packages/security/test-fixtures/redteam.mjs";

export function createProfileGapReport(root, input = {}) {
  const projectPath = input.projectPath || ".";
  const detected = detectProjectProfile({ root, projectPath });
  const scripts = new Set(detected.scripts || []);
  const profile = detected.profile || {};
  const missing = [];

  // 1. Required profile commands the target repo cannot run (no matching script).
  // Only meaningful for Node projects — profile commands are npm scripts. For a
  // non-Node repo "npm run X is missing" is a FALSE gap; surface the language
  // toolchain note instead (honest, language-aware).
  const isNodeProject = Boolean(detected.project?.package);
  if (isNodeProject) {
    for (const command of profile.commands || []) {
      const scriptName = String(command).replace(/^npm run /, "").replace(/^npm /, "").trim();
      if (scriptName && scriptName !== "test" && !scripts.has(scriptName)) missing.push(`Missing required command for ${profile.id}: ${command}`);
      if (scriptName === "test" && !scripts.has("test")) missing.push(`Missing required command for ${profile.id}: ${command}`);
    }
  }

  // 2. Real per-repo hygiene gaps from repository inspection.
  const inspection = safeInspect(root, projectPath);
  for (const finding of inspection.findings || []) missing.push(`${finding.message} (${finding.evidence})`);

  // 3. Profile-required safety checks — DETECTED present/missing with evidence
  // (e.g. payments-system: webhook-signature, idempotency, ...), not a generic
  // reminder. Only genuinely-undetected checks become gaps.
  const requiredChecks = profile.requiredChecks || [];
  const checkReport = detectRequiredChecks(root, profile);
  for (const entry of checkReport.checks) {
    if (!entry.present) missing.push(`${profile.id} required check not detected: ${entry.check}${entry.reason ? ` (${entry.reason})` : ""}`);
  }

  const toolchain = localizeCommands(profile.commands || [], { languages: detected.languages || [], hasPackageJson: isNodeProject });
  return {
    status: missing.length ? "blocked_not_verified" : "passed",
    project: detected.project,
    primaryProfile: profile.id,
    secondaryProfiles: detected.secondaryProfiles.map((entry) => entry.id),
    confidence: detected.confidence,
    decision: detected.profileDecision,
    languages: detected.languages,
    toolchain: toolchain.toolchain,
    toolchainNote: toolchain.note,
    requiredChecks,
    detectedChecks: checkReport.checks,
    missing,
    nextActions: [
      `Add any missing required commands (${(profile.commands || []).join(", ") || "none"}).`,
      "Close the repository hygiene gaps above (tests, coverage, security policy, CI).",
      `Implement and test the ${profile.id} required safety checks, then re-run kernel.profile.gaps.`
    ]
  };
}

function safeInspect(root, projectPath) {
  try {
    return inspectRepository({ root, projectPath });
  } catch {
    return { findings: [] };
  }
}

export function createLoopScore(root, input = {}) {
  const projectPath = input.projectPath || ".";
  const detected = detectProjectProfile({ root, projectPath });
  const done = generateDefinitionOfDone({
    projectPath,
    objective: input.objective || "Complete a profile-aware SDLC loop.",
    risk: input.risk || "high"
  }, { root });
  const workflow = createClosedLoopWorkflow({
    projectPath,
    objective: input.objective,
    risk: input.risk || "high"
  }, { root });
  const hardGaps = createProfileGapReport(root, { projectPath }).missing;
  const ambiguityPenalty = detected.profileDecision?.ambiguous ? 8 : 0;
  const score = Math.max(0, 100 - hardGaps.length * 4 - (detected.confidence < 90 ? 5 : 0) - ambiguityPenalty);
  return {
    status: score >= 90 && hardGaps.length === 0 ? "passed" : "needs_hardening",
    score,
    profile: detected.profile.id,
    confidence: detected.confidence,
    decision: detected.profileDecision,
    requiredChecks: done.requiredChecks,
    phases: workflow.phases.map((phase) => phase.id),
    hardGaps
  };
}

export function createFullCyclePlan(root, input = {}) {
  const projectPath = input.projectPath || ".";
  const objective = input.objective || "Run full SDLC loop.";
  const risk = input.risk || "high";
  const loop = createClosedLoopWorkflow({
    projectPath,
    mode: input.mode === "plan" ? "plan" : "run",
    objective,
    risk
  }, { root });
  const review = createSeniorReview({ root, projectPath });
  const security = createSecurityProof({ root, projectPath });
  const testing = createTestingLabProof({ root, projectPath, risk });
  const score = createLoopScore(root, { projectPath, objective, risk });
  const failedCommands = (loop.run || []).filter((item) => item.status !== 0);
  const status = failedCommands.length === 0 && review.status !== "failed" && security.status === "passed" && testing.status === "passed"
    ? "passed"
    : "failed";
  return {
    status,
    profile: detectProjectProfile({ root, projectPath }),
    definitionOfDone: generateDefinitionOfDone({
      projectPath,
      objective,
      risk
    }, { root }),
    loop,
    review,
    security,
    testing,
    score,
    failedCommands
  };
}

export function listEvidence(root, input = {}) {
  const limit = Number(input.limit || 20);
  const evidenceDirs = [".sage-kernel/runs", ".sage-kernel/exports", ".sage-kernel/backups", ".sage-kernel/evidence"];
  const records = [];
  for (const dir of evidenceDirs) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) continue;
    for (const file of fs.readdirSync(full).sort().reverse().slice(0, limit)) {
      const target = path.join(full, file);
      const stat = fs.statSync(target);
      records.push({
        kind: dir.replace(".sage-kernel/", ""),
        path: path.relative(root, target),
        bytes: stat.size,
        modifiedAt: stat.mtime.toISOString()
      });
    }
  }
  return { status: "passed", count: records.length, records: records.slice(0, limit) };
}

export function compareEvidence(root, input = {}) {
  const left = input.left ? readEvidenceJson(root, input.left) : null;
  const right = input.right ? readEvidenceJson(root, input.right) : null;
  if (!left || !right) {
    return {
      status: "needs_input",
      message: "Provide left and right evidence JSON paths relative to the repo root.",
      available: listEvidence(root, { limit: 10 }).records
    };
  }
  return {
    status: "passed",
    left: summarizeEvidence(left),
    right: summarizeEvidence(right),
    changedStatus: left.status !== right.status,
    changedScore: Number(right.score || right.scoreboard?.score || 0) - Number(left.score || left.scoreboard?.score || 0)
  };
}

export function generatePostmortem(input = {}) {
  if (!input.failure && !input.evidencePath) {
    return {
      status: "blocked_not_implemented",
      message: "Postmortem generation requires a concrete failure or evidencePath."
    };
  }
  const failure = input.failure || "Unknown failure";
  const impact = input.impact || "Engineering loop failed or produced incomplete evidence.";
  return {
    status: "generated",
    title: input.title || "Sage Kernel SDLC Loop Failure Postmortem",
    failure,
    impact,
    rootCauseHypotheses: input.rootCauseHypotheses || [
      "The loop lacked enough diagnostic evidence.",
      "The profile definition did not include a needed proof layer.",
      "The stress or hostile test-fixture did not model the real failure mode."
    ],
    preventionRules: [
      "Add a regression test-fixture for this failure.",
      "Add scorecard cap or blocker if evidence is missing.",
      "Add a post-repair verification command."
    ],
    nextActions: input.nextActions || ["Create a failing test-fixture, patch the loop, rerun verification."]
  };
}

export function createAgentSafetyRedteam(root, input = {}) {
  const proof = runExecutableRedteam({ root, projectPath: input.projectPath || "." });
  return {
    status: proof.status,
    project: detectProjectProfile({ root, projectPath: input.projectPath || "." }).project,
    proof,
    failed: proof.results.filter((result) => result.status !== "passed")
  };
}

export function createBenchmarkMatrix(root, input = {}) {
  return createBenchmarkMatrixReport({
    root,
    paths: Array.isArray(input.paths) && input.paths.length ? input.paths : ["."],
    risk: input.risk || "high",
    save: Boolean(input.save),
    compare: Boolean(input.compare),
    failOnRegression: Boolean(input.failOnRegression)
  });
}

function readEvidenceJson(root, relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
  } catch {
    return null;
  }
}

function summarizeEvidence(value) {
  return {
    status: value.status || value.scoreboard?.status || "unknown",
    score: value.score || value.scoreboard?.score || null,
    type: value.type || null,
    count: value.count || value.checks?.length || value.cycles?.length || null
  };
}
