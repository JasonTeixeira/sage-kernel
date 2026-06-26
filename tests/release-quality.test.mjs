import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { createQaReport, parseMode, runQaCli, staticChecks } from "../packages/qa/scripts/qa-runner.mjs";
import { createDogfoodReport, inspectRepo, sourceRootForCatalog } from "../scripts/dogfood-production-audit.mjs";
import { createDashboardStressReport, parseDashboardStressArgs } from "../scripts/stress-dashboard.mjs";
import { createQueueStressReport, parseQueueStressArgs } from "../scripts/stress-queue.mjs";
import { createSoakReport, parseSoakArgs, runMcpSmoke } from "../scripts/soak-runner.mjs";
import { createWarehouseSummary } from "../packages/ai-warehouse/scripts/warehouse-summary.mjs";
import { validateIntelligence } from "../packages/intelligence/scripts/validate-intelligence.mjs";
import { validateMarkdownLinks, validatePublicSurface } from "../scripts/validate-public-surface.mjs";
import { validateReleaseProvenance } from "../scripts/validate-release-provenance.mjs";
import { evaluateCriticalCoverage, parseCoverageReport, runCoverageCriticalGate } from "../scripts/coverage-critical-gate.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("package metadata is ready for public OSS distribution", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

  assert.equal(pkg.private, undefined);
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.repository.type, "git");
  assert.equal(pkg.publishConfig.access, "public");
  assert.equal(pkg.publishConfig.provenance, true);
  assert.equal(Array.isArray(pkg.files), true);
  assert.equal(pkg.files.includes("assets"), true);
  assert.equal(pkg.scripts["stress:queue"], "node scripts/stress-queue.mjs");
  assert.equal(pkg.scripts["stress:dashboard"], "node scripts/stress-dashboard.mjs");
  assert.equal(pkg.scripts["soak:run"], "node scripts/soak-runner.mjs");
  assert.equal(pkg.scripts["soak:quick"], "node scripts/soak-runner.mjs --profile=quick");
  assert.equal(pkg.scripts["intelligence:validate"], "node packages/intelligence/scripts/validate-intelligence.mjs");
  assert.equal(pkg.scripts["eval:validate"], "node packages/intelligence/scripts/validate-intelligence.mjs");
  assert.equal(pkg.scripts["eval:run"], "node packages/intelligence/scripts/eval-runner.mjs");
  assert.equal(pkg.scripts["eval:report"], "node packages/intelligence/scripts/eval-report.mjs");
  assert.equal(pkg.scripts["memory:smoke"], "node packages/intelligence/scripts/memory-smoke.mjs");
  assert.equal(pkg.scripts["memory:validate"], "node packages/intelligence/scripts/validate-intelligence.mjs");
  assert.equal(pkg.scripts["memory:state"], "node packages/intelligence/scripts/project-state.mjs");
  assert.equal(pkg.scripts["semantic:validate"], "node packages/intelligence/scripts/validate-intelligence.mjs");
  assert.equal(pkg.scripts["semantic:smoke"], "node packages/intelligence/scripts/semantic-smoke.mjs");
  assert.equal(pkg.scripts["semantic:index"], "node packages/intelligence/scripts/semantic-index.mjs");
  assert.equal(pkg.scripts["semantic:search"], "node packages/intelligence/scripts/semantic-search.mjs");
  assert.equal(pkg.scripts["adapters:validate"], "node packages/intelligence/scripts/adapters-validate.mjs");
  assert.equal(pkg.scripts["adapters:list"], "node packages/intelligence/scripts/adapters-list.mjs");
  assert.equal(pkg.scripts["adapters:smoke"], "node packages/intelligence/scripts/adapters-smoke.mjs");
  assert.equal(pkg.scripts["runbooks:validate"], "node packages/intelligence/scripts/runbooks-validate.mjs");
  assert.equal(pkg.scripts["runbooks:smoke"], "node packages/intelligence/scripts/runbooks-smoke.mjs");
  assert.equal(pkg.scripts["runbooks:execute"], "node packages/intelligence/scripts/runbooks-execute.mjs");
  assert.equal(pkg.scripts["plan:day"], "node packages/intelligence/scripts/plan-day.mjs");
  assert.equal(pkg.scripts["adr:generate"], "node packages/intelligence/scripts/adr-generate.mjs");
  // Enforced coverage floor (wired into release:check). Branch/function targets
  // are the honest current floor and ratchet upward; lines holds at 98.
  assert.match(pkg.scripts["test:coverage"], /--test-coverage-lines=98/);
  assert.match(pkg.scripts["test:coverage"], /--test-coverage-branches=86/);
  assert.match(pkg.scripts["test:coverage"], /--test-coverage-functions=96/);
  assert.equal(pkg.scripts["coverage:critical"], "node scripts/coverage-critical-gate.mjs");
  assert.equal(pkg.scripts["release:check"], "node scripts/release-check.mjs");
  assert.equal(pkg.scripts["release:provenance"], "node scripts/validate-release-provenance.mjs");
  assert.equal(pkg.scripts["public:validate"], "node scripts/validate-public-surface.mjs");
  assert.equal(pkg.scripts["verify:fresh-install"], "node scripts/verify-fresh-install.mjs");
  assert.equal(pkg.scripts["dashboard:e2e"], "node scripts/dashboard-e2e.mjs");
  assert.equal(pkg.scripts["postgres:integration"], "node --test tests/postgres-integration.test.mjs");

  for (const file of [
    "LICENSE",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    "CHANGELOG.md",
    ".github/workflows/ci.yml",
    ".github/workflows/release.yml",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/ISSUE_TEMPLATE/bug_report.md",
    ".github/ISSUE_TEMPLATE/feature_request.md",
    ".github/ISSUE_TEMPLATE/quality_gate.md",
    ".github/ISSUE_TEMPLATE/mcp_tool_request.md",
    ".github/ISSUE_TEMPLATE/template_request.md",
    "docs/SECURITY_MODEL.md",
    "docs/QUALITY_RATCHET.md",
    "docs/ROADMAP.md",
    "docs/RELEASE_PROOF.md",
    "docs/RELEASE_PROCESS.md",
    "assets/sage-kernel-architecture.svg",
    "assets/sage-kernel-workflow.svg",
    "assets/sage-kernel-control-loop.svg",
    "docs/DEMO_ASSETS.md",
    "examples/claude-desktop.config.json",
    "examples/codex-mcp.config.toml",
    "docker-compose.postgres.yml",
    "packages/intelligence/scripts/validate-intelligence.mjs",
    "packages/intelligence/scripts/semantic-smoke.mjs",
    "packages/intelligence/scripts/adapters-smoke.mjs",
    "packages/intelligence/adapters.mjs",
    "packages/intelligence/adapters/optional-adapters.json",
    "packages/intelligence/scripts/runbooks-smoke.mjs",
    "packages/intelligence/scripts/runbooks-execute.mjs",
    "packages/intelligence/semantic-code.mjs",
    "packages/intelligence/runbooks.mjs",
    "packages/intelligence/runbooks/release-readiness.json",
    "packages/intelligence/schemas/memory-record.schema.json",
    "packages/intelligence/schemas/eval-definition.schema.json",
    "packages/intelligence/schemas/experiment-run.schema.json",
    "packages/intelligence/schemas/runbook.schema.json",
    "packages/intelligence/schemas/semantic-adapter.schema.json",
    "scripts/coverage-critical-gate.mjs",
    "scripts/release-check.mjs",
    "scripts/validate-release-provenance.mjs",
    "scripts/verify-fresh-install.mjs",
    "scripts/dashboard-e2e.mjs",
    "tests/postgres-integration.test.mjs"
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} missing`);
  }

  const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /npm run test:coverage/);
  assert.match(ci, /RUNNER_TEMP\/sage-coverage-output\.txt/);
  assert.match(ci, /npm run coverage:critical -- "\$RUNNER_TEMP\/sage-coverage-output\.txt"/);
  assert.match(ci, /npm run public:validate/);
  assert.match(ci, /Postgres Integration/);
  assert.match(ci, /Fresh Install Verification/);
  assert.match(ci, /SAGE_RUN_POSTGRES_TESTS/);
  assert.match(ci, /npm run verify:fresh-install/);

  const release = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
  assert.match(release, /id-token:\s*write/);
  assert.match(release, /node-version:\s*22\.14\.0/);
  assert.match(release, /package-manager-cache:\s*false/);
  assert.match(release, /npm install -g npm@\^11\.10\.0/);
  assert.match(release, /npm run verify:fresh-install/);
  assert.match(release, /npm run release:check/);
  assert.match(release, /npm publish --provenance --access public/);

  const securityModel = fs.readFileSync(path.join(root, "docs/SECURITY_MODEL.md"), "utf8");
  assert.match(securityModel, /Approval Rules/);
  assert.match(securityModel, /Filesystem Rules/);
  assert.match(securityModel, /Secret Handling/);
});

test("critical coverage ratchet parses coverage output and fails regressions", () => {
  const sample = [
    "# file | line % | branch % | funcs % | uncovered lines",
    "# apps |        |        |        |",
    "#  dashboard |        |        |        |",
    "#   server.mjs | 100.00 | 91.03 | 100.00 |",
    "# packages |        |        |        |",
    "#  db |        |        |        |",
    "#   adapter.mjs | 99.29 | 89.84 | 100.00 |",
    "# scripts |        |        |        |",
    "#  soak-runner.mjs | 100.00 | 95.35 | 100.00 |"
  ].join("\n");
  const rows = parseCoverageReport(sample);
  assert.equal(rows.get("apps/dashboard/server.mjs").branchPct, 91.03);

  const passed = evaluateCriticalCoverage(sample, {
    "apps/dashboard/server.mjs": 91,
    "packages/db/adapter.mjs": 89,
    "scripts/soak-runner.mjs": 95
  });
  assert.equal(passed.status, "passed");
  assert.equal(passed.checks.find((check) => check.file === "packages/db/adapter.mjs").targetGap > 0, true);

  const failed = evaluateCriticalCoverage(sample, {
    "apps/dashboard/server.mjs": 98,
    "missing.mjs": 1
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.checks.find((check) => check.file === "missing.mjs").branchPct, null);

  const reportPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sage-coverage-gate-")), "coverage.txt");
  fs.writeFileSync(reportPath, sample);
  const lines = [];
  assert.equal(runCoverageCriticalGate([reportPath], {
    floors: { "apps/dashboard/server.mjs": 91 },
    stdout: (line) => lines.push(line)
  }), 0);
  assert.equal(JSON.parse(lines[0]).status, "passed");
  assert.throws(() => runCoverageCriticalGate([], { stdout: () => {} }), /Usage/);
});

test("intelligence contracts validate fixtures and reject unsafe shapes", () => {
  const passing = validateIntelligence({ root });
  assert.equal(passing.status, "passed");
  assert.equal(passing.checked.schemas, 5);
  assert.equal(passing.checked.fixtures, 5);
  assert.equal(passing.checked.evals >= 17, true);
  assert.deepEqual(passing.failures, []);

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-intelligence-"));
  copyDir(path.join(root, "packages/intelligence"), path.join(workspace, "packages/intelligence"));
  const fixtureDir = path.join(workspace, "packages/intelligence/test-fixtures/valid");

  fs.writeFileSync(path.join(fixtureDir, "memory-record.json"), JSON.stringify({
    id: "bad",
    projectId: "",
    kind: "rumor",
    source: "agent",
    actor: "",
    confidence: 2,
    observedAt: "not-a-date",
    content: { summary: "" },
    provenance: { evidenceType: "unknown", evidenceRef: "" }
  }));
  let failures = validateIntelligence({ root: workspace }).failures.join("\n");
  assert.match(failures, /memory-record\.json\.id has invalid format/);
  assert.match(failures, /memory-record\.json\.confidence must be a number between 0 and 1/);
  assert.match(failures, /memory-record\.json\.observedAt must be a valid date-time/);

  fs.writeFileSync(path.join(fixtureDir, "eval-definition.json"), JSON.stringify({
    id: "eval_bad",
    name: "Bad eval",
    scope: "release",
    version: 1,
    graders: [{ id: "coverage", type: "coverage", threshold: 120 }],
    successCriteria: []
  }));
  failures = validateIntelligence({ root: workspace }).failures.join("\n");
  assert.match(failures, /eval-definition\.json\.graders\[0]\.threshold must be a number between 0 and 100/);
  assert.match(failures, /eval-definition\.json\.successCriteria must contain at least 1 item/);

  fs.writeFileSync(path.join(fixtureDir, "semantic-adapter.json"), JSON.stringify({
    id: "semantic_bad",
    name: "Bad adapter",
    mode: "mcp",
    status: "available",
    capabilities: ["apply_refactor"],
    mutationPolicy: "read_only"
  }));
  failures = validateIntelligence({ root: workspace }).failures.join("\n");
  assert.match(failures, /semantic-adapter\.json\.mutationPolicy must be approval_required when apply_refactor is enabled/);

  fs.writeFileSync(path.join(workspace, "packages/intelligence/schemas/runbook.schema.json"), JSON.stringify({
    "$schema": "https://example.com/wrong",
    "$id": "wrong",
    "type": "array",
    "additionalProperties": true,
    "required": []
  }));
  failures = validateIntelligence({ root: workspace }).failures.join("\n");
  assert.match(failures, /runbook\.schema\.json must use JSON Schema draft 2020-12/);
  assert.match(failures, /runbook\.schema\.json must use the canonical intelligence schema id/);
  assert.match(failures, /runbook\.schema\.json root type must be object/);
  assert.match(failures, /runbook\.schema\.json must disallow unknown root properties/);
  assert.match(failures, /runbook\.schema\.json must define required fields/);
  assert.match(failures, /runbook\.schema\.json must define properties/);

  fs.writeFileSync(path.join(fixtureDir, "experiment-run.json"), JSON.stringify({
    id: "bad",
    hypothesis: "",
    status: "unknown",
    startedAt: "later",
    endedAt: "also-later",
    limits: {
      maxIterations: 0,
      maxRuntimeSeconds: 0,
      allowMutation: "yes"
    },
    evaluation: {
      command: "",
      metric: ""
    },
    decision: {
      outcome: "maybe"
    }
  }));
  failures = validateIntelligence({ root: workspace }).failures.join("\n");
  assert.match(failures, /experiment-run\.json\.id has invalid format/);
  assert.match(failures, /experiment-run\.json\.limits\.allowMutation must be boolean/);
  assert.match(failures, /experiment-run\.json\.decision\.outcome must be one of/);

  fs.writeFileSync(path.join(fixtureDir, "runbook.json"), JSON.stringify({
    id: "runbook_bad",
    title: "Bad",
    risk: "critical",
    steps: "not-array",
    verification: "not-array"
  }));
  failures = validateIntelligence({ root: workspace }).failures.join("\n");
  assert.match(failures, /runbook\.json\.steps must be a non-empty array/);
  assert.match(failures, /runbook\.json\.verification must be an array of strings/);

  fs.writeFileSync(path.join(workspace, "packages/intelligence/security-boundaries.json"), JSON.stringify({
    boundaries: [
      {
        action: "duplicate.action",
        risk: "local-write",
        permission: "bad-permission",
        approvalRequired: false
      },
      {
        action: "duplicate.action",
        risk: "mutating",
        permission: "memory:write",
        approvalRequired: "yes"
      }
    ]
  }));
  failures = validateIntelligence({ root: workspace }).failures.join("\n");
  assert.match(failures, /security-boundaries\.json\.boundaries\[0]\.permission has invalid format/);
  assert.match(failures, /security-boundaries\.json\.boundaries\[0]\.approvalRequired must be true for local-write risk/);
  assert.match(failures, /security-boundaries\.json\.boundaries\[1]\.action duplicates duplicate\.action/);
  assert.match(failures, /security-boundaries\.json\.boundaries\[1]\.approvalRequired must be boolean/);

  fs.writeFileSync(path.join(workspace, "packages/intelligence/evals/bad.json"), JSON.stringify({
    id: "eval_duplicate_grader",
    name: "Duplicate grader",
    scope: "mcp",
    version: 1,
    graders: [
      { id: "same", type: "coverage", threshold: 90 },
      { id: "same", type: "coverage", threshold: null }
    ],
    successCriteria: ["Detect bad graders."]
  }));
  failures = validateIntelligence({ root: workspace }).failures.join("\n");
  assert.match(failures, /packages\/intelligence\/evals\/bad\.json\.graders\[1]\.id duplicates same/);
  assert.match(failures, /packages\/intelligence\/evals\/bad\.json\.graders\[1]\.threshold must be a number between 0 and 100/);

  fs.writeFileSync(path.join(fixtureDir, "runbook.json"), "{");
  assert.match(validateIntelligence({ root: workspace }).failures.join("\n"), /Invalid fixture runbook\.json/);
});

test("release provenance validator enforces npm publishing safety requirements", () => {
  const passing = validateReleaseProvenance({ root });
  assert.equal(passing.status, "passed");
  assert.equal(passing.failures.length, 0);

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-release-provenance-"));
  fs.mkdirSync(path.join(workspace, ".github/workflows"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "package.json"), JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    license: "MIT",
    repository: { url: "git+https://github.com/example/wrong.git" },
    publishConfig: { access: "restricted", provenance: false },
    scripts: {}
  }));
  fs.writeFileSync(path.join(workspace, ".github/workflows/release.yml"), [
    "name: Release",
    "on:",
    "  release:",
    "    types: [published]",
    "jobs:",
    "  npm:",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      contents: read",
    "    steps:",
    "      - run: npm publish"
  ].join("\n"));

  const failures = validateReleaseProvenance({ root: workspace }).failures.join("\n");
  assert.match(failures, /repository.url must match/);
  assert.match(failures, /publishConfig.access must be public/);
  assert.match(failures, /publishConfig.provenance must be true/);
  assert.match(failures, /Missing verify:fresh-install script/);
  assert.match(failures, /id-token: write/);
  assert.match(failures, /Node 22.14.0/);
  assert.match(failures, /npm 11.10\+/);
  assert.match(failures, /publish with provenance and public access/);

  fs.rmSync(path.join(workspace, ".github/workflows/release.yml"));
  assert.match(validateReleaseProvenance({ root: workspace }).failures.join("\n"), /Missing release workflow/);

  fs.writeFileSync(path.join(workspace, "package.json"), "{");
  assert.match(validateReleaseProvenance({ root: workspace }).failures.join("\n"), /Invalid package.json/);
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
