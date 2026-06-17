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
import { createWarehouseSummary } from "../packages/ai-warehouse/scripts/warehouse-summary.mjs";
import { validateMarkdownLinks, validatePublicSurface } from "../scripts/validate-public-surface.mjs";
import { validateReleaseProvenance } from "../scripts/validate-release-provenance.mjs";

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
  assert.match(pkg.scripts["test:coverage"], /--test-coverage-lines=98/);
  assert.match(pkg.scripts["test:coverage"], /--test-coverage-branches=90/);
  assert.match(pkg.scripts["test:coverage"], /--test-coverage-functions=97/);
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
    "docs/SECURITY_MODEL.md",
    "docs/RELEASE_PROCESS.md",
    "assets/sage-kernel-architecture.svg",
    "assets/sage-kernel-workflow.svg",
    "docker-compose.postgres.yml",
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
  assert.match(ci, /npm run public:validate/);
  assert.match(ci, /Postgres Integration/);
  assert.match(ci, /Fresh Install Verification/);
  assert.match(ci, /SAGE_RUN_POSTGRES_TESTS/);
  assert.match(ci, /npm run verify:fresh-install/);

  const release = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
  assert.match(release, /id-token:\s*write/);
  assert.match(release, /package-manager-cache:\s*false/);
  assert.match(release, /npm run verify:fresh-install/);
  assert.match(release, /npm run release:check/);
  assert.match(release, /npm publish --provenance --access public/);

  const securityModel = fs.readFileSync(path.join(root, "docs/SECURITY_MODEL.md"), "utf8");
  assert.match(securityModel, /Approval Rules/);
  assert.match(securityModel, /Filesystem Rules/);
  assert.match(securityModel, /Secret Handling/);
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
  assert.match(failures, /publish with provenance and public access/);

  fs.rmSync(path.join(workspace, ".github/workflows/release.yml"));
  assert.match(validateReleaseProvenance({ root: workspace }).failures.join("\n"), /Missing release workflow/);

  fs.writeFileSync(path.join(workspace, "package.json"), "{");
  assert.match(validateReleaseProvenance({ root: workspace }).failures.join("\n"), /Invalid package.json/);
});

