// Dead-code / refactor engine — detects real debt without adding dependencies:
//   1. unused exports  (exported symbols imported by nothing in the repo)
//   2. orphan files     (modules unreachable from any entrypoint or test)
//   3. unused deps      (package.json deps never imported)
//
// Parsing is regex-based (consistent with the repo's other extractors). It is
// intentionally conservative: namespace imports (`import * as`) and `export *`
// re-exports mark a module fully used, so the engine under-reports rather than
// produces false "dead" verdicts. Limitations: dynamic computed specifiers and
// string-built import paths are not resolved.

import fs from "node:fs";
import path from "node:path";
import { safeParse, walkAst } from "../ast/parse.mjs";
import { readTsconfigAliases, resolveAlias } from "../ast/tsconfig-resolve.mjs";

const SOURCE_DIRS = ["packages", "apps", "bin", "scripts", "tests"];
const SKIP_DIRS = new Set(["node_modules", ".git", ".sage-kernel", "generated", "dist", "build", "coverage"]);

const CODE_EXT = "(mjs|cjs|js|jsx|ts|tsx|mts|cts)";

// Entrypoints are never orphans: CLIs, scripts, tests, and app servers are roots.
function isEntrypoint(file) {
  return (
    file.startsWith("bin/") ||
    /(^|\/)scripts\//.test(file) ||
    // Standalone integration harnesses + the agent scripts they invoke via shell
    // (SAGE_AGENT_COMMAND), not via import — discovered by execution, not graph.
    /(^|\/)tests\/harness\//.test(file) ||
    /\.example\.[cm]?[jt]sx?$/.test(file) ||
    file.startsWith("examples/") ||
    // File-based routing roots (Next.js app/pages router, Expo router): the
    // framework discovers these by convention, not via imports.
    /(^|\/)app\/.+\.[cm]?[jt]sx?$/.test(file) ||
    /(^|\/)pages\/.+\.[cm]?[jt]sx?$/.test(file) ||
    // Framework/tooling convention roots (loaded by the framework, not imported).
    /(^|\/)(middleware|instrumentation|instrumentation-client)\.[cm]?[jt]s$/.test(file) ||
    /\.config\.[cm]?[jt]s$/.test(file) ||
    new RegExp(`\\.(test|spec)\\.${CODE_EXT}$`).test(file) ||
    new RegExp(`^apps/[^/]+/(src/)?(server|index|main|App)\\.${CODE_EXT}$`).test(file) ||
    new RegExp(`/(server|index|main|App)\\.${CODE_EXT}$`).test(file)
  );
}

function walk(root, dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(root, rel, out);
    else if (new RegExp(`\\.${CODE_EXT}$`).test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(rel);
  }
}

export function listSourceFiles(root) {
  const out = [];
  for (const dir of SOURCE_DIRS) {
    if (fs.existsSync(path.join(root, dir))) walk(root, dir, out);
  }
  return out.sort();
}

export function parseExports(body) {
  const names = new Set();
  for (const m of body.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of body.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of body.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(",")) {
      const seg = part.trim();
      if (!seg) continue;
      names.add(seg.includes(" as ") ? seg.split(/\s+as\s+/).pop().trim() : seg);
    }
  }
  if (/export\s+default\b/.test(body)) names.add("default");
  return [...names];
}

