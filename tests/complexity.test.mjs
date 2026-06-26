import test from "node:test";
import assert from "node:assert/strict";
import { computeFileComplexity, analyzeComplexity } from "../packages/refactor/complexity.mjs";
import { runComplexityGate } from "../scripts/quality-complexity.mjs";

test("computes branch complexity from decision points", () => {
  const fns = computeFileComplexity("function f(a, b) { if (a) {} for (;;) {} return a && b ? 1 : 2; }");
  const f = fns.find((x) => x.name === "f");
  // base 1 + if + for + logical-&& + ternary = 5
  assert.equal(f.complexity, 5);
});

test("counts a switch as a single branch (dispatch tables not penalized per case)", () => {
  const fns = computeFileComplexity("function d(x){ switch(x){ case 1: return 1; case 2: return 2; case 3: return 3; default: return 0; } }");
  assert.equal(fns.find((x) => x.name === "d").complexity, 2); // base 1 + switch 1
});

test("attributes decisions to the nearest enclosing function", () => {
  const fns = computeFileComplexity("function outer(){ function inner(a){ return a || 1; } return inner(2); }");
  assert.equal(fns.find((x) => x.name === "outer").complexity, 1);
  assert.equal(fns.find((x) => x.name === "inner").complexity, 2);
});

test("analyzeComplexity flags over-budget functions and honors the allowlist", () => {
  const root = process.cwd();
  const strict = analyzeComplexity({ root, maxComplexity: 5, maxLines: 40 });
  assert.equal(strict.status, "failed");
  assert.ok(strict.violations.length > 0);
  // Allowlisting a specific function removes it from violations.
  const target = strict.violations[0];
  const exempt = analyzeComplexity({ root, maxComplexity: 5, maxLines: 40, allow: [`${target.file}#${target.name}`] });
  assert.equal(exempt.violations.some((v) => v.file === target.file && v.name === target.name), false);
});

test("the kernel passes its own complexity budget", () => {
  const report = runComplexityGate(process.cwd());
  assert.equal(report.status, "passed", `over-budget: ${report.violations.map((v) => `${v.file}#${v.name}=${v.complexity}`).join(", ")}`);
});
