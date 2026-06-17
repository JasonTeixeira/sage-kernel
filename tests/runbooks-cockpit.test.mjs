import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createAdr, createDailyPlan, createOperatingSnapshot, listRunbooks, runbooksSmoke, validateRunbookData, validateRunbooks } from "../packages/intelligence/runbooks.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("runbooks validate and list real catalog entries", () => {
  const validation = validateRunbooks({ root });
  assert.equal(validation.status, "passed");
  assert.equal(validation.checked.runbooks >= 2, true);
  const runbooks = listRunbooks({ root });
  assert.equal(runbooks.some((runbook) => runbook.id === "runbook_daily_release_readiness"), true);
  assert.equal(runbooks.every((runbook) => runbook.stepCount > 0 && runbook.verificationCount > 0), true);
});

test("runbook validation covers malformed, missing, duplicate, and fallback branches", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-runbooks-"));
  fs.mkdirSync(path.join(workspace, "packages/intelligence/fixtures/valid"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "packages/intelligence/runbooks"), { recursive: true });
  const duplicate = {
    id: "runbook_fixture",
    title: "Fixture",
    risk: "low",
    requiresApproval: false,
    steps: [{ id: "inspect", title: "Inspect", action: "Read state." }],
    verification: ["npm test"]
  };
  fs.writeFileSync(path.join(workspace, "packages/intelligence/fixtures/valid/runbook.json"), JSON.stringify(duplicate));
  fs.writeFileSync(path.join(workspace, "packages/intelligence/runbooks/duplicate.json"), JSON.stringify(duplicate));
  fs.writeFileSync(path.join(workspace, "packages/intelligence/runbooks/broken.json"), "{");

  const listed = listRunbooks({ root: workspace });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, "runbook_fixture");

  const failures = validateRunbookData({
    id: "bad id",
    title: "",
    risk: "extreme",
    requiresApproval: "yes",
    steps: [{ id: "", title: "", action: "" }],
    verification: []
  }, "bad");
  assert.match(failures.join("\n"), /bad.id has invalid format/);
  assert.match(failures.join("\n"), /bad.title must be a non-empty string/);
  assert.match(failures.join("\n"), /bad.risk must be one of/);
  assert.match(failures.join("\n"), /bad.requiresApproval must be boolean/);
  assert.match(failures.join("\n"), /bad.verification must be a non-empty array/);

  const missingArrays = validateRunbookData({
    id: "runbook_missing_arrays",
    title: "Missing arrays",
    risk: "low"
  }, "missing");
  assert.match(missingArrays.join("\n"), /missing.steps must be a non-empty array/);
  assert.match(missingArrays.join("\n"), /missing.verification must be a non-empty array/);

  const emptyWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-runbooks-empty-"));
  const emptyPlan = createDailyPlan({ root: emptyWorkspace, schemaRoot: path.join(emptyWorkspace, "missing-schema") });
  assert.equal(emptyPlan.phase.id, "daily");
  assert.equal(emptyPlan.status, "needs_attention");
  assert.equal(emptyPlan.steps.at(-1).command, "npm run release:check");
  assert.equal(validateRunbooks({ root: emptyWorkspace }).checked.runbooks, 0);

  const invalidWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-runbooks-invalid-"));
  fs.mkdirSync(path.join(invalidWorkspace, "packages/intelligence/runbooks"), { recursive: true });
  fs.writeFileSync(path.join(invalidWorkspace, "packages/intelligence/runbooks/invalid.json"), JSON.stringify({
    id: "not valid",
    title: "",
    risk: "critical",
    steps: [],
    verification: []
  }));
  assert.equal(validateRunbooks({ root: invalidWorkspace }).status, "failed");
  assert.equal(runbooksSmoke({ root: invalidWorkspace }).status, "failed");
});

test("daily plan and operating snapshot include gates, risks, evals, and runbooks", () => {
  const plan = createDailyPlan({ root, objective: "Ship Program 5 safely." });
  assert.equal(plan.objective, "Ship Program 5 safely.");
  assert.equal(plan.steps.length >= 4, true);
  assert.equal(plan.gates.includes("npm run test:coverage"), true);
  assert.equal(plan.risks.some((risk) => risk.id === "risk_unverified_change"), true);

  const snapshot = createOperatingSnapshot({ root, objective: "Inspect cockpit." });
  assert.equal(snapshot.todayPlan.objective, "Inspect cockpit.");
  assert.equal(snapshot.runbooks.length > 0, true);
  assert.equal(typeof snapshot.evals.status, "string");
  assert.equal(snapshot.experiments.id.startsWith("exp_"), true);
});

test("ADR generation returns markdown and writes only inside the root", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-adr-"));
  const adr = createAdr({
    title: "Use runbooks",
    context: "Daily operating work needs repeatability.",
    decision: "Store validated runbooks in the repo.",
    consequences: "Daily planning can cite real gates.",
    out: "docs/adr/use-runbooks.md"
  }, { root: workspace });

  assert.equal(adr.id, "adr_use-runbooks");
  assert.equal(adr.path, "docs/adr/use-runbooks.md");
  assert.match(adr.markdown, /# ADR: Use runbooks/);
  assert.equal(fs.existsSync(path.join(workspace, adr.path)), true);
  assert.throws(() => createAdr({ title: "Bad", out: "../bad.md" }, { root: workspace }), /outside the project root/);
});

test("runbooks smoke and CLI scripts prove daily cockpit path", () => {
  const smoke = runbooksSmoke({ root });
  assert.equal(smoke.status, "passed");

  for (const script of ["runbooks:validate", "runbooks:smoke", "plan:day"]) {
    const result = spawnSync("npm", ["run", script], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /passed|Today|plan_|runbooks/i);
  }

  const invalid = spawnSync("node", ["packages/intelligence/scripts/plan-day.mjs", "--unknown"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Unknown plan:day argument/);

  const invalidWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-runbooks-cli-invalid-"));
  fs.mkdirSync(path.join(invalidWorkspace, "packages/intelligence/runbooks"), { recursive: true });
  fs.writeFileSync(path.join(invalidWorkspace, "packages/intelligence/runbooks/invalid.json"), JSON.stringify({
    id: "bad",
    title: "",
    risk: "wrong",
    steps: [],
    verification: []
  }));
  const validateScript = spawnSync("node", [path.join(root, "packages/intelligence/scripts/runbooks-validate.mjs")], {
    cwd: invalidWorkspace,
    encoding: "utf8"
  });
  assert.notEqual(validateScript.status, 0);
  assert.match(validateScript.stdout, /failed/);
  const smokeScript = spawnSync("node", [path.join(root, "packages/intelligence/scripts/runbooks-smoke.mjs")], {
    cwd: invalidWorkspace,
    encoding: "utf8"
  });
  assert.notEqual(smokeScript.status, 0);
  assert.match(smokeScript.stdout, /failed/);
});
