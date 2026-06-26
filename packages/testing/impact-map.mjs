// Test Impact Mapper — maps changed files to the tests that exercise them, via
// (1) real import-reference analysis of the test sources and (2) a static map of
// known surface→test rules. Risky changes with no mapped test fail coverage so
// the operate loop can refuse to trust an unverified change.

import fs from "node:fs";
import path from "node:path";
import { buildModuleGraph, coveringTests } from "./module-graph.mjs";

// Static surface rules: a changed-file pattern -> test files that must cover it.
const STATIC_RULES = [
  { pattern: /(apps\/mcp-server\/|tools\.json|kernel-tools|kernel-tool-helpers)/, tests: ["tests/mcp-contracts.test.mjs", "tests/mcp-integration.test.mjs"] },
  { pattern: /apps\/dashboard\//, tests: ["tests/dashboard-app.test.mjs"] },
  { pattern: /packages\/review\//, tests: ["tests/review-engine.test.mjs", "tests/review-report.test.mjs"] },
  { pattern: /packages\/security\//, tests: ["tests/security-kernel.test.mjs"] },
  { pattern: /packages\/proof\/ledger/, tests: ["tests/proof-ledger.test.mjs"] },
  { pattern: /packages\/proof\/graph/, tests: ["tests/proof-graph.test.mjs"] },
  { pattern: /packages\/proof\/claim-firewall/, tests: ["tests/claim-firewall.test.mjs"] },
  { pattern: /packages\/workflows\//, tests: ["tests/workflows-engine.test.mjs"] },
  { pattern: /packages\/profiles\//, tests: ["tests/profiles.test.mjs"] }
];

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const TEST_IGNORE = new Set(["node_modules", ".git", ".sage-kernel", "dist", "build", "coverage", ".next", "generated"]);

// Discover test files ANYWHERE in the repo, not just a top-level tests/ dir, so
// co-located tests (src/foo.test.ts, __tests__/, *.spec.*) — the default for
// Jest/Vitest/most real repos — are actually found. Bounded to keep it fast.
function listTestFiles(root, dir = root, depth = 0) {
  if (depth > 8) return [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const entry of entries) {
    if (TEST_IGNORE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTestFiles(root, full, depth + 1));
    else if (TEST_FILE.test(entry.name)) out.push(path.relative(root, full));
  }
  return out;
}

// A test references a file when one of its IMPORT lines resolves to that module.
// Scanning only import/from/require lines avoids matching incidental string
// mentions (e.g. a path written as test data).
function testReferencesFile(root, testFile, changedFile) {
  const full = path.join(root, testFile);
  if (!fs.existsSync(full)) return false;
  const withoutExt = changedFile.replace(/\.(mjs|js|ts|tsx|jsx)$/, "");
  const base = path.basename(withoutExt);
  const importLines = fs
    .readFileSync(full, "utf8")
    .split("\n")
    .filter((line) => /\b(import|from|require)\b/.test(line));
  return importLines.some(
    (line) => line.includes(changedFile) || line.includes(withoutExt) || new RegExp(`[\\/]${base}\\.(mjs|js|ts)`).test(line)
  );
}

function staticTestsForFile(file, root) {
  const tests = STATIC_RULES.filter((rule) => rule.pattern.test(file)).flatMap((rule) => rule.tests);
  return tests.filter((test) => fs.existsSync(path.join(root, test)));
}

export function mapTestImpact(files = [], options = {}) {
  const root = options.root || process.cwd();
  const allTests = listTestFiles(root);
  const overrides = loadOverrides(root, options);
  // A real dependency graph gives transitive coverage: a test covers a changed
  // file when it reaches it through the import graph, not only by naming it.
  const graph = options.graph || buildModuleGraph(root);

  const mapped = files.map((file) => {
    const graphTests = coveringTests(graph, file, allTests);
    const importTests = allTests.filter((test) => testReferencesFile(root, test, file));
    const staticTests = [...staticTestsForFile(file, root), ...(overrides[file] || [])];
    const tests = [...new Set([...graphTests, ...importTests, ...staticTests])];
    return { file, tests, covered: tests.length > 0 };
  });

  const uncovered = mapped.filter((entry) => !entry.covered).map((entry) => entry.file);
  const requiredTests = [...new Set(mapped.flatMap((entry) => entry.tests))];
  const requireCoverage = options.requireCoverage !== false;
  const status = requireCoverage && uncovered.length > 0 ? "failed" : "passed";

  return { status, files: mapped, uncovered, requiredTests };
}

function loadOverrides(root, options) {
  if (options.testMap) return options.testMap;
  const file = path.join(root, ".sage-kernel/test-map.json");
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

export function writeTestMap(map, options = {}) {
  const root = options.root || process.cwd();
  const file = path.join(root, ".sage-kernel/test-map.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`);
  return file;
}
