import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildModuleGraph } from "../packages/refactor/dead-code.mjs";

// Architecture fitness (cat 2): enforce layer boundaries so the foundation stays
// pure and the dependency direction never inverts. Foundation = ast + proof;
// they must not depend "upward" on engines/app code. Runs on the real graph.
const root = path.resolve(import.meta.dirname, "..");
const graph = buildModuleGraph(root);

// Higher layers the foundation must never import.
const UPWARD = [
  "packages/review/", "packages/testing/", "packages/operate/", "packages/agents/",
  "packages/loops/", "packages/learning/", "packages/intelligence/", "packages/orchestration/",
  "packages/score/", "packages/workflows/", "packages/profiles/", "packages/benchmark/",
  "packages/qa/", "apps/"
];

function importsFrom(file) {
  return (graph.importsByFile[file] || []).map((edge) => edge.target);
}

test("packages/ast is a pure foundation (imports no other kernel package)", () => {
  const violations = [];
  for (const file of graph.files.filter((f) => f.startsWith("packages/ast/"))) {
    for (const target of importsFrom(file)) {
      if (target.startsWith("packages/") && !target.startsWith("packages/ast/")) violations.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(violations, [], `ast must not import other packages:\n${violations.join("\n")}`);
});

test("packages/proof only depends on itself and the documented security/dlp exception", () => {
  const allowed = (target) => target.startsWith("packages/proof/") || target === "packages/security/dlp.mjs";
  const violations = [];
  for (const file of graph.files.filter((f) => f.startsWith("packages/proof/"))) {
    for (const target of importsFrom(file)) {
      if (target.startsWith("packages/") && !allowed(target)) violations.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(violations, [], `proof must stay foundation-pure:\n${violations.join("\n")}`);
});

test("the foundation never imports upward into engine/app layers", () => {
  const violations = [];
  for (const file of graph.files.filter((f) => f.startsWith("packages/ast/") || f.startsWith("packages/proof/"))) {
    for (const target of importsFrom(file)) {
      if (UPWARD.some((layer) => target.startsWith(layer))) violations.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(violations, [], `foundation imported upward:\n${violations.join("\n")}`);
});
