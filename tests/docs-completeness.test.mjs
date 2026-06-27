import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Docs completeness (cat 18): the auto-generated tool reference must never drift
// from the manifest, and the key program docs must exist. This makes "docs are
// current" an enforced fact, not a hope.
const root = path.resolve(import.meta.dirname, "..");

test("every MCP tool in the manifest is documented in the generated reference", () => {
  const tools = JSON.parse(fs.readFileSync(path.join(root, "apps/mcp-server/tools.json"), "utf8")).tools;
  const docs = fs.readFileSync(path.join(root, "docs/mcp-tools.md"), "utf8");
  const missing = tools.map((tool) => tool.name).filter((name) => !docs.includes(name));
  assert.deepEqual(missing, [], `tool reference (docs/mcp-tools.md) is missing: ${missing.join(", ")} — run npm run mcp:contracts`);
});

test("key program/architecture docs exist", () => {
  for (const file of [
    "docs/GETTING_STARTED.md",
    "docs/USING_SAGE_KERNEL.md",
    "docs/ENGINEERING_LOOP.md",
    "docs/BRAIN_ACTIVATION.md",
    "docs/adr/README.md",
    "CHANGELOG.md"
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing doc: ${file}`);
  }
});
