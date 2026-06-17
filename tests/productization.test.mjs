import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { __doctorTestInternals, createDoctorReport, formatDoctorReport } from "../packages/core/doctor.mjs";
import { buildMcpClientConfig, formatMcpClientConfig } from "../packages/core/mcp-client-config.mjs";
import { dbPath, sqlJson, sqlString } from "../packages/db/scripts/db-lib.mjs";

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

  const malformedClient = __doctorTestInternals.checkMcpClientConfig(1, "all");
  assert.equal(malformedClient.status, "failed");
  assert.match(malformedClient.message, /path.*string/);

  const unreachable = await __doctorTestInternals.checkDashboard("http://127.0.0.1:1", {
    fetchImpl: async () => {
      throw new Error("offline");
    }
  });
  assert.equal(unreachable.status, "warning");
  assert.match(unreachable.message, /not currently reachable/);
});
