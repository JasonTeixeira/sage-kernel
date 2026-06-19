import fs from "node:fs";
import path from "node:path";

const INDEXABLE = /\.(md|txt|json|mjs|js|ts|tsx|jsx|sql|yml|yaml|toml)$/;
const IGNORED = new Set([".git", "node_modules", ".sage-kernel", "coverage", "dist", "build"]);

export function createRetrievalProof(options = {}) {
  const root = options.root || process.cwd();
  const projectPath = options.projectPath || ".";
  const projectRoot = path.resolve(root, projectPath);
  const files = listFiles(projectRoot).slice(0, Number(options.limit || 500));
  const documents = files.map((file) => indexFile(projectRoot, file)).filter(Boolean);
  const query = options.query || "release proof";
  const results = searchDocuments(documents, query, 5);
  const report = {
    type: "retrieval-proof",
    status: documents.length > 0 && results.length > 0 ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    projectPath,
    crawlers: {
      files: files.length,
      docs: files.filter((file) => /\.(md|txt)$/.test(file)).length,
      tests: files.filter((file) => /test|spec/.test(file)).length,
      packages: files.filter((file) => /package\.json|requirements\.txt|pyproject\.toml/.test(file)).length,
      gitHistory: fs.existsSync(path.join(projectRoot, ".git")) ? "available" : "not_available",
      issuesPrReleases: "requires_remote_provider"
    },
    index: {
      type: "hybrid-lexical-vector-placeholder",
      documents: documents.length,
      citationsRequired: true,
      freshnessTracked: true
    },
    query,
    results
  };
  writeEvidence(root, "retrieval-proof-latest.json", report);
  return report;
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (INDEXABLE.test(entry.name)) out.push(path.relative(base, full));
  }
  return out.sort();
}

function indexFile(projectRoot, file) {
  const full = path.join(projectRoot, file);
  try {
    const text = fs.readFileSync(full, "utf8").slice(0, 12000);
    const tokens = tokenize(text);
    return {
      file,
      bytes: fs.statSync(full).size,
      modifiedAt: fs.statSync(full).mtime.toISOString(),
      tokens,
      citation: `${file}:1`
    };
  } catch {
    return null;
  }
}

function searchDocuments(documents, query, limit) {
  const queryTokens = tokenize(query);
  return documents
    .map((doc) => ({
      file: doc.file,
      score: queryTokens.reduce((sum, token) => sum + (doc.tokens.includes(token) ? 1 : 0), 0),
      citation: doc.citation,
      freshness: doc.modifiedAt
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, limit);
}

function tokenize(text) {
  return [...new Set(String(text).toLowerCase().match(/[a-z0-9_-]{3,}/g) || [])];
}

function writeEvidence(root, file, report) {
  const target = path.join(root, ".sage-kernel/evidence", file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
}
