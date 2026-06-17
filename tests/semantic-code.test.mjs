import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createSemanticCode, semanticSmoke } from "../packages/intelligence/semantic-code.mjs";

const root = path.resolve(import.meta.dirname, "..");

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-semantic-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "semantic-fixture", version: "1.0.0" }, null, 2));
  fs.writeFileSync(path.join(dir, "README.md"), "# Semantic Fixture\n\n## Operations\n");
  fs.writeFileSync(path.join(dir, "src/index.mjs"), [
    "import fs from \"node:fs\";",
    "export class SemanticRunner {}",
    "export function createSemanticFixture() { return new SemanticRunner(); }",
    "const localValue = 42;",
    "export const semanticAnswer = localValue;"
  ].join("\n"));
  return dir;
}

test("semantic code indexes modules, symbols, markdown headings, and json keys", () => {
  const workspace = tempProject();
  const semantic = createSemanticCode({ root: workspace });
  const index = semantic.indexProject({ projectPath: ".", limit: 20 });

  assert.equal(index.adapter.status, "available");
  assert.equal(index.totals.files, 3);
  assert.equal(index.symbols.some((symbol) => symbol.name === "SemanticRunner" && symbol.kind === "class"), true);
  assert.equal(index.symbols.some((symbol) => symbol.name === "createSemanticFixture" && symbol.exported), true);
  assert.equal(index.symbols.some((symbol) => symbol.name === "Semantic Fixture" && symbol.kind === "heading-1"), true);
  assert.equal(index.symbols.some((symbol) => symbol.name === "name" && symbol.kind === "json-key"), true);
});

test("semantic code searches symbols, finds references, and summarizes modules", () => {
  const workspace = tempProject();
  const semantic = createSemanticCode({ root: workspace });

  const search = semantic.searchSymbol({ query: "semanticfixture", limit: 5 });
  assert.equal(search.results.length >= 1, true);
  assert.equal(search.results[0].searchText, undefined);

  const references = semantic.findReferences({ query: "SemanticRunner", limit: 5 });
  assert.equal(references.results.length >= 1, true);
  assert.equal(references.results[0].file, "src/index.mjs");

  const summary = semantic.summarizeModule({ file: "src/index.mjs" });
  assert.equal(summary.language, "javascript");
  assert.equal(summary.symbols.some((symbol) => symbol.name === "semanticAnswer"), true);
  assert.match(summary.summary, /src\/index\.mjs is a javascript module/);
});

test("semantic code rejects missing inputs and paths outside the root", () => {
  const workspace = tempProject();
  const semantic = createSemanticCode({ root: workspace });

  assert.throws(() => semantic.searchSymbol({}), /requires input.query/);
  assert.throws(() => semantic.findReferences({}), /requires input.query/);
  assert.throws(() => semantic.summarizeModule({}), /requires input.file/);
  assert.throws(() => semantic.indexProject({ projectPath: ".." }), /outside the semantic project root/);
  assert.throws(() => semantic.summarizeModule({ file: "missing.mjs" }), /Module file not found/);
});

test("semantic smoke proves repository-level semantic baseline", () => {
  const result = semanticSmoke({ root });
  assert.equal(result.status, "passed");
  assert.equal(result.totals.files > 0, true);
  assert.equal(result.searchCount > 0, true);
  assert.equal(result.module.file, "packages/intelligence/semantic-code.mjs");
});

test("semantic CLI smoke executes successfully", () => {
  const result = spawnSync("npm", ["run", "semantic:smoke"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
  assert.equal(parsed.status, "passed");
  assert.equal(parsed.module.symbolCount > 0, true);
});
