import test from "node:test";
import assert from "node:assert/strict";
import { classifyRepoFiles } from "../packages/companion/repo-cleanup.mjs";

// Safety contract for the cleanup harness: essential code/docs are NEVER residual;
// unknown files are ambiguous (human-decided), never auto-removed; only clear
// internal scratch/planning/proof logs are residual; env files are blockers.

test("product code + essential files are never removable", () => {
  const files = [
    "packages/core/runtime.mjs", "apps/mcp-server/src/server.mjs", "bin/sage.mjs",
    "tests/foo.test.mjs", "catalog/templates.json", "package.json", "LICENSE",
    "README.md", ".gitignore", ".env.example", "providers/claude-agent.mjs"
  ];
  const r = classifyRepoFiles(files);
  assert.equal(r.residual.length, 0);
  assert.equal(r.blocker.length, 0);
  assert.equal(r.essential.length, files.length);
});

test("internal planning / proof / audit docs are classified residual with reasons", () => {
  const files = [
    "docs/GLOBAL_SDLC_OPERATING_SYSTEM_MASTER_PLAN.txt",
    "docs/COMPANION_LAYER_PROGRAM.txt",
    "docs/WORLD_CLASS_90_99_PROGRAM.txt",
    "docs/AUDIT_REPORT.md",
    "docs/SDLC_AI_GAP_AUDIT.md",
    "docs/PROGRAM_2_PROFILE_PROOF.md"
  ];
  const r = classifyRepoFiles(files);
  assert.equal(r.residual.length, files.length, `expected all residual: ${JSON.stringify(r)}`);
  assert.ok(r.residual.every((x) => x.reason && x.reason.length > 0));
});

test("scratch/junk is residual", () => {
  const r = classifyRepoFiles([".DS_Store", "foo.log", "tmp/x.json", "notes.bak"]);
  assert.equal(r.residual.length, 4);
});

test("env files are blockers; .env.example is essential", () => {
  const r = classifyRepoFiles([".env", ".env.local", ".env.example"]);
  assert.equal(r.blocker.length, 2);
  assert.ok(r.essential.includes(".env.example"));
});

test("user-facing docs are essential; unknown docs are AMBIGUOUS (not residual)", () => {
  const r = classifyRepoFiles(["docs/GETTING_STARTED.md", "docs/USING_SAGE_KERNEL.md", "docs/some-unknown-note.md"]);
  assert.ok(r.essential.includes("docs/GETTING_STARTED.md"));
  assert.ok(r.essential.includes("docs/USING_SAGE_KERNEL.md"));
  assert.equal(r.ambiguous.length, 1);
  assert.equal(r.ambiguous[0].path, "docs/some-unknown-note.md");
  assert.equal(r.residual.length, 0, "unknown docs must NOT be auto-removed");
});

test("essential dir wins even if a path also matches a residual pattern (conservative)", () => {
  // a source file that happens to contain a residual keyword must stay essential
  const r = classifyRepoFiles(["packages/companion/improve-loop.mjs", "scripts/audit-foreign-sdlc.mjs"]);
  assert.equal(r.residual.length, 0);
  assert.equal(r.essential.length, 2);
});
