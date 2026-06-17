import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createAdr, createDailyPlan, createOperatingSnapshot, executeRunbookStep, listRunbooks, runbooksSmoke, validateRunbookData, validateRunbooks } from "../packages/intelligence/runbooks.mjs";

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
    steps: [{ id: "inspect", title: "Inspect", action: "Read state.", timeoutMs: 1000 }],
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
  assert.match(validateRunbookData({
    id: "runbook_bad_step",
    title: "Bad step",
    risk: "low",
    steps: [{ id: "bad", title: "Bad", action: "execute_command", command: "", timeoutMs: 1, rollback: { description: "" } }],
    verification: ["npm test"]
  }, "badStep").join("\n"), /timeoutMs must be an integer between 1000 and 300000/);
  assert.match(validateRunbookData({
    id: "runbook_bad_rollback",
    title: "Bad rollback",
    risk: "medium",
    steps: [{ id: "bad", title: "Bad", action: "execute_command", rollback: "manual" }],
    verification: ["npm test"]
  }, "badRollback").join("\n"), /rollback must be an object/);
  assert.match(validateRunbookData({
    id: "runbook_bad_rollback_command",
    title: "Bad rollback command",
    risk: "medium",
    steps: [{ id: "bad", title: "Bad", action: "execute_command", rollback: { description: "undo", command: "" } }],
    verification: ["npm test"]
  }, "badRollbackCommand").join("\n"), /rollback.command must be a non-empty string/);

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

  const defaultAdr = createAdr({ title: "!!!" }, { root: workspace });
  assert.equal(defaultAdr.id, "adr_decision");
  assert.equal(defaultAdr.status, "proposed");
  assert.equal(defaultAdr.path, null);
  assert.match(defaultAdr.markdown, /Context not provided/);
});

