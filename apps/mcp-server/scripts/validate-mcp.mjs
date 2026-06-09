import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "apps/mcp-server/tools.json");

if (!fs.existsSync(manifestPath)) {
  throw new Error("Missing apps/mcp-server/tools.json");
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const seen = new Set();

if (!manifest.server?.name) {
  throw new Error("MCP manifest missing server.name");
}

if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
  throw new Error("MCP manifest needs at least one tool");
}

for (const tool of manifest.tools) {
  if (!tool.name) throw new Error("MCP tool missing name");
  if (seen.has(tool.name)) throw new Error(`Duplicate MCP tool: ${tool.name}`);
  seen.add(tool.name);
  if (!tool.description) throw new Error(`MCP tool ${tool.name} missing description`);
  if (!tool.inputSchema?.type) throw new Error(`MCP tool ${tool.name} missing inputSchema.type`);
  if ((tool.sideEffects || tool.approvalRequired) && !tool.permission) {
    throw new Error(`MCP tool ${tool.name} with side effects must declare permission`);
  }
}

console.log("MCP manifest validation passed.");
console.log(`Tools: ${manifest.tools.length}`);
