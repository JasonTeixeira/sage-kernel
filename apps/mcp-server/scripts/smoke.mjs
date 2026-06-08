import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["apps/mcp-server/src/server.mjs"],
  cwd: process.cwd()
});

const client = new Client({
  name: "sage-kernel-smoke",
  version: "0.1.0"
});

await client.connect(transport);

const tools = await client.listTools();
if (tools.tools.length < 8) {
  throw new Error(`Expected at least 8 tools, got ${tools.tools.length}`);
}

const result = await client.callTool({
  name: "kernel.catalog.search",
  arguments: { query: "qa", limit: 2 }
});

if (!Array.isArray(result.content) || result.content.length === 0) {
  throw new Error("Smoke tool call returned no content");
}

await client.close();

console.log("MCP smoke passed.");
console.log(`Tools: ${tools.tools.length}`);