test("public surface validator catches package and markdown regressions", () => {
  const passing = validatePublicSurface({ root });
  assert.equal(passing.status, "passed");
  assert.equal(passing.failures.length, 0);

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-public-surface-"));
  fs.mkdirSync(path.join(workspace, "docs"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "assets"), { recursive: true });
  fs.mkdirSync(path.join(workspace, ".github/ISSUE_TEMPLATE"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "README.md"), "[Broken](docs/missing.md)\n");
  fs.writeFileSync(path.join(workspace, "docs/INSTALL.md"), "# Install\n");
  fs.writeFileSync(path.join(workspace, "docs/USAGE.md"), "# Usage\n");
  fs.writeFileSync(path.join(workspace, "docs/ARCHITECTURE.md"), "# Architecture\n");
  fs.writeFileSync(path.join(workspace, "docs/VISUAL_GUIDE.md"), "![Missing](../assets/missing.svg)\n");
  fs.writeFileSync(path.join(workspace, "docs/MCP_SERVER.md"), "# MCP\n");
  fs.writeFileSync(path.join(workspace, "docs/MCP_CLIENTS.md"), "# Clients\n");
  fs.writeFileSync(path.join(workspace, "docs/SECURITY_MODEL.md"), "# Security\n");
  fs.writeFileSync(path.join(workspace, "docs/RELEASE_PROCESS.md"), "# Release\n");
  fs.writeFileSync(path.join(workspace, "assets/sage-kernel-architecture.svg"), "<svg />\n");
  fs.writeFileSync(path.join(workspace, "assets/sage-kernel-workflow.svg"), "<svg />\n");
  fs.writeFileSync(path.join(workspace, "LICENSE"), "MIT\n");
  fs.writeFileSync(path.join(workspace, "SECURITY.md"), "# Security\n");
  fs.writeFileSync(path.join(workspace, "CONTRIBUTING.md"), "# Contributing\n");
  fs.writeFileSync(path.join(workspace, "CODE_OF_CONDUCT.md"), "# Code\n");
  fs.writeFileSync(path.join(workspace, "CHANGELOG.md"), "# Changelog\n");
  fs.mkdirSync(path.join(workspace, ".github/workflows"), { recursive: true });
  fs.writeFileSync(path.join(workspace, ".github/workflows/ci.yml"), "name: CI\n");
  fs.writeFileSync(path.join(workspace, ".github/workflows/release.yml"), "name: Release\n");
  fs.writeFileSync(path.join(workspace, ".github/PULL_REQUEST_TEMPLATE.md"), "- [ ] test\n");
  fs.writeFileSync(path.join(workspace, ".github/ISSUE_TEMPLATE/bug_report.md"), "# Bug\n");
  fs.writeFileSync(path.join(workspace, ".github/ISSUE_TEMPLATE/feature_request.md"), "# Feature\n");
  fs.writeFileSync(path.join(workspace, "package.json"), JSON.stringify({
    name: "fixture",
    license: "MIT",
    repository: { url: "git+https://example.com/fixture.git" },
    bin: { sage: "bin/sage.mjs" },
    files: ["README.md", "LICENSE"]
  }));

  const failures = validatePublicSurface({ root: workspace }).failures.join("\n");
  assert.match(failures, /package.json files allowlist missing: assets/);
  assert.match(failures, /README.md links to missing file: docs\/missing.md/);
  assert.match(failures, /docs\/VISUAL_GUIDE.md links to missing file/);
  assert.deepEqual(validateMarkdownLinks(workspace, "docs/INSTALL.md"), []);

  fs.writeFileSync(path.join(workspace, "docs/LINKS.md"), [
    "[External](https://example.com)",
    "[Anchor](#local)",
    "[Absolute](/docs/INSTALL.md)",
    "[Outside](../../outside.md)",
    "[Encoded](docs%2Fmissing.md)"
  ].join("\n"));
  const linkFailures = validateMarkdownLinks(workspace, "docs/LINKS.md");
  assert.equal(linkFailures.length, 2);
  assert.match(linkFailures.join("\n"), /links outside workspace/);
  assert.match(linkFailures.join("\n"), /links to missing file: docs%2Fmissing.md/);

  fs.writeFileSync(path.join(workspace, "package.json"), JSON.stringify({
    license: "Apache-2.0",
    repository: {},
    bin: {},
    files: "not-an-array",
    private: true
  }));
  const metadataFailures = validatePublicSurface({ root: workspace }).failures.join("\n");
  assert.match(metadataFailures, /must not set private/);
  assert.match(metadataFailures, /license must be MIT/);
  assert.match(metadataFailures, /repository.url is required/);
  assert.match(metadataFailures, /must expose the sage binary/);
  assert.match(metadataFailures, /files allowlist is required/);

  fs.writeFileSync(path.join(workspace, "package.json"), "{");
  assert.match(validatePublicSurface({ root: workspace }).failures.join("\n"), /Invalid package.json/);
});

