// AST-backed source review. Replaces existence-only heuristics with structural
// findings parsed from real code (acorn). Every check is conservative — it only
// flags genuine defect signals, never style preference — because these findings
// feed the kernel's own review score. On parse failure the file is skipped
// (the engine's existing heuristics remain the fallback).

import fs from "node:fs";
import path from "node:path";
import { safeParse, walkAst, nodeLine } from "../ast/parse.mjs";

const IGNORED_DIRS = new Set([".git", "node_modules", ".sage-kernel", "dist", "build", "coverage", "generated"]);
const MAX_FILES = 800;
const MAX_BYTES = 300000;
const CODE_FILE = /\.(mjs|cjs|js|jsx|ts|tsx|mts|cts)$/;
// exec/execSync always run through a shell, so any dynamic command is injection-prone.
const SHELL_ALWAYS = new Set(["exec", "execSync"]);
// spawn-family only shells when { shell: true }; otherwise args are an execvp array.
const SPAWN_LIKE = new Set(["spawn", "spawnSync", "execFile", "execFileSync"]);
const CHILD_PROCESS_ALIASES = new Set(["child_process", "cp", "childProcess", "node:child_process"]);

// Audit a single source file's text. Returns findings tagged with a review
// category ("clean_code" | "security"). Returns [] when the source cannot be
// parsed (caller falls back to heuristics).
export function auditSourceFile(relPath, source) {
  const comments = [];
  const ast = safeParse(source, { onComment: comments });
  if (!ast) return [];
  const findings = [];
  const at = (node) => `${relPath}:${nodeLine(node) ?? "?"}`;
  // An empty catch is only a silent-failure bug when undocumented; a comment
  // marks a deliberate best-effort swallow (the standard no-empty convention).
  const hasCommentInside = (node) => comments.some((c) => c.start >= node.start && c.end <= node.end);

  // Reference counts for unused-local detection. The parser-agnostic walker
  // visits every Identifier (including the binding itself), so an unused local
  // appears exactly once (only its declaration); any real use makes it >= 2.
  const refs = new Map();
  walkAst(ast, { Identifier: (node) => refs.set(node.name, (refs.get(node.name) || 0) + 1) });

  // Names that escape the module (exported) must never be flagged as unused.
  const exported = new Set();
  walkAst(ast, {
    ExportNamedDeclaration: (node) => {
      for (const spec of node.specifiers || []) if (spec.local?.name) exported.add(spec.local.name);
      for (const decl of node.declaration?.declarations || []) if (decl.id?.type === "Identifier") exported.add(decl.id.name);
      if (node.declaration?.id?.name) exported.add(node.declaration.id.name);
    }
  });

  walkAst(ast, {
    CallExpression(node) {
      if (calleeName(node.callee) === "eval" && node.callee.type === "Identifier") {
        findings.push(mk("high", "security", `Uses eval() — dynamic code execution.`, at(node), "Remove eval(); parse or dispatch explicitly."));
      }
      const exec = execCallName(node.callee);
      if (!exec) return;
      const arg0 = node.arguments?.[0];
      const building = isCommandString(arg0);
      const shelled = SHELL_ALWAYS.has(exec) || hasShellTrue(node.arguments);
      if (!shelled || !isDynamic(arg0)) return;
      if (building) {
        // Command assembled by concatenation/interpolation through a shell — exploitable.
        findings.push(mk("high", "security", `Shell command built from interpolation (${exec}) — command injection risk.`, at(node), "Pass a literal command with a validated argument array; never interpolate into a shell command."));
      } else {
        // Trusted variable run through a shell — a risky pattern, not a proven exploit.
        findings.push(mk("medium", "security", `Dynamic command run through a shell (${exec}) — prefer shell:false with an argument array.`, at(node), "Avoid shell:true; pass the command and arguments separately, and allowlist provider commands."));
      }
    },
    NewExpression(node) {
      if (calleeName(node.callee) === "Function") {
        findings.push(mk("high", "security", `Uses new Function() — dynamic code execution.`, at(node), "Replace dynamic Function construction with explicit code."));
      }
    },
    CatchClause(node) {
      if ((node.body?.body?.length || 0) === 0 && !hasCommentInside(node.body)) {
        findings.push(mk("medium", "clean_code", `Empty, undocumented catch block silently swallows errors.`, at(node), "Handle the error, or document the deliberate swallow with a comment."));
      }
    },
    BinaryExpression(node) {
      if ((node.operator === "==" || node.operator === "!=") && !isNullLiteral(node.left) && !isNullLiteral(node.right)) {
        findings.push(mk("low", "clean_code", `Non-strict equality (${node.operator}).`, at(node), "Use === / !== to avoid coercion bugs."));
      }
    },
    VariableDeclaration(node) {
      if (node.kind !== "const" && node.kind !== "let") return;
      for (const decl of node.declarations || []) {
        if (decl.id?.type !== "Identifier") continue;
        const name = decl.id.name;
        if (exported.has(name)) continue;
        if ((refs.get(name) || 0) <= 1) {
          findings.push(mk("low", "clean_code", `Unused local "${name}" — declared but never referenced.`, at(decl), "Remove the dead binding."));
        }
      }
    }
  });

  return findings;
}

