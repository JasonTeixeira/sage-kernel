// Cross-file (interprocedural) taint dataflow (P32). Intra-procedural taint
// (taint.mjs) catches source->sink inside one function. This catches the chain
// ACROSS files: an untrusted parameter in file A forwarded to an imported
// function in file B whose corresponding parameter reaches a sink.
//
// HONEST DEPTH LIMIT: conservative, direct-call chains of depth 2 (A -> imported
// B). Not path-sensitive; aliasing handled one level. Findings record depth so
// the limit is visible. Low false positives: only untrusted-named source params
// + real sinks count.

import fs from "node:fs";
import path from "node:path";
import { safeParse, collectNodes } from "../ast/parse.mjs";

const SOURCE_NAME = /^(req|request|userinput|untrusted|payload)$/i;
const SINK_IDENTS = new Set(["eval", "exec", "execSync"]);
const SINK_MEMBERS = new Set(["query", "exec", "execSync"]);
const CODE = /\.(mjs|cjs|js|jsx)$/;
const IGNORED = new Set([".git", "node_modules", ".sage-kernel", "dist", "build", "coverage", "generated"]);

function rootIdentifier(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") return rootIdentifier(node.object);
  return null;
}

const identifiersIn = (node) => collectNodes(node, "Identifier").map((n) => n.name);

function isSinkCallee(callee) {
  if (!callee) return false;
  if (callee.type === "Identifier") return SINK_IDENTS.has(callee.name);
  if (callee.type === "MemberExpression") return SINK_MEMBERS.has(callee.property?.name);
  return false;
}

function calleeName(callee) {
  if (!callee) return null;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression") return callee.property?.name || null;
  return null;
}

function analyzeFunction(fnNode) {
  const params = (fnNode.params || []).map((p) => (p.type === "Identifier" ? p.name : null));
  const paramIndex = new Map(params.map((n, i) => [n, i]).filter(([n]) => n));
  const aliasToIdx = new Map();
  for (const decl of collectNodes(fnNode, "VariableDeclarator")) {
    const id = decl.id?.type === "Identifier" ? decl.id.name : null;
    const origin = rootIdentifier(decl.init); // bare param/member alias only; sanitizer call -> null
    if (id && origin && paramIndex.has(origin)) aliasToIdx.set(id, paramIndex.get(origin));
  }
  const idxOf = (name) => (paramIndex.has(name) ? paramIndex.get(name) : aliasToIdx.has(name) ? aliasToIdx.get(name) : null);

  const sinkParamIndices = new Set();
  const forwards = [];
  for (const call of collectNodes(fnNode, "CallExpression")) {
    const sink = isSinkCallee(call.callee);
    const name = calleeName(call.callee);
    (call.arguments || []).forEach((arg, i) => {
      for (const ident of identifiersIn(arg)) {
        const pi = idxOf(ident);
        if (pi == null) continue;
        if (sink) sinkParamIndices.add(pi);
        else if (name) forwards.push({ callee: name, argIndex: i, fromParamIndex: pi });
      }
    });
  }
  const sourceParamIndices = new Set(params.map((n, i) => (n && SOURCE_NAME.test(n) ? i : null)).filter((x) => x != null));
  return { sinkParamIndices, forwards, sourceParamIndices };
}

function topFunctions(ast) {
  const fns = {};
  for (const node of collectNodes(ast, "FunctionDeclaration")) {
    if (node.id?.name) fns[node.id.name] = analyzeFunction(node);
  }
  return fns;
}

function importMap(ast, relPath, resolve) {
  const map = new Map();
  for (const node of collectNodes(ast, "ImportDeclaration")) {
    const src = node.source?.value;
    if (!src || !src.startsWith(".")) continue;
    const resolved = resolve(relPath, src);
    if (!resolved) continue;
    for (const spec of node.specifiers || []) {
      const local = spec.local?.name;
      const imported = spec.imported?.name || spec.local?.name;
      if (local) map.set(local, { file: resolved, imported });
    }
  }
  return map;
}

// Build the per-file analysis map given a set of {path, content} + a resolver.
function buildByFile(files, resolve) {
  const byFile = new Map();
  for (const file of files) {
    if (!CODE.test(file.path)) continue;
    const ast = safeParse(file.content);
    if (!ast) continue;
    byFile.set(file.path, { fns: topFunctions(ast), imports: importMap(ast, file.path, resolve) });
  }
  return byFile;
}

function interproceduralFindings(byFile) {
  const findings = [];
  for (const [relA, infoA] of byFile) {
    for (const [fnName, fn] of Object.entries(infoA.fns)) {
      for (const fwd of fn.forwards) {
        if (!fn.sourceParamIndices.has(fwd.fromParamIndex)) continue; // only untrusted-origin forwards
        const imp = infoA.imports.get(fwd.callee);
        if (!imp) continue; // intra-file handled by taint.mjs; unresolved import skipped
        const calleeFn = byFile.get(imp.file)?.fns?.[imp.imported];
        if (calleeFn && calleeFn.sinkParamIndices.has(fwd.argIndex)) {
          findings.push({
            rule: "interprocedural-taint",
            severity: "high",
            sourceFile: relA,
            sourceFunction: fnName,
            sinkFile: imp.file,
            sinkFunction: imp.imported,
            argIndex: fwd.argIndex,
            depth: 2,
            message: `Untrusted input in ${relA}:${fnName} flows to a sink in ${imp.file}:${imp.imported} (arg ${fwd.argIndex}).`
          });
        }
      }
    }
  }
  return findings;
}

// In-memory: resolve imports against the provided file-path set (no fs).
function memoryResolver(files) {
  const paths = new Set(files.map((f) => f.path));
  return (fromRel, spec) => {
    const dir = path.dirname(fromRel);
    for (const cand of [spec, `${spec}.mjs`, `${spec}.js`, `${spec}/index.mjs`, `${spec}/index.js`]) {
      const joined = path.normalize(path.join(dir, cand));
      if (paths.has(joined)) return joined;
    }
    return null;
  };
}

export function analyzeInterprocedural(files = []) {
  const byFile = buildByFile(files, memoryResolver(files));
  return { findings: interproceduralFindings(byFile), depthLimit: 2, note: "Conservative direct-call cross-file taint (depth<=2, one-level alias). Not path-sensitive." };
}

// Real tree: resolve imports against the filesystem.
export function scanInterprocedural(options = {}) {
  const root = options.root || process.cwd();
  const rels = options.files || listCode(root);
  const files = [];
  for (const rel of rels) {
    try {
      files.push({ path: rel, content: fs.readFileSync(path.join(root, rel), "utf8") });
    } catch { /* skip */ }
  }
  const resolve = (fromRel, spec) => {
    const baseDir = path.dirname(path.join(root, fromRel));
    for (const cand of [spec, `${spec}.mjs`, `${spec}.js`, `${spec}/index.mjs`, `${spec}/index.js`]) {
      const abs = path.resolve(baseDir, cand);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return path.relative(root, abs);
    }
    return null;
  };
  const byFile = buildByFile(files, resolve);
  const findings = interproceduralFindings(byFile);
  const high = findings.filter((f) => f.severity === "high").length;
  return { status: high > 0 ? "failed" : "passed", filesScanned: byFile.size, high, findings, depthLimit: 2 };
}

function listCode(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listCode(full, base));
    else if (CODE.test(entry.name) && !/\.(test|spec)\.[cm]?js$/.test(entry.name)) out.push(path.relative(base, full));
  }
  return out.sort();
}
