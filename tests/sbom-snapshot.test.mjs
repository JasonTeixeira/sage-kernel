import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// SBOM control (cat 7): the dependency surface is change-controlled. Adding a
// runtime or dev dependency must be a deliberate edit to this snapshot, so the
// supply chain cannot grow silently. Keep these lists minimal and vetted.
const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const EXPECTED_RUNTIME = [
  "@modelcontextprotocol/sdk",
  "@typescript-eslint/typescript-estree",
  "acorn",
  "pg",
  "zod"
];
const EXPECTED_DEV = ["fast-check"];

test("runtime dependency surface matches the vetted SBOM snapshot", () => {
  assert.deepEqual(Object.keys(pkg.dependencies || {}).sort(), [...EXPECTED_RUNTIME].sort());
});

test("dev dependency surface matches the vetted SBOM snapshot", () => {
  assert.deepEqual(Object.keys(pkg.devDependencies || {}).sort(), [...EXPECTED_DEV].sort());
});

test("dependencies are pinned with a version range and none are wildcards", () => {
  for (const [name, range] of Object.entries({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) })) {
    assert.ok(typeof range === "string" && range.length > 0, `${name} has no version range`);
    assert.notEqual(range, "*", `${name} must not use a wildcard version`);
    assert.notEqual(range, "latest", `${name} must not float on latest`);
  }
});
