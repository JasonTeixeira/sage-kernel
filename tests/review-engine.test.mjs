import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  auditArchitecture,
  auditCleanCode,
  auditSecurity,
  auditTests,
  createReleaseProof,
  createReviewScore,
  formatReviewOutput,
  inspectRepository
} from "../packages/review/review-engine.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";
import { validateReviewReport } from "../packages/review/review-report.mjs";

const root = path.resolve(import.meta.dirname, "..");

function run(args, options = {}) {
  return spawnSync(args[0], args.slice(1), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
    ...options
  });
}

test("repo inspection detects Sage Kernel surfaces and senior review readiness", () => {
  const inspection = inspectRepository({ root, projectPath: "." });
  assert.equal(inspection.project.name, "sage-kernel");
  assert.equal(inspection.surfaces.mcp, true);
  assert.equal(inspection.surfaces.dashboard, true);
  assert.equal(inspection.surfaces.agents, true);
  assert.equal(inspection.surfaces.review, true);
  assert.equal(inspection.counts.tests > 20, true);
  assert.equal(inspection.scripts.includes("test:coverage"), true);
  assert.equal(inspection.docs.includes("SECURITY.md"), true);
  assert.equal(inspection.ci.includes(".github/workflows/ci.yml"), true);

  const score = createReviewScore({ root, projectPath: "." });
  assert.equal(validateReviewReport(score.report).status, "passed");
  assert.equal(score.report.categories.length, 5);
  assert.equal(score.report.evidence.some((item) => item.ref === "npm test"), true);
});

test("review engine scores weak fixture repositories with concrete findings", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "sage-review-weak-repo-"));
  fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({
    name: "weak-app",
    scripts: {
      start: "node index.js"
    }
  }));
  fs.writeFileSync(path.join(fixture, "index.js"), "console.log('no tests');\n");

  process.env.SAGE_REVIEW_ALLOWED_ROOTS = fixture;
  try {
    const architecture = auditArchitecture({ root, projectPath: fixture });
    const cleanCode = auditCleanCode({ root, projectPath: fixture });
    const tests = auditTests({ root, projectPath: fixture });
    const security = auditSecurity({ root, projectPath: fixture });
    const proof = createReleaseProof({ root, projectPath: fixture });

    assert.equal(architecture.score < 90, true);
    assert.equal(cleanCode.score < 100, true);
    assert.equal(tests.findings.some((finding) => /coverage/i.test(finding.message)), true);
    assert.equal(security.findings.some((finding) => /SECURITY\.md/.test(finding.message)), true);
    assert.equal(proof.status, "needs_work");
    assert.equal(proof.report.remaining.length > 0, true);
  } finally {
    delete process.env.SAGE_REVIEW_ALLOWED_ROOTS;
  }
});

test("review engine handles malformed repositories and human output paths", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "sage-review-edge-repo-"));
  fs.writeFileSync(path.join(fixture, "package.json"), "{not-json");
  fs.writeFileSync(path.join(fixture, "README.md"), "# Edge Repo\n");
  try {
    fs.symlinkSync(path.join(fixture, "missing-target.js"), path.join(fixture, "broken.js"));
  } catch {
    fs.writeFileSync(path.join(fixture, "broken.js"), "console.log('fallback');\n");
  }

  process.env.SAGE_REVIEW_ALLOWED_ROOTS = fixture;
  try {
    const inspection = inspectRepository({ root, projectPath: fixture });
    assert.equal(inspection.project.name, path.basename(fixture));
    assert.equal(inspection.project.package, null);

    const canonicalFixture = fs.realpathSync.native(fixture);
    const missingInspection = inspectRepository({ root: canonicalFixture, projectPath: "missing-review-root" });
    assert.equal(missingInspection.project.name, "missing-review-root");
    assert.equal(missingInspection.counts.files, 0);

    const cleanCode = auditCleanCode({ root, projectPath: fixture });
    assert.equal(typeof cleanCode.score, "number");

    const score = createReviewScore({ root, projectPath: fixture });
    assert.match(formatReviewOutput(score), /^Review /);
    assert.match(formatReviewOutput(inspection), /^Project /);
    assert.match(formatReviewOutput({ ok: true }), /"ok": true/);
  } finally {
    delete process.env.SAGE_REVIEW_ALLOWED_ROOTS;
  }
});

test("review CLI exposes inspect, score, and prove JSON flows", () => {
  const inspect = run(["node", "bin/sage.mjs", "review", "inspect", ".", "--json"]);
  assert.equal(inspect.status, 0, inspect.stderr || inspect.stdout);
  const inspection = JSON.parse(inspect.stdout);
  assert.equal(inspection.project.name, "sage-kernel");
  assert.equal(inspection.surfaces.mcp, true);

  const score = run(["node", "bin/sage.mjs", "review", "score", ".", "--json"]);
  assert.equal(score.status, 0, score.stderr || score.stdout);
  const scored = JSON.parse(score.stdout);
  assert.equal(validateReviewReport(scored.report).status, "passed");

  const prove = run(["node", "bin/sage.mjs", "review", "prove", ".", "--json"]);
  assert.equal(prove.status, 0, prove.stderr || prove.stdout);
  const proof = JSON.parse(prove.stdout);
  assert.equal(proof.report.evidence.some((item) => item.ref === "npm run release:check"), true);
});

test("review MCP tools inspect, score, prove, and enforce project path boundaries", async () => {
  const inspection = await callKernelTool(root, "kernel.review.inspect_repo", { projectPath: "." });
  assert.equal(inspection.project.name, "sage-kernel");

  const architecture = await callKernelTool(root, "kernel.review.architecture_audit", { projectPath: "." });
  assert.equal(architecture.id, "architecture");

  const cleanCode = await callKernelTool(root, "kernel.review.clean_code_audit", { projectPath: "." });
  assert.equal(cleanCode.id, "clean_code");

  const tests = await callKernelTool(root, "kernel.review.test_audit", { projectPath: "." });
  assert.equal(tests.id, "testing");

  const security = await callKernelTool(root, "kernel.review.security_audit", { projectPath: "." });
  assert.equal(security.id, "security");

  const score = await callKernelTool(root, "kernel.review.quality_score", { projectPath: "." });
  assert.equal(validateReviewReport(score.report).status, "passed");

  const proof = await callKernelTool(root, "kernel.review.release_proof", { projectPath: "." });
  assert.equal(proof.report.evidence.some((item) => item.kind === "command"), true);

  await assert.rejects(
    () => callKernelTool(root, "kernel.review.inspect_repo", { projectPath: "/tmp" }),
    /outside allowed review roots/
  );
});
