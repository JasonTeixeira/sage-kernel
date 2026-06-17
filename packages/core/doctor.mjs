import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createSqliteAdapter } from "../db/adapter.mjs";
import { migrateKernelDb } from "../db/migrations.mjs";
import { buildMcpServerConfig } from "./mcp-client-config.mjs";

export async function createDoctorReport(options = {}) {
  const root = options.root || process.cwd();
  const fast = Boolean(options.fast);
  const checks = {};

  checks.node = checkNodeVersion();
  checks.package = checkFile(root, "package.json");
  checks.db = await checkDb(root);
  checks.mcpManifest = checkJsonArray(root, "apps/mcp-server/tools.json", "tools");
  checks.mcpServer = checkMcpServer(root);
  checks.mcpClientConfig = checkMcpClientConfig(root, options.client || "all");
  checks.permissions = checkPermissions(root);
  checks.dashboard = await checkDashboard(options.dashboardUrl || "http://127.0.0.1:8787", { fetchImpl: options.fetchImpl });

  if (!fast) {
    checks.catalog = runCheck(root, "npm", ["run", "catalog:validate"], { runCommand: options.runCommand });
    checks.infra = runCheck(root, "npm", ["run", "infra:validate"], { runCommand: options.runCommand });
    checks.jobs = runCheck(root, "npm", ["run", "jobs:validate"], { runCommand: options.runCommand });
    checks.mcpContracts = runCheck(root, "npm", ["run", "mcp:contracts"], { runCommand: options.runCommand });
    checks.mcpSmoke = runCheck(root, "npm", ["run", "mcp:smoke"], { runCommand: options.runCommand });
    checks.security = runCheck(root, "npm", ["run", "security:scan"], { runCommand: options.runCommand });
  }

  const failed = Object.values(checks).filter((check) => check.status === "failed");
  const warnings = Object.values(checks).filter((check) => check.status === "warning");
  return {
    status: failed.length === 0 ? "passed" : "failed",
    root,
    checkedAt: new Date().toISOString(),
    fast,
    summary: `${failed.length} failed, ${warnings.length} warnings, ${Object.keys(checks).length} checks`,
    mcp: buildMcpServerConfig({ root }),
    checks
  };
}

export function formatDoctorReport(report, options = {}) {
  if (options.json) return JSON.stringify(report, null, 2);
  const lines = [`Sage Kernel doctor: ${report.status}`, report.summary, ""];
  for (const [name, check] of Object.entries(report.checks)) {
    lines.push(`${check.status.toUpperCase()} ${name}: ${check.message}`);
  }
  return lines.join("\n");
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  return major >= 20
    ? { status: "passed", message: `Node ${process.versions.node}` }
    : { status: "failed", message: `Node ${process.versions.node}; requires >=20` };
}

function checkFile(root, file) {
  const exists = fs.existsSync(path.join(root, file));
  return {
    status: exists ? "passed" : "failed",
    message: exists ? `${file} found` : `${file} missing`
  };
}

async function checkDb(root) {
  try {
    const result = await migrateKernelDb({ root });
    const db = createSqliteAdapter({ root });
    const migrations = Number(db.scalar("SELECT COUNT(*) FROM schema_migrations;"));
    return { status: "passed", message: `SQLite ready, ${migrations} migrations recorded`, result };
  } catch (error) {
    return { status: "failed", message: error.message };
  }
}

function checkJsonArray(root, file, key) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    const count = Array.isArray(data[key]) ? data[key].length : 0;
    return count > 0
      ? { status: "passed", message: `${file} has ${count} ${key}` }
      : { status: "failed", message: `${file} has no ${key}` };
  } catch (error) {
    return { status: "failed", message: error.message };
  }
}

function checkMcpServer(root) {
  const server = buildMcpServerConfig({ root });
  const serverPath = path.join(server.cwd, server.args[0]);
  return fs.existsSync(serverPath)
    ? { status: "passed", message: `MCP server entry exists at ${server.args[0]}` }
    : { status: "failed", message: `MCP server entry missing: ${server.args[0]}` };
}

function checkMcpClientConfig(root, client) {
  try {
    const config = client === "all" ? buildMcpServerConfig({ root }) : buildMcpServerConfig({ root });
    const serverPath = path.join(config.cwd, config.args[0]);
    return fs.existsSync(serverPath)
      ? { status: "passed", message: `MCP client config can launch ${config.command} ${config.args.join(" ")}` }
      : { status: "failed", message: `MCP client config references missing server: ${config.args[0]}` };
  } catch (error) {
    return { status: "failed", message: error.message };
  }
}

function checkPermissions(root) {
  try {
    fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK);
    return { status: "passed", message: "Kernel root is readable and writable" };
  } catch (error) {
    return { status: "failed", message: error.message };
  }
}

async function checkDashboard(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const response = await fetchImpl(new URL("/health", url));
    return response.ok
      ? { status: "passed", message: `Dashboard health responded at ${url}` }
      : { status: "warning", message: `Dashboard health returned HTTP ${response.status} at ${url}` };
  } catch {
    return { status: "warning", message: `Dashboard is not currently reachable at ${url}` };
  }
}

function runCheck(root, command, args, options = {}) {
  const runCommand = options.runCommand || spawnSync;
  const result = runCommand(command, args, { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 4 });
  return {
    status: result.status === 0 ? "passed" : "failed",
    message: result.status === 0 ? `${[command, ...args].join(" ")} passed` : `${[command, ...args].join(" ")} failed`,
    stdout: result.stdout?.trim().slice(-1200) || "",
    stderr: result.stderr?.trim().slice(-1200) || ""
  };
}

export const __doctorTestInternals = {
  checkPermissions,
  checkDashboard
};
