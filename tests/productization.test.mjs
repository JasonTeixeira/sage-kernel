import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { __doctorTestInternals, createDoctorReport, formatDoctorReport } from "../packages/core/doctor.mjs";
import { buildMcpClientConfig, formatMcpClientConfig } from "../packages/core/mcp-client-config.mjs";
import { createMcpClientProof } from "../packages/core/mcp-client-proof.mjs";
import { createBenchmarkMatrixReport } from "../packages/benchmark/benchmark-matrix.mjs";
import { runExecutableRedteam } from "../packages/security/test-fixtures/redteam.mjs";
import { dbPath, sqlJson, sqlString } from "../packages/db/scripts/db-lib.mjs";
import { detectProjectProfile } from "../packages/profiles/project-detector.mjs";
import { verifyGlobalInstall } from "../scripts/verify-global-install.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("MCP client config generator covers codex, Claude/Cursor, all clients, text format, and invalid clients", () => {
  const codex = buildMcpClientConfig("codex", { root });
  assert.equal(codex.client, "codex");
  assert.equal(codex.config.mcp_servers["sage-kernel"].command, "node");
  assert.equal(codex.config.mcp_servers["sage-kernel"].cwd, root);

  const claude = buildMcpClientConfig("claude", { root });
  assert.equal(claude.client, "claude-desktop");
  assert.equal(claude.config.mcpServers["sage-kernel"].args[0], "apps/mcp-server/src/server.mjs");

  const all = buildMcpClientConfig("all", { root });
  assert.deepEqual(Object.keys(all.clients).sort(), ["claude-desktop", "codex", "cursor"]);
  assert.match(formatMcpClientConfig("cursor", { root }), /mcpServers/);
  assert.match(formatMcpClientConfig("all", { root }), /## codex/);
  assert.throws(() => buildMcpClientConfig("missing", { root }), /Unknown MCP client/);
});

test("MCP client proof runs SDK tool calls and writes evidence without installing app configs", async () => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-client-proof-"));
  const proof = await createMcpClientProof({ root, clients: ["claude-desktop", "cursor"], evidenceRoot });
  // A terminal-native MCP server's contract is the stdio handshake, not a GUI.
  // A real MCP client (official SDK) connecting and calling tools IS the proof.
  assert.equal(proof.status, "passed");
  assert.equal(proof.sdkStatus, "passed");
  assert.equal(proof.uiStatus, "not_required");
  assert.equal(proof.results.length, 2);
  assert.equal(proof.results.every((result) => result.toolCall.status === "passed"), true);
  assert.equal(proof.results.every((result) => result.toolCall.calledTools.length === 4), true);
  assert.equal(proof.results.every((result) => result.uiProof === "not_required"), true);
  assert.equal(fs.existsSync(path.join(evidenceRoot, "mcp-client-proof-latest.json")), true);
  // No manual UI proof is required for a terminal MCP.
  assert.equal(proof.remainingManualProof.length, 0);
});

test("global install proof records doctor, smoke, benchmark, and client config evidence", () => {
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-global-install-proof-"));
  const evidenceRoot = path.join(installRoot, ".sage-kernel/evidence/install-proof");
  const calls = [];
  const report = verifyGlobalInstall({
    root: installRoot,
    evidenceRoot,
    runCommand(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "npm" && args[0] === "pack") {
        fs.writeFileSync(path.join(installRoot, "sage-kernel-0.0.0.tgz"), "");
        return { status: 0, stdout: JSON.stringify([{ filename: "sage-kernel-0.0.0.tgz" }]), stderr: "" };
      }
      if (args.join(" ") === "doctor --fast --json") return { status: 0, stdout: JSON.stringify({ status: "passed" }), stderr: "" };
      if (args.join(" ") === "score benchmarks --json") return { status: 0, stdout: JSON.stringify({ status: "passed" }), stderr: "" };
      if (args.join(" ") === "mcp config all --json") {
        return { status: 0, stdout: JSON.stringify({ clients: { codex: {}, "claude-desktop": {}, cursor: {} } }), stderr: "" };
      }
      return { status: 0, stdout: "ok\n", stderr: "" };
    }
  });

  assert.equal(report.status, "passed");
  assert.equal(report.checks.some((check) => check.command === "sage score benchmarks --json"), true);
  assert.equal(report.evidencePath, ".sage-kernel/evidence/install-proof/global-install-latest.json");
  assert.equal(fs.existsSync(path.join(evidenceRoot, "global-install-latest.json")), true);
  assert.equal(calls.some((call) => call.includes("install -g --prefix")), true);
});