// Audit an entire source tree under projectRoot. Skips tests/fixtures and files
// that acorn cannot parse (e.g. TypeScript). Returns a flat findings array.
export function auditSourceTree(options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const files = (options.files || listSourceFiles(projectRoot)).slice(0, options.maxFiles || MAX_FILES);
  const findings = [];
  for (const rel of files) {
    if (!CODE_FILE.test(rel) || /\.d\.ts$/.test(rel)) continue;
    if (isTestOrFixture(rel)) continue;
    let source;
    try {
      const full = path.join(projectRoot, rel);
      if (fs.statSync(full).size > (options.maxBytes || MAX_BYTES)) continue;
      source = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    findings.push(...auditSourceFile(rel, source));
  }
  return findings;
}

export function astFindingsByCategory(findings) {
  return {
    clean_code: findings.filter((finding) => finding.category === "clean_code"),
    security: findings.filter((finding) => finding.category === "security")
  };
}

function mk(severity, category, message, evidence, recommendation) {
  return { severity, category, message, evidence, recommendation };
}

function calleeName(callee) {
  if (!callee) return null;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property?.type === "Identifier") return callee.property.name;
  return null;
}

// child_process exec/spawn call — only bare imported identifiers (the kernel's
// usage) or explicit child_process.* members. Excludes RegExp.prototype.exec
// (`/re/.exec(s)`) and unrelated `.exec` methods.
function execCallName(callee) {
  if (!callee) return null;
  if (callee.type === "Identifier" && (SHELL_ALWAYS.has(callee.name) || SPAWN_LIKE.has(callee.name))) return callee.name;
  if (callee.type === "MemberExpression" && callee.property?.type === "Identifier") {
    const name = callee.property.name;
    const objectName = callee.object?.type === "Identifier" ? callee.object.name : null;
    if ((SHELL_ALWAYS.has(name) || SPAWN_LIKE.has(name)) && objectName && CHILD_PROCESS_ALIASES.has(objectName)) return name;
  }
  return null;
}

function isDynamic(node) {
  if (!node) return false;
  if (node.type === "Literal") return false;
  if (node.type === "TemplateLiteral") return (node.expressions || []).length > 0;
  return node.type === "BinaryExpression" || node.type === "Identifier" || node.type === "CallExpression" || node.type === "MemberExpression";
}

// A command built by string concatenation or interpolation — classic injection.
function isCommandString(node) {
  if (!node) return false;
  if (node.type === "BinaryExpression" && node.operator === "+") return true;
  return node.type === "TemplateLiteral" && (node.expressions || []).length > 0;
}

// Detects a { shell: true } option in the call's argument list.
function hasShellTrue(args = []) {
  for (const arg of args) {
    if (arg?.type !== "ObjectExpression") continue;
    for (const prop of arg.properties || []) {
      if (prop.type === "Property" && prop.key?.name === "shell" && prop.value?.type === "Literal" && prop.value.value === true) return true;
    }
  }
  return false;
}

function isNullLiteral(node) {
  return node?.type === "Literal" && node.value === null;
}

function isTestOrFixture(file) {
  return /(^|\/)(tests?|__tests__|test-fixtures|fixtures)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

function listSourceFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full, base));
    else if (CODE_FILE.test(entry.name)) out.push(path.relative(base, full));
  }
  return out.sort();
}
