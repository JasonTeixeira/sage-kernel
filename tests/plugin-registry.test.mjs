import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { definePlugin, registerPlugin, getPlugin, listPlugins, resetPlugins, languageForExtension, parseByExtension, loadProjectPlugins } from "../packages/plugins/registry.mjs";

test("loadProjectPlugins loads a dropped-in plugin file (zero core edits) and it becomes usable", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-plugins-"));
  fs.mkdirSync(path.join(root, ".sage-kernel/plugins"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".sage-kernel/plugins", "lua.mjs"),
    "export default { kind: 'language', id: 'lua', extensions: ['lua'], parse: (s) => ({ type: 'LuaChunk', length: String(s).length }) };\n"
  );
  try {
    const loaded = await loadProjectPlugins({ root });
    assert.equal(loaded.length, 1);
    assert.equal(getPlugin("language", "lua").id, "lua");
    assert.equal(parseByExtension("lua", "print('hi')").type, "LuaChunk");
  } finally {
    resetPlugins("language");
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("loadProjectPlugins isolates a broken plugin (logs + skips, never crashes)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-plugins-bad-"));
  fs.mkdirSync(path.join(root, ".sage-kernel/plugins"), { recursive: true });
  fs.writeFileSync(path.join(root, ".sage-kernel/plugins", "broken.mjs"), "export default { kind: 'language' };\n");
  const errors = [];
  try {
    const loaded = await loadProjectPlugins({ root, onError: (m) => errors.push(m) });
    assert.equal(loaded.length, 0);
    assert.equal(errors.length, 1);
  } finally {
    resetPlugins("language");
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("loadProjectPlugins returns empty when no plugin dir exists", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-plugins-none-"));
  try {
    assert.deepEqual(await loadProjectPlugins({ root }), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("built-in language plugins are registered for JS and TS", () => {
  assert.equal(languageForExtension("tsx").id, "typescript");
  assert.equal(languageForExtension("mjs").id, "javascript");
  assert.equal(listPlugins("language").length >= 2, true);
});

test("definePlugin rejects malformed plugins", () => {
  assert.throws(() => definePlugin({ kind: "language", id: "x" }), /extensions/);
  assert.throws(() => definePlugin({ kind: "bogus", id: "x" }), /kind/);
  assert.throws(() => definePlugin({ kind: "engine", id: "e" }), /run/);
});

test("a new language plugin can be added WITHOUT editing core, and is used", () => {
  // Register a toy language plugin for a novel extension; core code is untouched.
  registerPlugin({
    kind: "language",
    id: "toylang",
    extensions: ["toy"],
    parse: (source) => ({ type: "ToyProgram", length: String(source).length })
  });
  assert.equal(getPlugin("language", "toylang").id, "toylang");
  const ast = parseByExtension("toy", "hello toy");
  assert.equal(ast.type, "ToyProgram");
  assert.equal(ast.length, 9);
  // Cleanup restores built-ins only.
  resetPlugins("language");
  assert.equal(getPlugin("language", "toylang"), null);
  assert.equal(languageForExtension("ts").id, "typescript");
});

test("engine and profile plugins register and list by kind", () => {
  registerPlugin({ kind: "engine", id: "demo-engine", run: () => ({ status: "passed" }) });
  registerPlugin({ kind: "profile", id: "demo-profile" });
  assert.equal(getPlugin("engine", "demo-engine").run().status, "passed");
  assert.equal(listPlugins("profile").some((p) => p.id === "demo-profile"), true);
  resetPlugins("engine");
  resetPlugins("profile");
});
