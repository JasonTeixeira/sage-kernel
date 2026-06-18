import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createSemanticCode, semanticSmoke } from "../packages/intelligence/semantic-code.mjs";
import { runSemanticSmokeCli } from "../packages/intelligence/scripts/semantic-smoke.mjs";

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
  fs.writeFileSync(path.join(workspace, "broken.json"), "{");
  fs.writeFileSync(path.join(workspace, "array.json"), JSON.stringify(["not", "object"]));
  fs.writeFileSync(path.join(workspace, "plain.txt"), "plain text is intentionally unsupported by the default extension set\n");
  const semantic = createSemanticCode({ root: workspace });
  const index = semantic.indexProject({ projectPath: ".", limit: 20 });

  assert.equal(index.adapter.status, "available");
  assert.equal(index.totals.files, 5);
  assert.equal(index.symbols.some((symbol) => symbol.name === "SemanticRunner" && symbol.kind === "class"), true);
  assert.equal(index.symbols.some((symbol) => symbol.name === "createSemanticFixture" && symbol.exported), true);
  assert.equal(index.symbols.some((symbol) => symbol.name === "Semantic Fixture" && symbol.kind === "heading-1"), true);
  assert.equal(index.symbols.some((symbol) => symbol.name === "name" && symbol.kind === "json-key"), true);
  assert.equal(index.symbols.some((symbol) => symbol.file === "broken.json"), false);
  assert.equal(index.modules.some((module) => module.file === "plain.txt"), false);

  const textOnly = semantic.indexProject({ projectPath: ".", extensions: ["txt"], limit: 99 });
  assert.equal(textOnly.modules.length, 1);
  assert.equal(textOnly.modules[0].language, "text");

  const clamped = semantic.indexProject({ projectPath: ".", limit: Number.NaN });
  assert.equal(clamped.totals.files >= index.totals.files, true);
});

test("semantic code searches symbols, finds references, and summarizes modules", () => {
  const workspace = tempProject();
  fs.writeFileSync(path.join(workspace, "src/variants.cjs"), "var commonValue = 1;\nmodule.exports = commonValue;\n");
  fs.writeFileSync(path.join(workspace, "src/typed.ts"), "export let typedValue = 1;\n");
  fs.writeFileSync(path.join(workspace, "src/view.tsx"), "export const View = () => null;\n");
  fs.writeFileSync(path.join(workspace, "src/legacy.jsx"), "export const Legacy = () => null;\n");
  const semantic = createSemanticCode({ root: workspace });

  const search = semantic.searchSymbol({ query: "semanticfixture", limit: 0, indexLimit: Number.NaN });
  assert.equal(search.results.length >= 1, true);
  assert.equal(search.results[0].searchText, undefined);

  const references = semantic.findReferences({ query: "SemanticRunner", limit: 500 });
  assert.equal(references.results.length >= 1, true);
  assert.equal(references.results[0].file, "src/index.mjs");

  const summary = semantic.summarizeModule({ file: "src/index.mjs" });
  assert.equal(summary.language, "javascript");
  assert.equal(summary.symbols.some((symbol) => symbol.name === "semanticAnswer"), true);
  assert.match(summary.summary, /src\/index\.mjs is a javascript module/);

  assert.equal(semantic.summarizeModule({ file: "src/variants.cjs" }).language, "javascript");
  assert.equal(semantic.summarizeModule({ file: "src/typed.ts" }).language, "typescript");
  assert.equal(semantic.summarizeModule({ file: "src/view.tsx" }).language, "typescript-react");
  assert.equal(semantic.summarizeModule({ file: "src/legacy.jsx" }).language, "javascript-react");
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

test("semantic smoke direct CLI runner covers pass and fail exits", () => {
  const lines = [];
  const passed = runSemanticSmokeCli({
    root,
    stdout: (line) => lines.push(line),
    smoke: () => ({ status: "passed", module: { symbolCount: 1 } })
  });
  assert.equal(passed, 0);
  assert.equal(JSON.parse(lines[0]).status, "passed");

  const failed = runSemanticSmokeCli({
    root,
    stdout: () => {},
    smoke: () => ({ status: "failed", module: { symbolCount: 0 } })
  });
  assert.equal(failed, 1);
});
