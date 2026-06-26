import test from "node:test";
import assert from "node:assert/strict";
import { parseModule, parseTypeScript, safeParse, walkAst, collectNodes, nodeLine } from "../packages/ast/parse.mjs";

test("parseModule parses ESM and records locations", () => {
  const ast = parseModule("import x from './a.mjs';\nexport const y = 1;");
  assert.equal(ast.type, "Program");
  const decls = collectNodes(ast, "ImportDeclaration");
  assert.equal(decls.length, 1);
  assert.equal(decls[0].source.value, "./a.mjs");
  assert.ok(nodeLine(decls[0]) === 1);
});

test("safeParse returns null on syntax error instead of throwing", () => {
  assert.equal(safeParse("const = ;;; (("), null);
  assert.ok(safeParse("export const ok = 1;"));
});

test("walkAst simple walk visits matching nodes", () => {
  const ast = parseModule("const a = 1; const b = 2; foo(a, b);");
  const names = [];
  walkAst(ast, { Identifier: (node) => names.push(node.name) });
  assert.ok(names.includes("foo"));
  assert.ok(names.includes("a"));
});

test("parseTypeScript parses TS/TSX and normalizes start/end + comments", () => {
  const comments = [];
  const ast = parseTypeScript("interface U { id: number }\nexport const x: U = { id: 1 }; // note\nfunction f(): void { g(); }", { onComment: comments });
  assert.equal(ast.type, "Program");
  const calls = collectNodes(ast, "CallExpression");
  assert.equal(calls.length, 1);
  // start/end normalized from typescript-estree range so splicing engines work.
  assert.equal(typeof calls[0].start, "number");
  assert.equal(typeof calls[0].end, "number");
  assert.ok(comments.some((c) => /note/.test(c.value)));
});

test("safeParse falls back to TypeScript when acorn fails", () => {
  const ast = safeParse("const x = (a: number): number => a + 1;");
  assert.ok(ast);
  assert.equal(ast.type, "Program");
  assert.equal(collectNodes(ast, "ArrowFunctionExpression").length, 1);
});

test("walkAst traverses TS-specific nodes without throwing (ancestor mode)", () => {
  const ast = parseTypeScript("type T = string; function f(a: T) { if (a) { return a as string; } }");
  let ids = 0;
  assert.doesNotThrow(() => walkAst(ast, { Identifier: () => { ids += 1; } }, { mode: "ancestor" }));
  assert.ok(ids > 0);
});

test("collectNodes gathers all nodes of a type", () => {
  const ast = parseModule("await x(); await y();", { allowAwaitOutsideFunction: true });
  assert.equal(collectNodes(ast, "AwaitExpression").length, 2);
});