test("runbook execution plans, executes allowlisted commands, audits results, and blocks unsafe commands", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-runbook-exec-"));
  for (const dir of ["packages/intelligence/fixtures/valid", "packages/intelligence/runbooks", "packages/db"]) {
    fs.mkdirSync(path.join(workspace, dir), { recursive: true });
  }
  fs.copyFileSync(path.join(root, "packages/db/schema.sql"), path.join(workspace, "packages/db/schema.sql"));
  fs.copyFileSync(path.join(root, "packages/intelligence/fixtures/valid/runbook.json"), path.join(workspace, "packages/intelligence/fixtures/valid/runbook.json"));

  const planned = executeRunbookStep({
    runbook: "runbook_release_verification",
    step: "local_release_check"
  }, { root: workspace, schemaRoot: root });
  assert.equal(planned.status, "planned");
  assert.equal(planned.approvalRequired, true);
  assert.equal(planned.rollback.required, true);
  assert.match(planned.auditId, /^audit_/);

  const executed = executeRunbookStep({
    runbook: "runbook_release_verification",
    step: "local_release_check",
    dryRun: false
  }, {
    root: workspace,
    schemaRoot: root,
    runner: () => ({ status: 0, stdout: "release ok", stderr: "" })
  });
  assert.equal(executed.status, "passed");
  assert.equal(executed.exitCode, 0);
  assert.equal(executed.rollback.required, true);

  const failed = executeRunbookStep({
    runbook: "runbook_release_verification",
    step: "local_release_check",
    dryRun: false
  }, {
    root: workspace,
    schemaRoot: root,
    runner: () => ({ status: 12, stdout: "x".repeat(9005), stderr: "failed runbook step" })
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.exitCode, 12);
  assert.equal(failed.stdout.length, 8000);
  assert.equal(failed.stderr, "failed runbook step");

  assert.throws(() => executeRunbookStep({}, { root: workspace, schemaRoot: root }), /requires input.runbook and input.step/);
  assert.throws(() => executeRunbookStep({ runbook: "missing", step: "local_release_check" }, { root: workspace, schemaRoot: root }), /Unknown runbook/);
  assert.throws(() => executeRunbookStep({ runbook: "runbook_release_verification", step: "missing" }, { root: workspace, schemaRoot: root }), /Unknown runbook step/);
  assert.throws(() => executeRunbookStep({
    runbook: "runbook_release_verification",
    step: "local_release_check",
    timeoutMs: 1
  }, { root: workspace, schemaRoot: root }), /timeout must be between/);

  const unsafeRunbook = {
    id: "runbook_unsafe",
    title: "Unsafe",
    risk: "critical",
    requiresApproval: true,
    steps: [{ id: "rm", title: "Remove", action: "execute_command", command: "rm -rf .", expected: "Never runs." }],
    verification: ["npm test"]
  };
  fs.writeFileSync(path.join(workspace, "packages/intelligence/runbooks/unsafe.json"), JSON.stringify(unsafeRunbook));
  assert.throws(() => executeRunbookStep({
    runbook: "runbook_unsafe",
    step: "rm",
    dryRun: false
  }, { root: workspace, schemaRoot: root }), /not allowlisted/);

  const gitRunbook = {
    id: "runbook_git_status",
    title: "Git status",
    risk: "low",
    requiresApproval: true,
    steps: [{ id: "status", title: "Status", action: "execute_command", command: "git status --short", expected: "Git status command exits cleanly." }],
    verification: ["git status --short"]
  };
  fs.writeFileSync(path.join(workspace, "packages/intelligence/runbooks/git-status.json"), JSON.stringify(gitRunbook));
  assert.equal(spawnSync("git", ["init"], { cwd: workspace, encoding: "utf8" }).status, 0);
  const noRollbackPlan = executeRunbookStep({ runbook: "runbook_git_status", step: "status" }, { root: workspace, schemaRoot: root });
  assert.equal(noRollbackPlan.rollback.required, false);
  const realCommand = executeRunbookStep({
    runbook: "runbook_git_status",
    step: "status",
    dryRun: false
  }, { root: workspace, schemaRoot: root });
  assert.equal(realCommand.status, "passed");

  const quietCommandRunbook = {
    id: "runbook_quiet",
    title: "Quiet command",
    risk: "low",
    requiresApproval: true,
    steps: [{ id: "status", title: "Status", action: "execute_command", command: "git status --short" }],
    verification: ["git status --short"]
  };
  fs.writeFileSync(path.join(workspace, "packages/intelligence/runbooks/quiet.json"), JSON.stringify(quietCommandRunbook));
  const quiet = executeRunbookStep({
    runbook: "runbook_quiet",
    step: "status",
    dryRun: false
  }, { root: workspace, schemaRoot: root });
  assert.equal(quiet.status, "passed");
  assert.equal(quiet.command, "git status --short");

  const cli = spawnSync("node", [path.join(root, "packages/intelligence/scripts/runbooks-execute.mjs"), "--runbook=runbook_release_verification", "--step=local_release_check"], {
    cwd: workspace,
    encoding: "utf8"
  });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.stdout, /planned/);
  const invalidCli = spawnSync("node", [path.join(root, "packages/intelligence/scripts/runbooks-execute.mjs"), "--bad"], {
    cwd: workspace,
    encoding: "utf8"
  });
  assert.notEqual(invalidCli.status, 0);
  assert.match(invalidCli.stderr, /Unknown runbooks:execute argument/);

  const failingWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-runbook-cli-fail-"));
  for (const dir of ["packages/intelligence/fixtures/valid", "packages/intelligence/runbooks", "packages/db"]) {
    fs.mkdirSync(path.join(failingWorkspace, dir), { recursive: true });
  }
  fs.copyFileSync(path.join(root, "packages/db/schema.sql"), path.join(failingWorkspace, "packages/db/schema.sql"));
  fs.writeFileSync(path.join(failingWorkspace, "packages/intelligence/runbooks/git-status.json"), JSON.stringify(gitRunbook));
  const failingCli = spawnSync("node", [
    path.join(root, "packages/intelligence/scripts/runbooks-execute.mjs"),
    "--runbook=runbook_git_status",
    "--step=status",
    "--execute",
    "--timeout-ms=5000"
  ], {
    cwd: failingWorkspace,
    encoding: "utf8"
  });
  assert.notEqual(failingCli.status, 0);
  assert.match(failingCli.stdout, /"status": "failed"/);
});

test("runbooks smoke and CLI scripts prove daily cockpit path", () => {
  const smoke = runbooksSmoke({ root });
  assert.equal(smoke.status, "passed");

  for (const args of [
    ["run", "runbooks:validate"],
    ["run", "runbooks:smoke"],
    ["run", "plan:day"],
    ["run", "runbooks:execute", "--", "--runbook=runbook_release_verification", "--step=local_release_check"]
  ]) {
    const result = spawnSync("npm", args, { cwd: root, encoding: "utf8" });
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
