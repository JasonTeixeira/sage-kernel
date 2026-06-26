import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOperate } from "../packages/operate/operate.mjs";
import { runRepairLoop, detectFlaky } from "../packages/operate/repair-loop.mjs";
import { readGraph } from "../packages/proof/graph.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-operate-"));
}

const ACCEPTANCE = ["Behaviour X works", "Errors are handled"];

// --- repair loop ---

test("repair loop fixes a failing gate via the repairer", async () => {
  const root = tempRoot();
  let fixed = false;
  const result = await runRepairLoop({
    root,
    runGate: async () => ({ status: fixed ? "passed" : "failed" }),
    repairer: async () => {
      fixed = true;
      return { applied: true, description: "applied fix" };
    },
    maxAttempts: 2
  });
  assert.equal(result.status, "repaired");
  assert.equal(result.repaired, true);
  assert.equal(result.postmortem, null);
});

test("a bad repair that never fixes creates a postmortem candidate (bounded)", async () => {
  const root = tempRoot();
  let calls = 0;
  const result = await runRepairLoop({
    root,
    runGate: async () => {
      calls += 1;
      return { status: "failed" };
    },
    repairer: async () => ({ applied: false, description: "tried, no luck" }),
    maxAttempts: 2
  });
  assert.equal(result.status, "failed");
  assert.equal(result.postmortem.candidate, true);
  assert.match(result.postmortem.reason, /exhausted/);
  assert.equal(result.attempts.length, 2);
});

test("a destructive repair without approval is blocked", async () => {
  const root = tempRoot();
  const result = await runRepairLoop({
    root,
    runGate: async () => ({ status: "failed" }),
    repairer: async () => ({ applied: true, destructive: true, description: "rm -rf node_modules" }),
    maxAttempts: 2,
    approve: false
  });
  assert.equal(result.status, "blocked_needs_approval");
  assert.equal(result.postmortem.candidate, true);
});

test("detectFlaky marks a gate with mixed results as flaky", async () => {
  let n = 0;
  const result = await detectFlaky({
    runGate: async () => ({ status: n++ % 2 === 0 ? "failed" : "passed" }),
    runs: 4
  });
  assert.equal(result.flaky, true);
  assert.equal(result.marked, "quarantine");
});

// --- operate loop ---

test("operate completes a small fixture fix end to end and emits evidence-backed report", async () => {
  const root = tempRoot();
  let bug = true;
  const result = await runOperate({
    root,
    goal: "Improve the docs homepage copy",
    acceptanceCriteria: ACCEPTANCE,
    files: ["docs/home.md"],
    gateRunners: {
      "impacted-tests": async () => ({ status: bug ? "failed" : "passed" }),
      "code-review": async () => ({ status: "passed" })
    },
    repairer: async () => {
      bug = false;
      return { applied: true, description: "fixed the failing check" };
    }
  });
  assert.equal(result.status, "passed");
  assert.equal(result.claimFirewall.status, "passed");
  assert.ok(result.evidenceIds.length > 0);
  assert.equal(result.proofGraphValidation.status, "passed");
  assert.ok(readGraph({ root }).nodes.some((n) => n.type === "goal"));
});

test("operate blocks when acceptance criteria are missing", async () => {
  const root = tempRoot();
  const result = await runOperate({ root, goal: "do something", files: ["docs/x.md"] });
  assert.equal(result.status, "blocked_missing_acceptance_criteria");
});

test("operate stops on budget when repair cannot fix the gate", async () => {
  const root = tempRoot();
  const result = await runOperate({
    root,
    goal: "Update docs copy",
    acceptanceCriteria: ACCEPTANCE,
    files: ["docs/home.md"],
    maxRepairAttempts: 1,
    gateRunners: { "impacted-tests": async () => ({ status: "failed" }), "code-review": async () => ({ status: "passed" }) },
    repairer: async () => ({ applied: false, description: "cannot fix" })
  });
  assert.equal(result.status, "needs_work");
  assert.ok(result.blockers.includes("impacted-tests"));
});

test("operate stops on unsafe required approval", async () => {
  const root = tempRoot();
  const result = await runOperate({
    root,
    goal: "Update docs copy",
    acceptanceCriteria: ACCEPTANCE,
    files: ["docs/home.md"],
    gateRunners: { "impacted-tests": async () => ({ status: "failed" }), "code-review": async () => ({ status: "passed" }) },
    repairer: async () => ({ applied: true, destructive: true, description: "destructive fix" }),
    approve: false
  });
  assert.equal(result.status, "blocked_needs_approval");
});

test("operate applies high-risk gates for an auth goal", async () => {
  const root = tempRoot();
  const ran = [];
  const pass = (name) => async () => {
    ran.push(name);
    return { status: "passed" };
  };
  const result = await runOperate({
    root,
    goal: "Add OAuth login and session auth",
    acceptanceCriteria: ACCEPTANCE,
    files: ["src/auth/login.ts"],
    gateRunners: {
      "impacted-tests": pass("impacted-tests"),
      "code-review": pass("code-review"),
      "senior-review": pass("senior-review"),
      "secret-scan": pass("secret-scan"),
      "security-proof": pass("security-proof"),
      redteam: pass("redteam"),
      "release-check": pass("release-check")
    }
  });
  assert.equal(result.risk.level, "high");
  assert.ok(result.plan.includes("security-proof"));
  assert.ok(ran.includes("security-proof"));
  assert.equal(result.status, "passed");
});
