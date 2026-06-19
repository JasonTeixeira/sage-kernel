import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { buildMcpClientConfig, MCP_CLIENTS } from "./mcp-client-config.mjs";

export const CLIENT_CONFIG_PATHS = {
  "claude-desktop": path.join(os.homedir(), "Library/Application Support/Claude/claude_desktop_config.json"),
  cursor: path.join(os.homedir(), ".cursor/mcp.json"),
  codex: path.join(os.homedir(), ".codex/config.toml")
};

export async function createMcpClientProof(options = {}) {
  const root = options.root || process.cwd();
  const clients = normalizeClients(options.clients);
  const install = Boolean(options.install);
  const evidenceRoot = options.evidenceRoot || path.join(root, ".sage-kernel/evidence");
  const results = [];
  for (const client of clients) {
    const config = buildMcpClientConfig(client, { root });
    const installResult = install ? installClientConfig(client, config.config) : plannedInstall(client, config.config);
    const call = await proveToolCall(client, root);
    results.push({
      client,
      installed: installResult,
      toolCall: call,
      uiProof: client === "codex" ? "not_required_for_stdio_sdk_proof" : "manual_client_launch_required"
    });
  }
  const report = {
    type: "mcp-client-proof",
    status: results.every((result) => result.toolCall.status === "passed" && result.installed.status !== "failed") ? "passed_with_manual_ui_gaps" : "failed",
    generatedAt: new Date().toISOString(),
    root,
    results,
    remainingManualProof: results
      .filter((result) => result.client !== "codex")
      .map((result) => `Launch ${result.client} and call kernel.phase.status from the installed config.`)
  };
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const file = path.join(evidenceRoot, "mcp-client-proof-latest.json");
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, evidencePath: path.relative(root, file) };
}

function normalizeClients(clients) {
  if (!clients || clients.length === 0 || clients.includes("all")) return MCP_CLIENTS;
  return clients;
}

function plannedInstall(client, config) {
  return {
    status: "planned",
    path: CLIENT_CONFIG_PATHS[client] || null,
    config
  };
}

function installClientConfig(client, config) {
  const target = CLIENT_CONFIG_PATHS[client];
  if (!target) return { status: "failed", error: `No config path known for ${client}` };
  if (client === "codex") {
    return {
      status: "manual",
      path: target,
      message: "Codex uses TOML; run sage mcp config codex --json or merge through codex mcp add."
    };
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const existing = readJson(target, {});
  const backup = fs.existsSync(target) ? `${target}.sage-kernel-backup-${Date.now()}` : null;
  if (backup) fs.copyFileSync(target, backup);
  const merged = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers || {}),
      ...(config.mcpServers || {})
    }
  };
  fs.writeFileSync(target, `${JSON.stringify(merged, null, 2)}\n`);
  return { status: "installed", path: target, backup };
}

async function proveToolCall(client, root) {
  const sdkClient = new Client({ name: `sage-kernel-${client}-proof`, version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["apps/mcp-server/src/server.mjs"],
    cwd: root
  });
  try {
    await sdkClient.connect(transport);
    const tools = await sdkClient.listTools();
    const call = await sdkClient.callTool({ name: "kernel.phase.status", arguments: {} });
    return {
      status: "passed",
      toolCount: tools.tools?.length || 0,
      calledTool: "kernel.phase.status",
      contentType: call.content?.[0]?.type || null
    };
  } catch (error) {
    return { status: "failed", error: error.message };
  } finally {
    await sdkClient.close().catch(() => {});
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