test("infra plan CLI validates inputs, writes output files, and covers python docker selection", () => {
  const missing = spawnSync("node", ["packages/infra/scripts/infra-plan.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Usage/);

  const unknownTemplate = spawnSync("node", ["packages/infra/scripts/infra-plan.mjs", "--template", "missing"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(unknownTemplate.status, 0);
  assert.match(unknownTemplate.stderr, /Unknown template/);

  const unknownTarget = spawnSync("node", ["packages/infra/scripts/infra-plan.mjs", "--template", "worker-service", "--target", "missing"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(unknownTarget.status, 0);
  assert.match(unknownTarget.stderr, /Unknown deploy target/);

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-infra-plan-"));
  const outFile = path.join(outDir, "plan.json");
  const result = spawnSync(
    "node",
    ["packages/infra/scripts/infra-plan.mjs", "--template", "fastapi-service", "--target", "docker", "--out", outFile],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), outFile);
  const plan = JSON.parse(fs.readFileSync(outFile, "utf8"));
  assert.equal(plan.templates.dockerfile, "packages/infra/templates/docker/python-fastapi.Dockerfile");
  assert.equal(plan.target, "docker");
});

test("warehouse summary covers missing configuration, defaults, and feature detection", () => {
  assert.throws(() => createWarehouseSummary({ sourceRoot: "" }), /source root is not configured/);

  const missingIndex = fs.mkdtempSync(path.join(os.tmpdir(), "sage-warehouse-missing-"));
  assert.throws(() => createWarehouseSummary({ sourceRoot: missingIndex }), /ai-warehouse index not found/);

  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-warehouse-summary-"));
  for (const item of ["mcp-server", "templates", "playbooks", "prompts"]) {
    fs.mkdirSync(path.join(sourceRoot, item), { recursive: true });
  }
  fs.writeFileSync(path.join(sourceRoot, "mcp-server", "server.py"), "print('mcp')\n");
  fs.writeFileSync(path.join(sourceRoot, "mcp-server", "http_server.py"), "print('http')\n");
  fs.writeFileSync(
    path.join(sourceRoot, "index.json"),
    JSON.stringify({
      tools: [
        { name: "Agent", category: "agents", verdict: "use", maturity: "stable" },
        { name: "Defaulted" }
      ]
    })
  );

  const summary = createWarehouseSummary({ sourceRoot });
  assert.equal(summary.count, 2);
  assert.deepEqual(summary.verdicts, { unknown: 1, use: 1 });
  assert.deepEqual(summary.maturities, { stable: 1, unknown: 1 });
  assert.deepEqual(summary.topCategories, [
    { name: "agents", count: 1 },
    { name: "uncategorized", count: 1 }
  ]);
  assert.equal(summary.hasMcpServer, true);
  assert.equal(summary.hasHttpServer, true);
  assert.equal(summary.hasTemplates, true);
  assert.equal(summary.hasPlaybooks, true);
  assert.equal(summary.hasPrompts, true);
});

test("queue stress harness emits a passing JSON report", () => {
  const result = spawnSync("node", ["scripts/stress-queue.mjs", "--count=25"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "passed");
  assert.equal(report.count, 25);
  assert.equal(report.finished, 25);

  const empty = spawnSync("node", ["scripts/stress-queue.mjs", "--count=0"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4
  });
  assert.equal(empty.status, 0, empty.stderr || empty.stdout);
  assert.equal(JSON.parse(empty.stdout).count, 0);
});

test("queue stress core reports failed counts from injected adapters", () => {
  assert.deepEqual(parseQueueStressArgs(["--count=7"]), { count: 7 });
  assert.deepEqual(parseQueueStressArgs([]), { count: 1000 });
  const report = createQueueStressReport({
    count: 2,
    nowMs: (() => {
      let value = 100;
      return () => (value += 10);
    })(),
    nowIso: () => "2026-01-01T00:00:00.000Z",
    db: {
      init() {},
      executeBatch(statements) {
        assert.equal(statements.length, 2);
      },
      execute() {},
      scalar(sql) {
        return sql.includes("status='finished'") ? 1 : 1;
      }
    }
  });
  assert.equal(report.status, "failed");
  assert.equal(report.finished, 1);
  assert.equal(report.unfinished, 1);

  const defaulted = createQueueStressReport({
    nowMs: () => 100,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    db: {
      init() {},
      executeBatch(statements) {
        assert.equal(statements.length, 1000);
      },
      execute(_sql, params) {
        assert.deepEqual(params, ["2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"]);
      },
      scalar(sql) {
        return sql.includes("status='finished'") ? 1000 : 0;
      }
    }
  });
  assert.equal(defaulted.status, "passed");
  assert.equal(defaulted.jobsPerSecond, 1000);
});

test("dashboard stress harness reports passed and failed endpoint runs", async () => {
  const server = await startStressFixtureServer();
  try {
    const passed = spawnSync(
      "node",
      ["scripts/stress-dashboard.mjs", `--url=${server.baseUrl}`, "--endpoint=/health", "--count=3", "--concurrency=2"],
      { cwd: root, encoding: "utf8" }
    );
    assert.equal(passed.status, 0, passed.stderr || passed.stdout);
    assert.equal(JSON.parse(passed.stdout).status, "passed");

    const failed = spawnSync(
      "node",
      ["scripts/stress-dashboard.mjs", `--url=${server.baseUrl}`, "--endpoint=/missing", "--count=2", "--concurrency=1"],
      { cwd: root, encoding: "utf8" }
    );
    assert.notEqual(failed.status, 0);
    const report = JSON.parse(failed.stdout);
    assert.equal(report.status, "failed");
    assert.equal(report.failures, 2);

    const empty = spawnSync(
      "node",
      ["scripts/stress-dashboard.mjs", `--url=${server.baseUrl}`, "--endpoint=/health", "--count=0", "--concurrency=1"],
      { cwd: root, encoding: "utf8" }
    );
    assert.equal(empty.status, 0, empty.stderr || empty.stdout);
    assert.equal(JSON.parse(empty.stdout).count, 0);
  } finally {
    server.child.kill("SIGTERM");
  }
});

test("dashboard stress core covers defaults, response failures, and thrown fetches", async () => {
  assert.deepEqual(parseDashboardStressArgs([]), {
    baseUrl: "http://127.0.0.1:8787",
    count: 100,
    concurrency: 10,
    endpoint: "/api/snapshot"
  });
  assert.deepEqual(parseDashboardStressArgs(["--url=http://x.test", "--count=2", "--concurrency=1", "--endpoint=/ready"]), {
    baseUrl: "http://x.test",
    count: 2,
    concurrency: 1,
    endpoint: "/ready"
  });
  let tick = 0;
  const passed = await createDashboardStressReport({
    baseUrl: "http://127.0.0.1",
    endpoint: "/health",
    count: 2,
    concurrency: 2,
    now: () => ++tick,
    fetchImpl: async () => ({ ok: true, text: async () => "ok" })
  });
  assert.equal(passed.status, "passed");
  assert.equal(passed.failures, 0);

  let defaultFetches = 0;
  const defaulted = await createDashboardStressReport({
    now: () => 50,
    fetchImpl: async (url) => {
      defaultFetches += 1;
      assert.equal(url.origin, "http://127.0.0.1:8787");
      assert.equal(url.pathname, "/api/snapshot");
      return { ok: true, text: async () => "" };
    }
  });
  assert.equal(defaulted.status, "passed");
  assert.equal(defaulted.count, 100);
  assert.equal(defaulted.concurrency, 10);
  assert.equal(defaultFetches, 100);

  const failed = await createDashboardStressReport({
    baseUrl: "http://127.0.0.1",
    endpoint: "/health",
    count: 2,
    concurrency: 1,
    fetchImpl: async (url) => {
      assert.equal(url.pathname, "/health");
      return { ok: false, text: async () => "nope" };
    }
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.failures, 2);

  const thrown = await createDashboardStressReport({
    baseUrl: "http://127.0.0.1",
    count: 1,
    concurrency: 1,
    fetchImpl: async () => {
      throw new Error("network");
    }
  });
  assert.equal(thrown.failures, 1);
});

test("QA runner covers mode selection, static checks, failures, and root boundaries", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-qa-"));
  fs.writeFileSync(path.join(workspace, "package.json"), JSON.stringify({
    scripts: {
      lint: "echo lint",
      typecheck: "echo typecheck",
      test: "echo test",
      build: "echo build"
    }
  }));
  fs.writeFileSync(path.join(workspace, "README.md"), "# Fixture\n");
  fs.writeFileSync(path.join(workspace, ".env.local"), "SECRET=local\n");

  assert.equal(parseMode([]), "fast");
  assert.equal(parseMode(["--standard"]), "standard");
  assert.equal(parseMode(["--deep"]), "deep");

  const checks = staticChecks(workspace);
  assert.equal(checks.find((check) => check.name === "file:.env.example").status, "warning");
  assert.equal(checks.find((check) => check.name === "secret-boundary:.env.local").status, "passed");

  const commands = [];
  const passingReport = createQaReport(workspace, {
    mode: "standard",
    spawn(command, args) {
      commands.push([command, ...args].join(" "));
      return { status: 0, stdout: "ok\n", stderr: "" };
    }
  });
  assert.equal(passingReport.status, "passed");
  assert.deepEqual(commands, ["npm run lint", "npm run typecheck", "npm run test", "npm run build"]);
  assert.equal(typeof passingReport.signature, "string");

  const failedReport = createQaReport(workspace, {
    spawn() {
      return { status: 1, stdout: "", stderr: "failed" };
    }
  });
  assert.equal(failedReport.status, "failed");
  assert.equal(failedReport.checks.some((check) => check.status === "failed"), true);

  const denied = runQaCli(["/tmp/outside-sage-kernel"], { root: workspace, env: {} });
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /Refusing to run QA outside allowed roots/);
});

test("dogfood audit handles configured, unconfigured, malformed, and failed QA results", () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-dogfood-"));
  const repoPath = path.join(sourceRoot, "fixture-app");
  fs.mkdirSync(repoPath);
  fs.writeFileSync(path.join(repoPath, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  fs.writeFileSync(path.join(repoPath, "README.md"), "# Fixture\n");
  fs.writeFileSync(path.join(repoPath, ".env.example"), "KEY=value\n");

  assert.equal(sourceRootForCatalog({ sourceRootEnv: "SRC", sourceRoot: "/fallback" }, { SRC: sourceRoot }), sourceRoot);
  assert.equal(sourceRootForCatalog({ sourceRootEnv: "SRC", sourceRoot: "/fallback" }, {}), "/fallback");

  const passed = inspectRepo("fixture-app", {
    root,
    sourceRoot,
    runQa() {
      return { status: 0, stdout: JSON.stringify({ checks: [] }) };
    }
  });
  assert.equal(passed.configured, true);
  assert.equal(passed.checks.exists, true);
  assert.equal(passed.qaStatus, "passed");

  const malformed = inspectRepo("fixture-app", {
    root,
    sourceRoot,
    runQa() {
      return { status: 1, stdout: "not-json" };
    }
  });
  assert.equal(malformed.qaStatus, "failed");
  assert.deepEqual(malformed.failedQaChecks, []);

  const failed = inspectRepo("fixture-app", {
    root,
    sourceRoot,
    runQa() {
      return {
        status: 1,
        stdout: JSON.stringify({
          checks: [{ name: "npm:test", status: "failed", result: { command: "npm run test", stderr: "boom" } }]
        })
      };
    }
  });
  assert.equal(failed.failedQaChecks[0].stderr, "boom");

  const report = createDogfoodReport({
    root,
    catalog: { sourceRootEnv: "SRC", repos: [{ name: "fixture-app" }] },
    env: { SRC: sourceRoot },
    targets: ["fixture-app"],
    runQa() {
      return { status: 0, stdout: JSON.stringify({ checks: [] }) };
    }
  });
  assert.equal(report.configured, true);
  assert.equal(report.results.length, 1);

  const unconfigured = createDogfoodReport({
    root,
    catalog: { sourceRootEnv: "SRC", repos: [{ name: "missing-app" }] },
    env: {},
    targets: ["missing-app"]
  });
  assert.equal(unconfigured.configured, false);
  assert.equal(unconfigured.results[0].qaStatus, "missing");
});

async function startStressFixtureServer() {
  const portFile = path.join(os.tmpdir(), `sage-stress-port-${process.pid}-${Date.now()}.txt`);
  const child = spawn(process.execPath, [
    "-e",
    `const http = require('node:http');
const fs = require('node:fs');
const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  response.writeHead(503, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ status: 'degraded' }));
});
server.listen(0, '127.0.0.1', () => fs.writeFileSync(process.argv[1], String(server.address().port)));`,
    portFile
  ], { stdio: "ignore" });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (fs.existsSync(portFile)) {
      const port = fs.readFileSync(portFile, "utf8").trim();
      fs.rmSync(portFile, { force: true });
      return { child, baseUrl: `http://127.0.0.1:${port}` };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill("SIGTERM");
  throw new Error("Stress fixture server did not start");
}
