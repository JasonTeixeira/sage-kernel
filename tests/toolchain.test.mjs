import test from "node:test";
import assert from "node:assert/strict";
import { localizeCommands } from "../packages/profiles/toolchain.mjs";

// Honest, language-aware commands: never prescribe npm for a non-Node repo.

test("Node project (has package.json) keeps npm commands as-is", () => {
  const r = localizeCommands(["npm test", "npm run test:coverage"], { languages: ["javascript", "typescript"], hasPackageJson: true });
  assert.deepEqual(r.commands, ["npm test", "npm run test:coverage"]);
  assert.equal(r.toolchain, "node");
  assert.equal(r.note, null);
});

test("Python project (no package.json) localizes to pytest + honest note", () => {
  const r = localizeCommands(["npm test", "npm run test:coverage"], { languages: ["python"], hasPackageJson: false });
  assert.ok(r.commands.includes("pytest"));
  assert.ok(!r.commands.some((c) => c.startsWith("npm")), "must not prescribe npm for python");
  assert.equal(r.toolchain, "python");
  assert.match(r.note, /JS\/TS-native/);
});

test("stray .js with NO package.json + python is treated as python, not Node", () => {
  // The cloudmind case: detector saw javascript/typescript/shell/python but no manifest.
  const r = localizeCommands(["npm test"], { languages: ["javascript", "typescript", "shell", "python"], hasPackageJson: false });
  assert.equal(r.toolchain, "python");
  assert.ok(r.commands.includes("pytest"));
});

test("Go and Rust map to their real toolchains", () => {
  assert.ok(localizeCommands(["npm test"], { languages: ["go"], hasPackageJson: false }).commands.includes("go test ./..."));
  assert.ok(localizeCommands(["npm test"], { languages: ["rust"], hasPackageJson: false }).commands.includes("cargo test"));
});
