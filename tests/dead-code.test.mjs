import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  analyzeDeadCode,
  buildModuleGraph,
  findUnusedExports,
  findOrphanFiles,
  findUnusedDependencies,
  parseExports,
  astExportsAndImports
} from "../packages/refactor/dead-code.mjs";

function fixture(files, deps = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-deadcode-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "dc-fixture", dependencies: deps }));
  return root;
}

test("parseExports captures function/const/braced/default exports", () => {
  const names = parseExports('export function a(){}\nexport const b=1;\nexport { c, d as e };\nexport default 1;');
  assert.deepEqual([...names].sort(), ["a", "b", "c", "default", "e"].sort());
});

test("astExportsAndImports resolves re-exports, namespaces, and default/named imports", () => {
  const parsed = astExportsAndImports(
    "import def, { x as y } from './a.mjs';\nimport * as ns from './b.mjs';\nexport { c, d as e } from './m.mjs';\nexport * from './n.mjs';\nexport const local = 1;\nexport default 2;"
  );
  assert.deepEqual([...parsed.exports].sort(), ["c", "default", "e", "local"].sort());
  const bySpec = Object.fromEntries(parsed.imports.map((i) => [i.spec, i.names]));
  assert.deepEqual(bySpec["./a.mjs"].sort(), ["default", "x"].sort());
  assert.deepEqual(bySpec["./b.mjs"], ["*"]);
  assert.deepEqual(bySpec["./m.mjs"].sort(), ["c", "d"].sort());
  assert.deepEqual(bySpec["./n.mjs"], ["*"]);
});

test("astExportsAndImports returns null on unparseable source", () => {
  assert.equal(astExportsAndImports("const = ;; (("), null);
});

test("detects unused exports but not those imported (incl. by tests)", () => {
  const root = fixture({
    "packages/lib.mjs": "export const used = 1;\nexport const dead = 2;\n",
    "tests/lib.test.mjs": 'import { used } from "../packages/lib.mjs";\nimport "node:test";\n'
  });
  const graph = buildModuleGraph(root);
  const unused = findUnusedExports(graph);
  assert.ok(unused.some((e) => e.file === "packages/lib.mjs" && e.name === "dead"));
  assert.ok(!unused.some((e) => e.name === "used"));
});

test("detects orphan files unreachable from entrypoints", () => {
  const root = fixture({
    "packages/lib.mjs": "export const used = 1;\n",
    "packages/orphan.mjs": "export const x = 1;\n",
    "tests/lib.test.mjs": 'import { used } from "../packages/lib.mjs";\nimport "node:test";\n'
  });
  const orphans = findOrphanFiles(buildModuleGraph(root));
  assert.deepEqual(orphans, ["packages/orphan.mjs"]);
});

test("a namespace import marks all of a module's exports as used", () => {
  const root = fixture({
    "packages/lib.mjs": "export const a = 1;\nexport const b = 2;\n",
    "tests/lib.test.mjs": 'import * as lib from "../packages/lib.mjs";\nimport "node:test";\n'
  });
  const unused = findUnusedExports(buildModuleGraph(root));
  assert.equal(unused.filter((e) => e.file === "packages/lib.mjs").length, 0);
});

test("detects unused dependencies", () => {
  const root = fixture(
    {
      "packages/uses-zod.mjs": 'import { z } from "zod";\nexport const s = z;\n',
      "tests/zod.test.mjs": 'import { s } from "../packages/uses-zod.mjs";\nimport "node:test";\n'
    },
    { leftpad: "1.0.0", zod: "1.0.0" }
  );
  const unused = findUnusedDependencies(root, buildModuleGraph(root));
  assert.ok(unused.includes("leftpad"));
  assert.ok(!unused.includes("zod"));
});

test("analyzeDeadCode fails on orphans/unused-deps and passes when clean", () => {
  const dirty = fixture(
    {
      "packages/lib.mjs": "export const used = 1;\n",
      "packages/orphan.mjs": "export const x = 1;\n",
      "tests/lib.test.mjs": 'import { used } from "../packages/lib.mjs";\nimport "node:test";\n'
    },
    { leftpad: "1.0.0" }
  );
  const dirtyResult = analyzeDeadCode(dirty);
  assert.equal(dirtyResult.status, "failed");
  assert.ok(dirtyResult.orphanFiles.includes("packages/orphan.mjs"));
  assert.ok(dirtyResult.unusedDependencies.includes("leftpad"));

  const clean = fixture({
    "packages/lib.mjs": "export const used = 1;\n",
    "tests/lib.test.mjs": 'import { used } from "../packages/lib.mjs";\nimport "node:test";\n'
  });
  assert.equal(analyzeDeadCode(clean).status, "passed");
});

test("allowlist suppresses known-intentional findings", () => {
  const root = fixture(
    {
      "packages/lib.mjs": "export const used = 1;\n",
      "packages/orphan.mjs": "export const x = 1;\n",
      "tests/lib.test.mjs": 'import { used } from "../packages/lib.mjs";\nimport "node:test";\n'
    },
    {}
  );
  const result = analyzeDeadCode(root, { allow: ["packages/orphan.mjs"] });
  assert.ok(!result.orphanFiles.includes("packages/orphan.mjs"));
  assert.equal(result.status, "passed");
});

test("exports inside string literals and test/fixture/script files are not counted as dead", () => {
  const root = fixture({
    "packages/lib.mjs": 'export const real = 1;\nconst t = "export const fake = 2;";\nexport const used = t;\n',
    "tests/lib.test.mjs": 'import { used } from "../packages/lib.mjs";\nimport "node:test";\n',
    "test-fixtures/sample.mjs": "export const fixtureOnly = 1;\n"
  });
  const unused = findUnusedExports(buildModuleGraph(root));
  // "fake" lives inside a string literal -> not a real export
  assert.ok(!unused.some((e) => e.name === "fake"));
  // test-fixtures exports are not an API surface -> not reported
  assert.ok(!unused.some((e) => e.file.includes("test-fixtures")));
  // "real" is genuinely unused and IS reported
  assert.ok(unused.some((e) => e.file === "packages/lib.mjs" && e.name === "real"));
});
