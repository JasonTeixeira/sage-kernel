import test from "node:test";
import assert from "node:assert/strict";
import { generateSemanticMutants, generateAllMutants } from "../packages/testing/mutation.mjs";

const ids = (mutants) => mutants.map((m) => m.mutator);

test("negates return values", () => {
  const m = generateSemanticMutants("function f(a, b) { return a && b; }");
  const mut = m.find((x) => x.mutator === "negate-return");
  assert.ok(mut);
  assert.match(mut.mutated, /return !\(a && b\)/);
});

test("flips if conditions", () => {
  const m = generateSemanticMutants("if (x > 1) { go(); }");
  const mut = m.find((x) => x.mutator === "flip-if");
  assert.ok(mut);
  assert.match(mut.mutated, /if \(!\(x > 1\)\)/);
});

test("drops await", () => {
  const m = generateSemanticMutants("async function g() { const r = await h(); return r; }");
  const mut = m.find((x) => x.mutator === "drop-await");
  assert.ok(mut);
  assert.ok(!/await/.test(mut.mutated));
});

test("swaps arithmetic operators", () => {
  const m = generateSemanticMutants("const c = a + b;");
  const mut = m.find((x) => x.mutator === "arith-swap");
  assert.ok(mut);
  assert.match(mut.mutated, /a - b/);
});

test("removes call statements", () => {
  const m = generateSemanticMutants("doThing(); const x = 1;");
  assert.ok(m.some((x) => x.mutator === "remove-stmt"));
});

test("returns nothing for unparseable source", () => {
  assert.deepEqual(generateSemanticMutants("const = ;; (("), []);
});

test("generateAllMutants combines token and semantic mutants", () => {
  const all = generateAllMutants("function f(a){ if (a === 1) { return a + 1; } }");
  assert.ok(ids(all).includes("strict-eq")); // token
  assert.ok(ids(all).includes("flip-if")); // semantic
});
