// AST cyclomatic-complexity analyzer. A real maintainability signal: each
// function's branch complexity (1 + decision points) and length are measured,
// and a budget gate flags functions that have grown too complex. A `switch` is
// counted as a single branch (dispatch tables are not penalized per case).

import fs from "node:fs";
import path from "node:path";
import { safeParse, walkAst, nodeLine } from "../ast/parse.mjs";

const IGNORED_DIRS = new Set([".git", "node_modules", ".sage-kernel", "dist", "build", "coverage", "generated"]);
const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const SIMPLE_DECISIONS = new Set([
  "IfStatement", "ForStatement", "ForInStatement", "ForOfStatement",
  "WhileStatement", "DoWhileStatement", "ConditionalExpression", "CatchClause", "SwitchStatement"
]);

export function computeFileComplexity(source) {
  const ast = safeParse(source);
  if (!ast) return [];
  const functions = new Map();
  const register = (node) => functions.set(node, { name: functionName(node), line: nodeLine(node), complexity: 1, lines: bodyLines(node) });
  walkAst(ast, { FunctionDeclaration: register, FunctionExpression: register, ArrowFunctionExpression: register });

  const bump = (node, _state, ancestors) => {
    for (let i = ancestors.length - 2; i >= 0; i -= 1) {
      if (FUNCTION_TYPES.has(ancestors[i].type)) {
        const entry = functions.get(ancestors[i]);
        if (entry) entry.complexity += 1;
        return;
      }
    }
  };
  const visitors = {};
  for (const type of SIMPLE_DECISIONS) visitors[type] = bump;
  visitors.LogicalExpression = (node, state, ancestors) => {
    if (["&&", "||", "??"].includes(node.operator)) bump(node, state, ancestors);
  };
  walkAst(ast, visitors, { mode: "ancestor" });

  return [...functions.values()];
}

export function analyzeComplexity(options = {}) {
  const root = options.root || process.cwd();
  const maxComplexity = options.maxComplexity ?? 25;
  const maxLines = options.maxLines ?? 120;
  // Documented exemptions for flat dispatch/detection/template functions:
  // high cyclomatic, low cognitive complexity (a routing table, not tangled logic).
  const allow = new Set(options.allow || []);
  const files = (options.files || listSourceFiles(root)).slice(0, options.maxFiles || 2000);
  const violations = [];
  let functionsScanned = 0;
  let allowed = 0;
  let worst = { complexity: 0 };
  for (const rel of files) {
    if (isTestOrFixture(rel)) continue;
    let source;
    try {
      source = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    for (const fn of computeFileComplexity(source)) {
      functionsScanned += 1;
      if (fn.complexity > worst.complexity) worst = { ...fn, file: rel };
      if (fn.complexity > maxComplexity || fn.lines > maxLines) {
        if (allow.has(`${rel}#${fn.name}`)) {
          allowed += 1;
          continue;
        }
        violations.push({ file: rel, name: fn.name, line: fn.line, complexity: fn.complexity, lines: fn.lines });
      }
    }
  }
  return {
    status: violations.length === 0 ? "passed" : "failed",
    maxComplexity,
    maxLines,
    functionsScanned,
    allowedExemptions: allowed,
    worst,
    violations: violations.sort((a, b) => b.complexity - a.complexity)
  };
}

function functionName(node) {
  if (node.id?.name) return node.id.name;
  return `anonymous@${nodeLine(node) ?? "?"}`;
}

function bodyLines(node) {
  if (!node.loc) return 0;
  return node.loc.end.line - node.loc.start.line + 1;
}

const isTestOrFixture = (file) => /(^|\/)(tests?|__tests__|test-fixtures|fixtures)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);

function listSourceFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full, base));
    else if (/\.(mjs|cjs|js|jsx|ts|tsx|mts|cts)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(path.relative(base, full));
  }
  return out.sort();
}
