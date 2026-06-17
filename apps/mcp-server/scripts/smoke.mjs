import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

export async function runMcpSmoke(options = {}) {
  const client = options.client || new Client({
    name: "sage-kernel-smoke",
    version: "0.1.0"
  });
  const transport = options.transport || new StdioClientTransport({
    command: "node",
    args: ["apps/mcp-server/src/server.mjs"],
    cwd: options.cwd || process.cwd()
  });
  const minTools = options.minTools || 8;

  await client.connect(transport);

  const tools = await client.listTools();
  if (tools.tools.length < minTools) {
    throw new Error(`Expected at least ${minTools} tools, got ${tools.tools.length}`);
  }

  const result = await client.callTool({
    name: "kernel.catalog.search",
    arguments: { query: "qa", limit: 2 }
  });

  if (!Array.isArray(result.content) || result.content.length === 0) {
    throw new Error("Smoke tool call returned no content");
  }

  await client.close();
  return { tools: tools.tools.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runMcpSmoke();
  console.log("MCP smoke passed.");
  console.log(`Tools: ${result.tools}`);
}
