import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { dashboardSnapshot, renderDashboardHtml } from "../apps/dashboard/server.mjs";
import { createFinalAuditReport } from "../packages/audit/final-audit.mjs";
import { createBenchmarkCorpusProof } from "../packages/benchmark/corpus-proof.mjs";
import { createMemoryE2EProof } from "../packages/intelligence/knowledge-graph.mjs";
import { createRetrievalProof } from "../packages/intelligence/retrieval-proof.mjs";
import { createDurableOrchestrationProof } from "../packages/orchestration/durable-proof.mjs";
import { createObservabilityProof } from "../packages/observability/proof.mjs";
import { createQualityScoreboard, validateScoreModel } from "../packages/score/scoreboard.mjs";
import { applyApprovedRepair, createRepairPlan, createSelfHealingProof } from "../packages/self-healing/self-healing.mjs";
import { runExecutableRedteam } from "../packages/security/redteam-fixtures.mjs";
import { createFullStressMatrix } from "../packages/testing/stress-matrix.mjs";
import { createReleaseStressEvidence } from "../packages/testing/release-evidence.mjs";
import { runTemplatesE2E } from "../scripts/templates-e2e.mjs";
import { runTemplatesBenchmark } from "../scripts/templates-benchmark.mjs";

const root = path.resolve(import.meta.dirname, "..");

function run(args) {
  return spawnSync(args[0], args.slice(1), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16
  });
}

test("scoreboard, release evidence, self-healing, memory e2e, and final audit produce proof artifacts", async () => {
  const model = validateScoreModel();
  assert.equal(model.status, "passed");
  assert.equal(model.categories.length >= 16, true);

  const release = await createReleaseStressEvidence({
    root,
    cycles: 1,
    queueCount: 25,
    includeMcp: false
  });
  assert.equal(release.status, "passed");
  assert.equal(release.releaseProfiles.queue100k.count, 100000);
  assert.equal(release.evidenceStatus.queue100kRecorded, false);

  const plan = createRepairPlan({ failedGate: "test -f proof.txt", signal: "missing proof" });
  assert.equal(plan.approvalRequired, true);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "sage-self-heal-test-"));
  const blocked = applyApprovedRepair(plan, { root: fixture, approved: false });
  assert.equal(blocked.status, "blocked");
  const repaired = applyApprovedRepair(plan, { root: fixture, approved: true, relativePath: "proof.txt", verifyCommand: "test -f proof.txt" });
  assert.equal(repaired.status, "passed");

  const selfHealing = createSelfHealingProof({ root });
  assert.equal(selfHealing.status, "passed");
  assert.equal(selfHealing.blocked.status, "blocked");

  const memory = createMemoryE2EProof({ root, projectPath: "." });
  assert.equal(memory.status, "passed");
  assert.equal(memory.before.status, "failed");
  assert.equal(memory.after.status, "passed");
  assert.equal(memory.futureContext.usedMemory, true);

  const scoreboard = await createQualityScoreboard({ root, projectPath: "." });
  assert.equal(Number.isInteger(scoreboard.score), true);
  assert.equal(scoreboard.categories.some((category) => category.id === "memory"), true);

  const audit = await createFinalAuditReport({ root, projectPath: "." });
  assert.equal(["passed", "needs_work"].includes(audit.status), true);
  assert.equal(audit.checks.some((check) => check.id === "self_healing"), true);
  assert.equal(audit.checks.find((check) => check.id === "external_comparison").status, "warning");
});

test("100 proof modules generate corpus, hostile, stress, retrieval, orchestration, and observability evidence", async () => {
  const corpus = createBenchmarkCorpusProof({ root, save: false });
  assert.equal(corpus.status, "passed");
  assert.equal(corpus.matrix.summary.count, 20);

  const redteam = runExecutableRedteam({ root });
  assert.equal(redteam.status, "passed");
  assert.equal(redteam.results.some((item) => item.id === "malicious-mcp-manifest"), true);
  assert.equal(redteam.results.some((item) => item.id === "symlink-traversal"), true);

  const stress = await createFullStressMatrix({ root });
  assert.equal(stress.status, "passed");
  assert.equal(stress.dashboard.latencyMs.p99 >= 0, true);
  assert.equal(stress.soak.thresholdChecks.memoryGrowth.status, "passed");

  const retrieval = createRetrievalProof({ root, query: "release" });
  assert.equal(retrieval.status, "passed");
  assert.equal(retrieval.results.length > 0, true);
  assert.equal(retrieval.index.citationsRequired, true);

  const orchestration = createDurableOrchestrationProof({ root });
  assert.equal(orchestration.status, "passed");
  assert.equal(orchestration.leases.length, 5);
  assert.equal(orchestration.failureReplay.available, true);

  const observability = createObservabilityProof({ root });
  assert.equal(observability.status, "passed");
  assert.equal(observability.openTelemetryShape, true);
  assert.equal(observability.spans.length >= 4, true);
});

test("new world-class finish commands are executable from the CLI", () => {
  const commands = [
    ["node", "bin/sage.mjs", "release-evidence", "--cycles=1", "--queue-count=20", "--json"],
    ["node", "bin/sage.mjs", "memory", "e2e", "--json"],
    ["node", "bin/sage.mjs", "score", "validate", "--json"],
    ["node", "bin/sage.mjs", "score", "benchmarks", "--json"],
    ["node", "bin/sage.mjs", "self-heal", "prove", "--json"],
    ["node", "bin/sage.mjs", "final-audit", "--json"]
  ];
  for (const command of commands) {
    const result = run(command);
    assert.equal(result.status, 0, `${command.join(" ")}\n${result.stderr}\n${result.stdout}`);
    const parsed = JSON.parse(result.stdout);
    assert.equal(Boolean(parsed.status), true);
  }
});

test("dashboard exposes testing, memory, scoreboard, self-healing, stress, and final audit cockpit views", () => {
  const snapshot = dashboardSnapshot({ root });
  assert.equal(snapshot.cockpit.testing.status, "passed");
  assert.equal(snapshot.cockpit.score.status, "passed");
  assert.equal(snapshot.cockpit.selfHealing.approvalRequired, true);
  const html = renderDashboardHtml(snapshot);
  for (const label of ["Testing Lab", "Knowledge Graph", "Evidence Score Model", "Bounded Self-Healing", "Stress And Soak Profiles", "External Proof"]) {
    assert.match(html, new RegExp(label));
  }
});

test("generated templates install, run QA, include AGENTS.md, and benchmark cleanly", () => {
  const e2e = runTemplatesE2E();
  assert.equal(e2e.status, "passed");
  assert.equal(e2e.summary.passed, 3);
  assert.equal(e2e.templates.every((item) => item.missing.length === 0), true);
  assert.equal(e2e.templates.every((item) => item.steps.install.status === 0 && item.steps.qa.status === 0), true);

  const benchmark = runTemplatesBenchmark();
  assert.equal(benchmark.status, "passed");
  assert.equal(benchmark.templates.length, 3);
  assert.equal(benchmark.templates.every((item) => item.durationMs > 0), true);
});
