import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

// This file is an SDK-backed example. The dependency-free dispatcher in
// scripts/call-tool.mjs is the active local implementation until MCP SDK
// dependencies are installed.

const server = new McpServer({
  name: "sage-kernel",
  version: "0.1.0"
});

server.registerTool(
  "kernel.phase.status",
  {
    description: "List Sage Kernel phase status.",
    inputSchema: z.object({})
  },
  async () => ({
    content: [{ type: "text", text: "Wire this handler to scripts/call-tool.mjs." }]
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
