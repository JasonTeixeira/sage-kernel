import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([".git", "node_modules", ".sage-kernel", "generated", "dist"]);
const ignoredFiles = new Set([".env.local"]);
const findings = [];

const patterns = [
  { id: "openai-key", regex: /sk-[A-Za-z0-9_-]{20,}/ },
  { id: "generic-secret-assignment", regex: /(SECRET|TOKEN|API_KEY|PASSWORD)=([A-Za-z0-9_./+=-]{20,})/i },
  { id: "playwright-token-value", regex: /PLAYWRIGHT_MCP_EXTENSION_TOKEN=[A-Za-z0-9_-]{20,}/ }
];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (entry.isDirectory()) {
      walk(full);
    } else if (!ignoredFiles.has(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      for (const pattern of patterns) {
        if (pattern.regex.test(text)) findings.push({ file: rel, pattern: pattern.id });
      }
    }
  }
}

walk(root);

if (findings.length) {
  console.error(JSON.stringify({ findings }, null, 2));
  process.exit(1);
}

console.log("Secret scan passed.");
