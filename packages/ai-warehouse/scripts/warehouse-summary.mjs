import fs from "node:fs";
import path from "node:path";

const sourceRoot =
  process.env.AI_WAREHOUSE_ROOT || "/Users/Sage/.graphify/repos/JasonTeixeira/ai-warehouse";
const indexPath = path.join(sourceRoot, "index.json");

if (!fs.existsSync(indexPath)) {
  throw new Error(`ai-warehouse index not found: ${indexPath}`);
}

const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const tools = Array.isArray(index.tools) ? index.tools : [];

const categories = new Map();
const verdicts = new Map();
const maturities = new Map();

for (const tool of tools) {
  const category = tool.category || "uncategorized";
  const verdict = tool.verdict || "unknown";
  const maturity = tool.maturity || "unknown";
  categories.set(category, (categories.get(category) || 0) + 1);
  verdicts.set(verdict, (verdicts.get(verdict) || 0) + 1);
  maturities.set(maturity, (maturities.get(maturity) || 0) + 1);
}

function top(map, limit = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

const summary = {
  sourceRoot,
  count: tools.length,
  topCategories: top(categories),
  verdicts: Object.fromEntries([...verdicts.entries()].sort()),
  maturities: Object.fromEntries([...maturities.entries()].sort()),
  hasMcpServer: fs.existsSync(path.join(sourceRoot, "mcp-server", "server.py")),
  hasHttpServer: fs.existsSync(path.join(sourceRoot, "mcp-server", "http_server.py")),
  hasTemplates: fs.existsSync(path.join(sourceRoot, "templates")),
  hasPlaybooks: fs.existsSync(path.join(sourceRoot, "playbooks")),
  hasPrompts: fs.existsSync(path.join(sourceRoot, "prompts"))
};

console.log(JSON.stringify(summary, null, 2));
