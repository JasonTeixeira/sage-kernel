import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { diagnoseFailure } from "../packages/operate/diagnose.mjs";
import { adversariallyVerify } from "../packages/agents/verify.mjs";
import { createAutonomousRepairer, isAgentConfigured } from "../packages/agents/executor.mjs";
import { runRepairLoop } from "../packages/operate/repair-loop.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-autonomy-"));
}

const confirm = () => async () => ({ confirmed: true });
const refute = () => async () => ({ confirmed: false });

// --- diagnosis ---

test("diagnoses an assertion failure and localizes the file:line", () => {
  const d = diagnoseFailure({
    command: "node --test",
    stderr: "AssertionError: Expected values to be strictly equal\n    at TestContext.<anonymous> (packages/foo/bar.mjs:42:7)"
  });
  assert.equal(d.category, "assertion");
  assert.deepEqual(d.primaryLocation, { file: "packages/foo/bar.mjs", line: 42, column: 7 });
  assert.ok(d.impactedFiles.includes("packages/foo/bar.mjs"));
  assert.match(d.instruction, /assertion failed/i);
});

test("classifies reference, syntax, and unknown failures", () => {
  assert.equal(diagnoseFailure({ stderr: "ReferenceError: foo is not defined" }).category, "reference");
  assert.equal(diagnoseFailure({ stderr: "SyntaxError: Unexpected token )" }).category, "syntax");
  assert.equal(diagnoseFailure({ stderr: "Cannot find module './x.mjs'" }).category, "reference");
  assert.equal(diagnoseFailure({ stderr: "something weird happened" }).category, "unknown");
});

// --- adversarial verification ---

test("adversarial verification is blocked_not_implemented without verifiers", async () => {
  const r = await adversariallyVerify({ claim: "x" });
  assert.equal(r.status, "blocked_not_implemented");
});

test("a fix is verified only with a strict majority of confirmations", async () => {
  assert.equal((await adversariallyVerify({ claim: "x", verifierRunners: [confirm(), confirm(), confirm()] })).status, "verified");
  assert.equal((await adversariallyVerify({ claim: "x", verifierRunners: [confirm(), confirm(), refute()] })).status, "verified");
  assert.equal((await adversariallyVerify({ claim: "x", verifierRunners: [confirm(), refute(), refute()] })).status, "rejected");
  // tie (1/2) is rejected — skeptical default
  assert.equal((await adversariallyVerify({ claim: "x", verifierRunners: [confirm(), refute()] })).status, "rejected");
});

// --- autonomous repairer (executor) ---

test("repairer is blocked_not_implemented when no agent is configured", async () => {
  const root = tempRoot();
  const repairer = createAutonomousRepairer({ root });
  const result = await repairer({ attempt: 1, failing: { status: "failed" } });
  assert.equal(result.applied, false);
  assert.match(result.description, /blocked_not_implemented/);
  assert.equal(isAgentConfigured({}), false);
});

test("repairer applies an agent fix only when adversarial verification passes", async () => {
  const root = tempRoot();
  const passing = createAutonomousRepairer({
    root,
    agentRunner: async () => ({ applied: true, description: "patched bar.mjs" }),
    verifierRunners: [confirm(), confirm(), confirm()]
  });
  assert.equal((await passing({ attempt: 1, failing: { status: "failed" } })).applied, true);

  const rejected = createAutonomousRepairer({
    root,
    agentRunner: async () => ({ applied: true, description: "risky patch" }),
    verifierRunners: [refute(), refute(), confirm()]
  });
  const r = await rejected({ attempt: 1, failing: { status: "failed" } });
  assert.equal(r.applied, false);
  assert.match(r.description, /rejected by adversarial verification/);
});

test("end-to-end: the repair loop autonomously heals a failing gate via the executor", async () => {
  const root = tempRoot();
  let fixed = false;
  const repairer = createAutonomousRepairer({
    root,
    diagnose: ({ failing }) => diagnoseFailure({ stderr: failing.stderr || "AssertionError at packages/x.mjs:1:1" }),
    route: () => "tdd-guide",
    agentRunner: async () => {
      fixed = true;
      return { applied: true, description: "applied targeted fix" };
    },
    verifierRunners: [confirm(), confirm(), confirm()]
  });
  const result = await runRepairLoop({
    root,
    runGate: async () => ({ status: fixed ? "passed" : "failed", stderr: "AssertionError at packages/x.mjs:1:1" }),
    repairer,
    maxAttempts: 3
  });
  assert.equal(result.status, "repaired");
  assert.equal(result.repaired, true);
});
