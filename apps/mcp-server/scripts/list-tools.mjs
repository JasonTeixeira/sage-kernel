import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "apps/mcp-server/tools.json"), "utf8"));

for (const tool of manifest.tools) {
  console.log(`${tool.name} | ${tool.description}`);
}
