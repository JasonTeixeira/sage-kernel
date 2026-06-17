export const MCP_CLIENTS = ["claude-desktop", "codex", "cursor"];

export function buildMcpServerConfig(options = {}) {
  const root = options.root || process.cwd();
  return {
    name: "sage-kernel",
    command: "node",
    args: ["apps/mcp-server/src/server.mjs"],
    cwd: root,
    transport: "stdio"
  };
}

export function buildMcpClientConfig(client = "all", options = {}) {
  const normalized = normalizeClient(client);
  const server = buildMcpServerConfig(options);
  if (normalized === "all") {
    return {
      clients: Object.fromEntries(MCP_CLIENTS.map((name) => [name, clientPayload(name, server)]))
    };
  }
  return {
    client: normalized,
    server,
    config: clientPayload(normalized, server)
  };
}

export function formatMcpClientConfig(client = "all", options = {}) {
  const config = buildMcpClientConfig(client, options);
  if (options.json) return JSON.stringify(config, null, 2);
  if (config.clients) {
    return Object.entries(config.clients)
      .map(([name, payload]) => `## ${name}\n\n${JSON.stringify(payload, null, 2)}`)
      .join("\n\n");
  }
  return JSON.stringify(config.config, null, 2);
}

function normalizeClient(client) {
  const normalized = (client || "all").toLowerCase();
  if (normalized === "claude" || normalized === "claude_desktop") return "claude-desktop";
  if (normalized === "all" || MCP_CLIENTS.includes(normalized)) return normalized;
  throw new Error(`Unknown MCP client: ${client}. Expected ${MCP_CLIENTS.join(", ")} or all.`);
}

function clientPayload(client, server) {
  if (client === "codex") {
    return {
      mcp_servers: {
        "sage-kernel": {
          command: server.command,
          args: server.args,
          cwd: server.cwd
        }
      }
    };
  }
  return {
    mcpServers: {
      "sage-kernel": {
        command: server.command,
        args: server.args,
        cwd: server.cwd
      }
    }
  };
}
