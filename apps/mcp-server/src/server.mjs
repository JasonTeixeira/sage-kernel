import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createKernelRuntime } from "../../../packages/core/runtime.mjs";
import { registerKernelPrompts } from "./kernel-prompts.mjs";
import { registerKernelResources } from "./kernel-resources.mjs";
import { toMcpTextContent } from "./kernel-tools.mjs";
import { loadProjectPlugins } from "../../../packages/plugins/registry.mjs";

const root = process.cwd();

export async function createServer() {
  const server = new McpServer({
    name: "sage-kernel",
    version: "0.3.0"
  });

  const runtime = createKernelRuntime({ root });
  await runtime.loadBuiltInTools();
  // Load project-supplied plugins (languages/engines/profiles) so extensibility
  // is real: a project adds capability by dropping a file in .sage-kernel/plugins.
  await loadProjectPlugins({ root });

  for (const tool of runtime.entries()) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.zodSchema }, async (input) => {
      const result = await runtime.call(tool.name, input);
      return toMcpTextContent(result);
    });
  }
  registerKernelResources(server, { root });
  registerKernelPrompts(server);

  return server;
}

export async function main() {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
