import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildModuleGraph, dependentsOf, coveringTests } from "../packages/testing/module-graph.mjs";
import { mapTestImpact } from "../packages/testing/impact-map.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-graph-"));
  fs.mkdirSync(path.join(root, "packages"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "packages/leaf.mjs"), "export const leaf = 1;\n");
  fs.writeFileSync(path.join(root, "packages/mid.mjs"), "import { leaf } from './leaf.mjs';\nexport const mid = leaf + 1;\n");
  fs.writeFileSync(path.join(root, "tests/mid.test.mjs"), "import { mid } from '../packages/mid.mjs';\nconsole.log(mid);\n");
  return root;
}

test("buildModuleGraph resolves relative imports and reverse edges", () => {
  const root = fixture();
  const graph = buildModuleGraph(root);
  assert.deepEqual(graph.importsByFile["packages/mid.mjs"], ["packages/leaf.mjs"]);
  assert.deepEqual(graph.reverse["packages/leaf.mjs"], ["packages/mid.mjs"]);
});

test("dependentsOf is transitive (test -> mid -> leaf)", () => {
  const root = fixture();
  const graph = buildModuleGraph(root);
  const deps = dependentsOf(graph, "packages/leaf.mjs");
  assert.ok(deps.has("packages/mid.mjs"));
  assert.ok(deps.has("tests/mid.test.mjs"));
});

test("coveringTests finds the test that transitively reaches a leaf module", () => {
  const root = fixture();
  const graph = buildModuleGraph(root);
  assert.deepEqual(coveringTests(graph, "packages/leaf.mjs"), ["tests/mid.test.mjs"]);
});

test("mapTestImpact reports transitive coverage of a deep dependency", () => {
  const root = fixture();
  // The test only imports mid.mjs, never leaf.mjs directly — naive matching
  // would miss it; the graph connects them.
  const impact = mapTestImpact(["packages/leaf.mjs"], { root });
  assert.equal(impact.files[0].covered, true);
  assert.ok(impact.files[0].tests.includes("tests/mid.test.mjs"));
});