test("red-team fixtures execute hostile cases deterministically", () => {
  const report = runExecutableRedteam({ root });
  assert.equal(report.status, "passed");
  assert.deepEqual(report.results.map((result) => result.id).sort(), [
    "broken-package-script",
    "corrupt-database",
    "dependency-confusion",
    "destructive-tool-call",
    "fake-secret",
    "flaky-test",
    "huge-binary",
    "huge-log",
    "malicious-mcp-manifest",
    "malicious-repo-content",
    "poisoned-memory",
    "prompt-injection",
    "repo-readme-prompt-injection",
    "sandboxed-execution-containment",
    "slow-filesystem",
    "symlink-traversal",
    "tool-output-injection"
  ]);
});

test("benchmark matrix saves evidence, compares scores, and profile detector explains decisions", () => {
  const matrixRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-benchmark-matrix-"));
  fs.writeFileSync(path.join(matrixRoot, "package.json"), JSON.stringify({ name: "matrix-app", dependencies: { next: "1", react: "1" }, scripts: { test: "node --test" } }));
  fs.mkdirSync(path.join(matrixRoot, "tests"));
  fs.writeFileSync(path.join(matrixRoot, "tests/app.test.js"), "test('ok', () => {})\n");
  const detected = detectProjectProfile({ root: matrixRoot });
  assert.equal(detected.profileDecision.winner, "web-app");
  assert.equal(typeof detected.profileDecision.reason, "string");

  const first = createBenchmarkMatrixReport({ root: matrixRoot, paths: ["."], save: true });
  assert.equal(first.status, "passed");
  assert.equal(fs.existsSync(path.join(matrixRoot, ".sage-kernel/evidence/benchmark-matrix-latest.json")), true);
  const second = createBenchmarkMatrixReport({ root: matrixRoot, paths: ["."], compare: true, failOnRegression: true });
  assert.equal(second.comparison.status, "passed");
});

test("doctor report formats passing and failing checks", async () => {
  const report = await createDoctorReport({ root, fast: true, dashboardUrl: "http://127.0.0.1:1" });
  assert.equal(report.status, "passed");
  assert.equal(report.checks.node.status, "passed");
  assert.equal(report.checks.mcpClientConfig.status, "passed");
  assert.equal(report.checks.dashboard.status, "warning");
  assert.match(formatDoctorReport(report), /Sage Kernel doctor: passed/);
  assert.equal(JSON.parse(formatDoctorReport(report, { json: true })).status, "passed");

  const brokenRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-broken-doctor-"));
  const broken = await createDoctorReport({ root: brokenRoot, fast: true, dashboardUrl: "http://127.0.0.1:1" });
  assert.equal(broken.status, "failed");
  assert.equal(broken.checks.package.status, "failed");
  assert.equal(broken.checks.db.status, "failed");
  assert.equal(broken.checks.mcpManifest.status, "failed");
  assert.equal(broken.checks.mcpClientConfig.status, "failed");
  assert.match(formatDoctorReport(broken), /FAILED package/);
});