function parseImports(body) {
  const imports = [];
  for (const m of body.matchAll(/import\s+([^;'"]*?)\s+from\s+["']([^"']+)["']/g)) imports.push({ clause: m[1], spec: m[2] });
  for (const m of body.matchAll(/import\s+["']([^"']+)["']/g)) imports.push({ clause: "", spec: m[1] });
  for (const m of body.matchAll(/(?:import|require)\(\s*["']([^"']+)["']\s*\)/g)) imports.push({ clause: "*", spec: m[1] });
  for (const m of body.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) imports.push({ clause: "*", spec: m[1] });
  return imports;
}

function importedNames(clause) {
  const names = new Set();
  if (/\*\s+as\s+/.test(clause) || clause === "*") names.add("*");
  const braced = clause.match(/\{([^}]+)\}/);
  if (braced) {
    for (const part of braced[1].split(",")) {
      const seg = part.trim();
      if (seg) names.add(seg.split(/\s+as\s+/)[0].trim());
    }
  }
  const rest = clause.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+[A-Za-z0-9_$]+/, "");
  for (const token of rest.split(",").map((t) => t.trim()).filter(Boolean)) {
    if (/^[A-Za-z0-9_$]+$/.test(token)) names.add("default");
  }
  return [...names];
}

function resolveRelative(fromFile, spec, fileSet) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  const exts = ["mjs", "cjs", "js", "jsx", "ts", "tsx", "mts", "cts"];
  const candidates = [base, ...exts.map((ext) => `${base}.${ext}`), ...exts.map((ext) => `${base}/index.${ext}`)];
  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

// Strip string/template-literal contents and comments so `export ...`/`import ...`
// written inside fixture/test string data is not mistaken for real code.
export function stripCode(source) {
  return String(source ?? "")
    .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, "``")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

// AST extraction of a module's exports and imports (with imported names). Returns
// null on parse failure so buildModuleGraph falls back to the regex extractors.
export function astExportsAndImports(source) {
  const ast = safeParse(source);
  if (!ast) return null;
  const exports = new Set();
  const imports = [];
  walkAst(ast, {
    ExportNamedDeclaration(node) {
      if (node.declaration) {
        if (node.declaration.id?.name) exports.add(node.declaration.id.name);
        for (const decl of node.declaration.declarations || []) if (decl.id?.type === "Identifier") exports.add(decl.id.name);
      }
      for (const spec of node.specifiers || []) exports.add(spec.exported.name);
      if (node.source) imports.push({ spec: node.source.value, names: (node.specifiers || []).map((spec) => spec.local.name) });
    },
    ExportDefaultDeclaration() {
      exports.add("default");
    },
    ExportAllDeclaration(node) {
      if (node.source) imports.push({ spec: node.source.value, names: ["*"] });
    },
    ImportDeclaration(node) {
      const names = [];
      for (const spec of node.specifiers || []) {
        if (spec.type === "ImportDefaultSpecifier") names.push("default");
        else if (spec.type === "ImportNamespaceSpecifier") names.push("*");
        else if (spec.type === "ImportSpecifier") names.push(spec.imported.name);
      }
      imports.push({ spec: node.source.value, names });
    },
    ImportExpression(node) {
      if (node.source?.type === "Literal") imports.push({ spec: node.source.value, names: ["*"] });
    },
    CallExpression(node) {
      if (node.callee?.type === "Identifier" && node.callee.name === "require" && node.arguments?.[0]?.type === "Literal") {
        imports.push({ spec: node.arguments[0].value, names: ["*"] });
      }
    }
  });
  return { exports: [...exports], imports };
}

export function buildModuleGraph(root) {
  const files = listSourceFiles(root);
  const fileSet = new Set(files);
  const tsconfig = readTsconfigAliases(root);
  const exportsByFile = {};
  const importsByFile = {};
  const bareSpecs = new Set();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(root, file), "utf8");
    // Prefer precise AST extraction; fall back to the regex extractors when a
    // file cannot be parsed (keeps the engine resilient on exotic syntax).
    const parsed = astExportsAndImports(raw);
    const exportsList = parsed ? parsed.exports : parseExports(stripCode(raw));
    const importList = parsed
      ? parsed.imports
      : parseImports(raw).map((imp) => ({ spec: imp.spec, names: importedNames(imp.clause) }));
    exportsByFile[file] = exportsList;
    const edges = [];
    for (const imp of importList) {
      if (imp.spec.startsWith(".")) {
        const target = resolveRelative(file, imp.spec, fileSet);
        if (target) edges.push({ target, names: imp.names });
      } else if (!imp.spec.startsWith("node:")) {
        // Resolve tsconfig path aliases (e.g. @app/*) to real files; only truly
        // external specifiers fall through to bareSpecs.
        const aliasTarget = resolveAlias(imp.spec, tsconfig, fileSet);
        if (aliasTarget) edges.push({ target: aliasTarget, names: imp.names });
        else bareSpecs.add(imp.spec.startsWith("@") ? imp.spec.split("/").slice(0, 2).join("/") : imp.spec.split("/")[0]);
      }
    }
    importsByFile[file] = edges;
  }
  return { files, fileSet, exportsByFile, importsByFile, bareSpecs };
}

// Tests, fixtures, scripts and bin are entrypoints/test data, not a consumable
// API surface, so their exports are never reported as dead.
const EXPORT_SURFACE_EXCLUDE = [/\.(test|spec)\.[cm]?[jt]sx?$/, /test-fixtures\//, /(^|\/)fixtures\//, /(^|\/)scripts\//, /^bin\//];

export function isExportSurface(file) {
  return !EXPORT_SURFACE_EXCLUDE.some((pattern) => pattern.test(file));
}

export function findUnusedExports(graph) {
  const usedNamesByFile = {};
  const namespaceUsed = new Set();
  for (const file of graph.files) {
    for (const edge of graph.importsByFile[file]) {
      usedNamesByFile[edge.target] = usedNamesByFile[edge.target] || new Set();
      for (const name of edge.names) {
        if (name === "*") namespaceUsed.add(edge.target);
        else usedNamesByFile[edge.target].add(name);
      }
    }
  }
  const unused = [];
  for (const file of graph.files) {
    if (!isExportSurface(file) || namespaceUsed.has(file)) continue;
    const used = usedNamesByFile[file] || new Set();
    for (const name of graph.exportsByFile[file]) {
      if (!used.has(name)) unused.push({ file, name });
    }
  }
  return unused;
}

// Files invoked from package.json scripts (e.g. `node packages/x/scripts/y.mjs`)
// are real entrypoints even though nothing imports them.
function packageScriptEntrypoints(root, fileSet) {
  const entry = new Set();
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  } catch {
    return entry;
  }
  for (const command of Object.values(pkg.scripts || {})) {
    for (const m of String(command).matchAll(/([A-Za-z0-9_./-]+\.mjs)/g)) {
      if (fileSet.has(m[1])) entry.add(m[1]);
    }
  }
  return entry;
}

// Full entrypoint set: structural roots (bin, tests, top-level scripts, app
// servers) plus everything package.json scripts invoke.
export function defaultEntrypoints(root, graph) {
  const entry = new Set(graph.files.filter((file) => isEntrypoint(file)));
  for (const file of packageScriptEntrypoints(root, graph.fileSet)) entry.add(file);
  return entry;
}

export function findOrphanFiles(graph, entrypoints) {
  const roots = entrypoints || new Set(graph.files.filter((file) => isEntrypoint(file)));
  const reachable = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const file = queue.shift();
    for (const edge of graph.importsByFile[file] || []) {
      if (!reachable.has(edge.target)) {
        reachable.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return graph.files.filter((file) => !reachable.has(file));
}

export function findUnusedDependencies(root, graph) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  } catch {
    return [];
  }
  const deps = Object.keys(pkg.dependencies || {});
  return deps.filter((dep) => !graph.bareSpecs.has(dep));
}

// Default gate: orphan files and unused dependencies are high-confidence debt and
// fail the gate. Unused exports are reported as candidates (an export may be a
// public API surface) and only fail under strict:true.
export function analyzeDeadCode(root = process.cwd(), options = {}) {
  const graph = buildModuleGraph(root);
  const allow = new Set(options.allow || []);
  const entrypoints = defaultEntrypoints(root, graph);
  const unusedExports = findUnusedExports(graph).filter((entry) => !allow.has(`${entry.file}#${entry.name}`));
  const orphanFiles = findOrphanFiles(graph, entrypoints).filter((file) => !allow.has(file));
  const unusedDependencies = findUnusedDependencies(root, graph).filter((dep) => !allow.has(dep));

  const blocking = orphanFiles.length + unusedDependencies.length + (options.strict ? unusedExports.length : 0);
  return {
    status: blocking === 0 ? "passed" : "failed",
    strict: Boolean(options.strict),
    orphanFiles,
    unusedDependencies,
    unusedExports,
    summary: {
      filesScanned: graph.files.length,
      orphanFiles: orphanFiles.length,
      unusedDependencies: unusedDependencies.length,
      unusedExportCandidates: unusedExports.length
    }
  };
}
