// Centralized secret scanner — one source of truth for secret patterns, used by
// both `npm run security:scan` (CLI) and the security proof. Previously these
// patterns were duplicated and the real scan ran outside the security proof.

import fs from "node:fs";
import path from "node:path";

export const SECRET_PATTERNS = [
  { id: "openai-key", regex: /sk-[A-Za-z0-9_-]{20,}/ },
  { id: "generic-secret-assignment", regex: /(SECRET|TOKEN|API_KEY|PASSWORD)=([A-Za-z0-9_./+=-]{20,})/i },
  { id: "playwright-token-value", regex: /PLAYWRIGHT_MCP_EXTENSION_TOKEN=[A-Za-z0-9_-]{20,}/ },
  { id: "aws-access-key", regex: /AKIA[0-9A-Z]{16}/ },
  { id: "private-key-block", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ }
];

const IGNORED_DIRS = new Set([".git", "node_modules", ".sage-kernel", "generated", "dist", "build", "coverage"]);
const IGNORED_FILES = new Set([".env.local"]);

export function scanForSecrets(options = {}) {
  const root = options.root || process.cwd();
  const patterns = options.patterns || SECRET_PATTERNS;
  const findings = [];

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (IGNORED_FILES.has(entry.name)) continue;
      let text;
      try {
        text = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      for (const pattern of patterns) {
        if (pattern.regex.test(text)) findings.push({ file: path.relative(root, full), pattern: pattern.id });
      }
    }
  };

  if (fs.existsSync(root)) walk(root);
  return { status: findings.length === 0 ? "passed" : "failed", findings };
}
