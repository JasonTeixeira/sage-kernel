import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  createReviewReport,
  scoreReviewReport,
  validateReviewReport,
  validateReviewSystem
} from "../packages/review/review-report.mjs";
import { runReviewValidateCli } from "../packages/review/scripts/review-validate.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("review report system validates schema, fixture, categories, and score contract", () => {
  const system = validateReviewSystem({ root });
  assert.equal(system.status, "passed");
  assert.equal(system.checked.schemas, 1);
  assert.equal(system.checked.fixtures, 1);
  assert.deepEqual(system.failures, []);

  const fixture = JSON.parse(fs.readFileSync(path.join(root, "packages/review/fixtures/valid/review-report.json"), "utf8"));
  const report = validateReviewReport(fixture);
  assert.equal(report.status, "passed");
  assert.equal(scoreReviewReport(fixture).score, 92);
  assert.equal(scoreReviewReport(fixture).status, "passed");
});

test("review report creation produces senior-grade evidence categories", () => {
  const report = createReviewReport({
    project: { name: "fixture-app", root: "/tmp/fixture-app" },
    objective: "Prove release readiness",
    categories: [
      { id: "architecture", score: 90, findings: [] },
      { id: "clean_code", score: 88, findings: [{ severity: "medium", message: "large module", evidence: "src/app.js" }] },
      { id: "testing", score: 95, findings: [] },
      { id: "security", score: 91, findings: [] },
      { id: "release", score: 94, findings: [] }
    ],
    evidence: [
      { kind: "command", ref: "npm test", status: "passed" },
      { kind: "command", ref: "npm run test:coverage", status: "passed" }
    ],
    remaining: ["Split large module after release."]
  });

  assert.equal(report.status, "needs_work");
  assert.equal(report.score, 92);
  assert.equal(report.categories.length, 5);
  assert.equal(report.evidence.length, 2);
  assert.equal(validateReviewReport(report).status, "passed");
});

test("review report validation rejects weak evidence, missing categories, and unsafe score shapes", () => {
  const invalid = createReviewReport({
    project: { name: "bad-app", root: "/tmp/bad-app" },
    objective: "Audit",
    categories: [
      { id: "architecture", score: 101, findings: [] },
      { id: "testing", score: 70, findings: [{ severity: "critical", message: "", evidence: "" }] }
    ],
    evidence: [{ kind: "command", ref: "", status: "unknown" }]
  });

  const validation = validateReviewReport(invalid);
  assert.equal(validation.status, "failed");
  assert.match(validation.failures.join("\n"), /missing category: clean_code/);
  assert.match(validation.failures.join("\n"), /categories\[0]\.score must be between 0 and 100/);
  assert.match(validation.failures.join("\n"), /findings\[0]\.message must be a non-empty string/);
  assert.match(validation.failures.join("\n"), /evidence\[0]\.status must be one of/);
});

test("review report validation covers malformed nested arrays and empty score inputs", () => {
  const validation = validateReviewReport({
    id: "review_bad_nested",
    version: 1,
    generatedAt: "2026-06-17T00:00:00.000Z",
    project: { name: "bad", root: "." },
    objective: "Cover malformed nested arrays",
    status: "failed",
    score: 0,
    categories: [
      { id: "architecture", score: 80, findings: "not-array" },
      { id: "clean_code", score: 80, findings: [] },
      { id: "testing", score: 80, findings: [] },
      { id: "security", score: 80, findings: [] },
      { id: "release", score: 80, findings: [] }
    ],
    evidence: [],
    remaining: "not-array"
  });
  assert.equal(validation.status, "failed");
  assert.match(validation.failures.join("\n"), /categories\[0]\.findings must be an array/);
  assert.match(validation.failures.join("\n"), /evidence must be a non-empty array/);
  assert.match(validation.failures.join("\n"), /remaining must be an array/);
  assert.deepEqual(scoreReviewReport({ categories: [] }), { score: 0, status: "passed" });
});

test("review system validator and CLI catch malformed schema and fixture states", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-review-system-"));
  copyDir(path.join(root, "packages/review"), path.join(workspace, "packages/review"));

  fs.writeFileSync(path.join(workspace, "packages/review/schemas/review-report.schema.json"), JSON.stringify({
    "$schema": "https://wrong.example/schema",
    "$id": "wrong",
    "type": "array",
    "additionalProperties": true,
    "required": []
  }));
  fs.writeFileSync(path.join(workspace, "packages/review/fixtures/valid/review-report.json"), JSON.stringify({}));
  const failed = validateReviewSystem({ root: workspace });
  assert.equal(failed.status, "failed");
  assert.match(failed.failures.join("\n"), /must use JSON Schema draft 2020-12/);
  assert.match(failed.failures.join("\n"), /root type must be object/);
  assert.match(failed.failures.join("\n"), /project.name must be a non-empty string/);

  const cli = spawnSync("node", ["packages/review/scripts/review-validate.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.equal(JSON.parse(cli.stdout).status, "passed");
});

test("review system validator reports unreadable or malformed contract files", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-review-broken-json-"));
  fs.mkdirSync(path.join(workspace, "packages/review/schemas"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "packages/review/fixtures/valid"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "packages/review/schemas/review-report.schema.json"), "{ nope");
  const result = validateReviewSystem({ root: workspace });
  assert.equal(result.status, "failed");
  assert.equal(result.checked.schemas, 0);
  assert.match(result.failures.join("\n"), /Invalid review-report\.schema\.json/);
  assert.match(result.failures.join("\n"), /Invalid review-report\.json/);
});

test("review validate direct CLI runner covers success and failure exits", () => {
  const lines = [];
  const passed = runReviewValidateCli({
    root,
    stdout: (line) => lines.push(line),
    validate: () => ({ status: "passed", checked: { schemas: 1 }, failures: [] })
  });
  assert.equal(passed, 0);
  assert.equal(JSON.parse(lines[0]).status, "passed");

  const failed = runReviewValidateCli({
    root,
    stdout: () => {},
    validate: () => ({ status: "failed", checked: { schemas: 0 }, failures: ["broken"] })
  });
  assert.equal(failed, 1);
});

function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}
