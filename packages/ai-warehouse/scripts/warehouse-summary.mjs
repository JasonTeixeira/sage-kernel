import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function top(map, limit = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

export function createWarehouseSummary(options = {}) {
  const sourceRoot = options.sourceRoot || process.env.AI_WAREHOUSE_ROOT;
  if (!sourceRoot) {
    throw new Error("AI Warehouse source root is not configured. Set AI_WAREHOUSE_ROOT.");
  }
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

  return {
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
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(createWarehouseSummary(), null, 2));
}
