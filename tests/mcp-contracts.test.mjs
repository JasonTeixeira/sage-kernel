import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");

test("MCP contracts and docs are generated from the manifest", () => {
  const result = spawnSync("node", ["apps/mcp-server/scripts/generate-contracts.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const snapshotPath = path.join(root, "apps/mcp-server/contracts/tools.snapshot.json");
  const docsPath = path.join(root, "docs/mcp-tools.md");
  assert.equal(fs.existsSync(snapshotPath), true);
  assert.equal(fs.existsSync(docsPath), true);

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "apps/mcp-server/tools.json"), "utf8"));
  assert.equal(snapshot.tools.length, manifest.tools.length);
  assert.equal(snapshot.tools.every((tool) => tool.name && tool.inputHash && tool.risk && tool.permission), true);

  const docs = fs.readFileSync(docsPath, "utf8");
  assert.match(docs, /# Sage Kernel MCP Tools/);
  assert.match(docs, /kernel\.jobs\.run/);
  assert.match(docs, /Approval Required/);
});
