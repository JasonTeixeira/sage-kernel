// Shared AST parsing helper — polyglot. JavaScript/MJS parse via acorn (fast);
// TypeScript/TSX parse via @typescript-eslint/typescript-estree. Both yield
// ESTree-compatible nodes, and a parser-agnostic walker traverses either, so the
// review / SAST / dead-code / mutation / impact engines work on JS *and* TS.
// Every consumer must tolerate parse failure (safeParse returns null).

import * as acorn from "acorn";
import { parse as tsEstreeParse } from "@typescript-eslint/typescript-estree";

const PARSE_OPTIONS = {
  ecmaVersion: "latest",
  sourceType: "module",
  locations: true,
  allowHashBang: true,
  allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true
};

// Parse JS/MJS with acorn. Throws on invalid syntax (use safeParse to tolerate).
export function parseModule(source, options = {}) {
  return acorn.parse(String(source ?? ""), { ...PARSE_OPTIONS, ...options });
}

// Parse TypeScript/TSX into an ESTree AST, normalized to expose acorn-style
// node.start/node.end (typescript-estree uses node.range) so splicing engines work.
export function parseTypeScript(source, options = {}) {
  const ast = tsEstreeParse(String(source ?? ""), { jsx: true, loc: true, range: true, comment: true, errorOnUnknownASTType: false });
  normalizeRanges(ast);
  if (Array.isArray(options.onComment) && Array.isArray(ast.comments)) {
    for (const comment of ast.comments) {
      options.onComment.push({ type: comment.type, value: comment.value, start: comment.range?.[0] ?? comment.start, end: comment.range?.[1] ?? comment.end });
    }
  }
  return ast;
}

// Parse JS first (fast path); fall back to TypeScript; null if neither parses.
export function safeParse(source, options = {}) {
  try {
    return parseModule(source, options);
  } catch {
    try {
      return parseTypeScript(source, options);
    } catch {
      return null;
    }
  }
}

// Parser-agnostic walker. Works on any ESTree-compatible AST (acorn or
// typescript-estree) — no per-node-type base required, so TS-specific nodes are
// traversed generically instead of throwing.
//   walkAst(ast, { Identifier(node) {...} })                 -> simple
//   walkAst(ast, visitors, { mode: "ancestor" })             -> visitor(node, state, ancestorsInclusive)
export function walkAst(ast, visitors = {}, options = {}) {
  if (!ast || typeof ast !== "object") return;
  const ancestorMode = options.mode === "ancestor";
  const state = options.state;
  const stack = [];
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    const visitor = visitors[node.type];
    if (visitor) {
      if (ancestorMode) {
        stack.push(node);
        visitor(node, state, stack.slice());
      } else {
        visitor(node, state);
      }
    } else if (ancestorMode) {
      stack.push(node);
    }
    for (const key in node) {
      if (key === "type" || key === "loc" || key === "range" || key === "start" || key === "end" || key === "parent" || key === "comments" || key === "tokens") continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child === "object" && typeof child.type === "string") visit(child);
      } else if (value && typeof value === "object" && typeof value.type === "string") {
        visit(value);
      }
    }
    if (ancestorMode && (visitor || true)) stack.pop();
  };
  visit(ast);
}

// Collect every node of a given type.
export function collectNodes(ast, type) {
  const found = [];
  walkAst(ast, { [type]: (node) => found.push(node) });
  return found;
}

// 1-based line number for a node.
export function nodeLine(node) {
  return node?.loc?.start?.line ?? null;
}

function normalizeRanges(ast) {
  const stack = [ast];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (typeof node.type === "string" && Array.isArray(node.range)) {
      if (node.start === undefined) node.start = node.range[0];
      if (node.end === undefined) node.end = node.range[1];
    }
    for (const key in node) {
      if (key === "parent" || key === "loc" || key === "range") continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child === "object" && typeof child.type === "string") stack.push(child);
      } else if (value && typeof value === "object" && typeof value.type === "string") {
        stack.push(value);
      }
    }
  }
}
