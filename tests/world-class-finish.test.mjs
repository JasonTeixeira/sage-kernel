import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { dashboardSnapshot, renderDashboardHtml } from "../apps/dashboard/server.mjs";
import { createFinalAuditReport } from "../packages/audit/final-audit.mjs";
import { createMemoryE2EProof } from "../packages/intelligence/knowledge-graph.mjs";
import { createQualityScoreboard, validateScoreModel } from "../packages/score/scoreboard.mjs";
import { applyApprovedRepair, createRepairPlan, createSelfHealingProof } from "../packages/self-healing/self-healing.mjs";
import { createReleaseStressEvidence } from "../packages/testing/release-evidence.mjs";

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
