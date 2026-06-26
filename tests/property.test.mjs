import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { vectorize, cosineSimilarity } from "../packages/learning/knowledge.mjs";
import { maxConcurrencyObserved } from "../packages/orchestration/concurrent.mjs";
import { generateAllMutants } from "../packages/testing/mutation.mjs";
import { computeFileComplexity } from "../packages/refactor/complexity.mjs";

test("cosineSimilarity is bounded [0,1] and symmetric", () => {
  fc.assert(
    fc.property(fc.string(), fc.string(), (a, b) => {
      const score = cosineSimilarity(vectorize(a), vectorize(b));
      const mirror = cosineSimilarity(vectorize(b), vectorize(a));
      return score >= 0 && score <= 1 && Math.abs(score - mirror) < 1e-9;
    })
  );
});

test("cosineSimilarity of a non-empty vector with itself is 1", () => {
  fc.assert(
    fc.property(fc.array(fc.constantFrom("alpha", "beta", "gamma", "delta"), { minLength: 1, maxLength: 12 }), (tokens) => {
      const vector = vectorize(tokens.join(" "));
      return cosineSimilarity(vector, vector) === 1;
    })
  );
});

test("maxConcurrencyObserved is within [0, taskCount]", () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ start: fc.nat(1000), span: fc.nat(50) }), { maxLength: 30 }),
      (intervals) => {
        const results = intervals.map((interval) => ({ startedAt: interval.start, finishedAt: interval.start + interval.span }));
        const peak = maxConcurrencyObserved(results);
        return peak >= 0 && peak <= results.length;
      }
    )
  );
});

test("every generated mutant differs from the original source", () => {
  const snippets = [
    "function f(a){ return a === 1 && a > 0; }",
    "const ok = true; if (x <= 2) { y(); }",
    "async function g(){ const v = await h(); return v + 1; }"
  ];
  fc.assert(
    fc.property(fc.constantFrom(...snippets), (source) => {
      const mutants = generateAllMutants(source);
      return mutants.length > 0 && mutants.every((mutant) => mutant.mutated !== source);
    })
  );
});

test("branch complexity is always >= 1 for any function", () => {
  fc.assert(
    fc.property(fc.array(fc.constantFrom("if (a) {}", "for (;;) break;", "x && y;", "return 1;"), { maxLength: 8 }), (stmts) => {
      const fns = computeFileComplexity(`function f(a, b, x, y) { ${stmts.join(" ")} }`);
      return fns.length >= 1 && fns.every((fn) => fn.complexity >= 1);
    })
  );
});