test("doctor report covers non-fast gates, dashboard HTTP status, and DB SQL helpers", async () => {
  const commands = [];
  const report = await createDoctorReport({
    root,
    fast: false,
    dashboardUrl: "http://127.0.0.1:8787",
    fetchImpl: async (url) => {
      assert.equal(url.pathname, "/health");
      return { ok: false, status: 503 };
    },
    runCommand(command, args, options) {
      commands.push({ command, args, cwd: options.cwd });
      return {
        status: args.includes("security:scan") ? 1 : 0,
        stdout: "x".repeat(1300),
        stderr: "security failed\n"
      };
    }
  });

  assert.equal(report.status, "failed");
  assert.equal(report.checks.dashboard.status, "warning");
  assert.match(report.checks.dashboard.message, /HTTP 503/);
  assert.equal(report.checks.catalog.status, "passed");
  assert.equal(report.checks.mcpContracts.status, "passed");
  assert.equal(report.checks.security.status, "failed");
  assert.equal(report.checks.security.stdout.length, 1200);
  assert.equal(commands.length, 6);
  assert.equal(commands.every((item) => item.command === "npm" && item.cwd === root), true);

  assert.equal(dbPath("/tmp/kernel"), "/tmp/kernel/.sage-kernel/kernel.db");
  assert.equal(sqlString("Sage's Kernel"), "'Sage''s Kernel'");
  assert.equal(sqlString(null), "''");
  assert.equal(sqlJson({ token: "abc" }), `'{"token":"abc"}'`);
  assert.equal(sqlJson(null), "'{}'");
});

test("doctor report passes when all non-fast gates pass and dashboard is reachable", async () => {
  const report = await createDoctorReport({
    root,
    fast: false,
    dashboardUrl: "http://127.0.0.1:8787",
    fetchImpl: async () => ({ ok: true, status: 200 }),
    runCommand() {
      return { status: 0, stdout: "ok\n", stderr: "" };
    }
  });

  assert.equal(report.status, "passed");
  assert.equal(report.checks.dashboard.status, "passed");
  assert.equal(report.checks.catalog.status, "passed");
  assert.equal(report.checks.security.status, "passed");
  assert.match(report.summary, /0 failed/);
});

test("doctor internals cover defensive permission and dashboard failure branches", async () => {
  const denied = __doctorTestInternals.checkPermissions(path.join(os.tmpdir(), "sage-doctor-missing-root"));
  assert.equal(denied.status, "failed");

  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-doctor-internals-"));
  assert.equal(__doctorTestInternals.checkFile(missingRoot, "package.json").status, "failed");
  fs.writeFileSync(path.join(missingRoot, "package.json"), "{}");
  assert.equal(__doctorTestInternals.checkFile(missingRoot, "package.json").status, "passed");
  assert.equal(__doctorTestInternals.checkJsonArray(missingRoot, "missing.json", "tools").status, "failed");
  fs.mkdirSync(path.join(missingRoot, "apps/mcp-server/src"), { recursive: true });
  fs.writeFileSync(path.join(missingRoot, "apps/mcp-server/tools.json"), JSON.stringify({ tools: [] }));
  assert.equal(__doctorTestInternals.checkJsonArray(missingRoot, "apps/mcp-server/tools.json", "tools").status, "failed");
  assert.equal(__doctorTestInternals.checkMcpServer(missingRoot).status, "failed");
  assert.equal(["passed", "failed"].includes(__doctorTestInternals.checkNodeVersion().status), true);

  const malformedClient = __doctorTestInternals.checkMcpClientConfig(1, "all");
  assert.equal(malformedClient.status, "failed");
  assert.match(malformedClient.message, /path.*string/);
  const codexClient = __doctorTestInternals.checkMcpClientConfig(root, "codex");
  assert.equal(codexClient.status, "passed");

  const unreachable = await __doctorTestInternals.checkDashboard("http://127.0.0.1:1", {
    fetchImpl: async () => {
      throw new Error("offline");
    }
  });
  assert.equal(unreachable.status, "warning");
  assert.match(unreachable.message, /not currently reachable/);

  const failedRun = __doctorTestInternals.runCheck(root, "npm", ["run", "fixture"], {
    runCommand() {
      return { status: 1, stdout: "", stderr: "" };
    }
  });
  assert.equal(failedRun.status, "failed");
  assert.equal(failedRun.stdout, "");
  assert.equal(failedRun.stderr, "");
});
