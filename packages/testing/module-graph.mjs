// Real module dependency graph. Parses every source module (acorn), resolves
// relative import/export/dynamic-import/require specifiers to repo files, and
// exposes reverse reachability so a changed file's transitive dependents — and
// therefore the tests that reach it — can be computed. Falls back to a regex
// scan only when a file cannot be parsed.

import fs from "node:fs";
import path from "node:path";
import { safeParse, walkAst } from "../ast/parse.mjs";
import { readTsconfigAliases, resolveAlias } from "../ast/tsconfig-resolve.mjs";

const IGNORED_DIRS = new Set([".git", "node_modules", ".sage-kernel", "dist", "build", "coverage", "generated"]);

export function buildModuleGraph(root, options = {}) {
  const files = options.files || listJsFiles(root);
  const known = new Set(files);
  const tsconfig = options.tsconfig || readTsconfigAliases(root);
  const importsByFile = {};
  const reverse = {};
  for (const file of files) {
    const source = read(root, file);
    const ast = safeParse(source);
    const specs = ast ? extractSpecsAst(ast) : extractSpecsRegex(source);
    const targets = [];
    for (const spec of specs) {
      const resolved = resolveSpec(file, spec, known, tsconfig);
      if (resolved) {
        targets.push(resolved);
        (reverse[resolved] ||= []).push(file);
      }
    }
    importsByFile[file] = [...new Set(targets)];
  }
  return { files, importsByFile, reverse };
}

// Every file that transitively imports `file` (its dependents). Excludes `file`.
export function dependentsOf(graph, file) {
  const seen = new Set();
  const queue = [file];
  while (queue.length) {
    const current = queue.shift();
    for (const importer of graph.reverse[current] || []) {
      if (!seen.has(importer)) {
        seen.add(importer);
        queue.push(importer);
      }
    }
  }
  return seen;
}

// Tests that reach `file` through the import graph (transitive coverage).
export function coveringTests(graph, file, testFiles) {
  const dependents = dependentsOf(graph, file);
  const tests = (testFiles || graph.files.filter(isTestFile)).filter((test) => dependents.has(test));
  if (isTestFile(file)) tests.push(file);
  return [...new Set(tests)];
}

function extractSpecsAst(ast) {
  const specs = [];
  walkAst(ast, {
    ImportDeclaration: (node) => node.source && specs.push(node.source.value),
    ExportNamedDeclaration: (node) => node.source && specs.push(node.source.value),
    ExportAllDeclaration: (node) => node.source && specs.push(node.source.value),
    ImportExpression: (node) => node.source?.type === "Literal" && specs.push(node.source.value),
    CallExpression: (node) => {
      if (node.callee?.type === "Identifier" && node.callee.name === "require" && node.arguments?.[0]?.type === "Literal") {
        specs.push(node.arguments[0].value);
      }
    }
  });
  return specs.filter((spec) => typeof spec === "string");
}

function extractSpecsRegex(source) {
  const specs = [];
  for (const m of String(source).matchAll(/(?:import|export)[^;]*?from\s*["']([^"']+)["']/g)) specs.push(m[1]);
  for (const m of String(source).matchAll(/(?:import|require)\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
  return specs;
}

function resolveSpec(fromFile, spec, known, tsconfig) {
  if (!spec.startsWith(".") && !spec.startsWith("/")) {
    // Bare specifier: try a tsconfig path alias before treating it as external.
    return tsconfig ? resolveAlias(spec, tsconfig, known) : null;
  }
  const fromDir = path.posix.dirname(toPosix(fromFile));
  const base = path.posix.normalize(path.posix.join(fromDir, toPosix(spec)));
  const candidates = [base, `${base}.mjs`, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}/index.mjs`, `${base}/index.js`, `${base}/index.ts`, `${base}/index.tsx`];
  for (const candidate of candidates) {
    const rel = candidate.replace(/^\.\//, "");
    if (known.has(rel)) return rel;
  }
  return null;
}

function listJsFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full, base));
    else if (/\.(mjs|cjs|js|jsx|ts|tsx|mts|cts)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(toPosix(path.relative(base, full)));
  }
  return out;
}

const isTestFile = (file) => /(^|\/)tests?\//.test(file) && /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
const toPosix = (p) => String(p).replace(/\\/g, "/");
const read = (root, file) => {
  try {
    return fs.readFileSync(path.join(root, file), "utf8");
  } catch {
    return "";
  }
};
