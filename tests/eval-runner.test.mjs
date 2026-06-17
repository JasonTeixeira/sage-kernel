import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { listEvalDefinitions, readLatestEvalReport, runEvalSuite } from "../packages/intelligence/scripts/eval-runner.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("eval runner executes deterministic graders and writes latest report", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-eval-runner-"));
  const evalDir = path.join(workspace, "packages/intelligence/evals");
  const reportDir = path.join(workspace, ".sage-kernel/evals");
  fs.mkdirSync(evalDir, { recursive: true });
  fs.mkdirSync(path.join(workspace, "contracts"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "package.json"), JSON.stringify({ type: "module" }));
  fs.writeFileSync(path.join(workspace, "exists.txt"), "ok\n");
  fs.writeFileSync(path.join(workspace, "schema.json"), "{}\n");
  fs.writeFileSync(path.join(workspace, "target.json"), "{\"ok\":true}\n");
  fs.writeFileSync(path.join(workspace, "contracts/tools.snapshot.json"), JSON.stringify({ tools: [{ name: "kernel.fixture" }] }));
  fs.writeFileSync(path.join(evalDir, "fixture.json"), JSON.stringify({
    id: "eval_fixture",
    name: "Fixture eval",
    scope: "mcp",
    version: 1,
    graders: [
      { id: "command", type: "command", command: "node -e \"process.exit(0)\"" },
      { id: "file", type: "file_exists", path: "exists.txt" },
      { id: "schema", type: "json_schema", schema: "schema.json", path: "target.json" },
      { id: "contract", type: "mcp_contract", path: "contracts/tools.snapshot.json" },
      { id: "coverage", type: "coverage", threshold: 90 }
    ],
    successCriteria: ["Everything passes."]
  }));

  assert.equal(listEvalDefinitions({ root: workspace }).length, 1);
  const report = runEvalSuite({ root: workspace, reportDir });
  assert.equal(report.status, "passed");
  assert.equal(report.summary.total, 1);
  assert.equal(report.evals[0].graders.length, 5);
  assert.equal(fs.existsSync(path.join(reportDir, "latest.json")), true);
  assert.equal(readLatestEvalReport({ root: workspace, reportPath: path.join(reportDir, "latest.json") }).status, "passed");
});

test("eval runner reports failed definitions, graders, selection misses, and missing reports", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-eval-failures-"));
  const evalDir = path.join(workspace, "packages/intelligence/evals");
  fs.mkdirSync(evalDir, { recursive: true });
  fs.writeFileSync(path.join(evalDir, "bad.json"), JSON.stringify({
    id: "eval_bad",
    name: "Bad eval",
    scope: "mcp",
    version: 1,
    graders: [
      { id: "bad_command", type: "command", command: "node -e \"process.exit(3)\"" },
      { id: "missing_file", type: "file_exists", path: "missing.txt" },
      { id: "bad_contract", type: "mcp_contract", path: "missing-contract.json" },
      { id: "escape", type: "file_exists", path: "../outside.txt" }
    ],
    successCriteria: ["This should fail."]
  }));

  const report = runEvalSuite({ root: workspace, writeReport: false });
  assert.equal(report.status, "failed");
  assert.equal(report.evals[0].status, "failed");
  assert.equal(report.evals[0].graders.filter((grader) => grader.status === "failed").length, 4);
  assert.match(report.evals[0].graders.find((grader) => grader.id === "escape").message, /escapes workspace/);

  const miss = runEvalSuite({ root: workspace, ids: ["eval_missing"], writeReport: false });
  assert.equal(miss.status, "failed");
  assert.match(miss.failures.join("\n"), /No matching eval definitions/);

  const missing = readLatestEvalReport({ root: workspace });
  assert.equal(missing.status, "missing");
});

test("eval runner covers malformed contract and json-schema grader failures", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-eval-malformed-"));
  const evalDir = path.join(workspace, "packages/intelligence/evals");
  fs.mkdirSync(evalDir, { recursive: true });
  fs.mkdirSync(path.join(workspace, "contracts"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "schema.json"), "{}\n");
  fs.writeFileSync(path.join(workspace, "bad.json"), "{");
  fs.writeFileSync(path.join(workspace, "contracts/empty.snapshot.json"), JSON.stringify({ tools: [] }));
  fs.writeFileSync(path.join(workspace, "contracts/bad.snapshot.json"), "{");
  fs.writeFileSync(path.join(evalDir, "malformed.json"), JSON.stringify({
    id: "eval_malformed",
    name: "Malformed eval",
    scope: "mcp",
    version: 1,
    graders: [
      { id: "empty_contract", type: "mcp_contract", path: "contracts/empty.snapshot.json" },
      { id: "bad_contract", type: "mcp_contract", path: "contracts/bad.snapshot.json" },
      { id: "bad_json", type: "json_schema", schema: "schema.json", path: "bad.json" },
      { id: "json_escape", type: "json_schema", schema: "../schema.json", path: "bad.json" }
    ],
    successCriteria: ["This should fail cleanly."]
  }));

  const report = runEvalSuite({ root: workspace, writeReport: false });
  assert.equal(report.status, "failed");
  const graders = Object.fromEntries(report.evals[0].graders.map((grader) => [grader.id, grader]));
  assert.equal(graders.empty_contract.status, "failed");
  assert.equal(graders.empty_contract.count, 0);
  assert.equal(graders.bad_contract.status, "failed");
  assert.match(graders.bad_contract.message, /JSON/);
  assert.equal(graders.bad_json.status, "failed");
  assert.match(graders.bad_json.message, /JSON/);
  assert.equal(graders.json_escape.status, "failed");
  assert.match(graders.json_escape.message, /escapes workspace/);
});

test("eval runner reports an empty eval directory", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-eval-empty-"));
  fs.mkdirSync(path.join(workspace, "packages/intelligence/evals"), { recursive: true });
  const report = runEvalSuite({ root: workspace, writeReport: false });
  assert.equal(report.status, "failed");
  assert.match(report.failures.join("\n"), /No eval definitions found/);
});

test("repository eval definitions run individually against real commands", () => {
  const report = runEvalSuite({ root, ids: ["eval_project_workflows"], writeReport: false });
  assert.equal(report.status, "passed");
  assert.equal(report.evals[0].id, "eval_project_workflows");
});
