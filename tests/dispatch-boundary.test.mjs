import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

// Regression guard for the silent-wrong-answer class found in the deep audit: a
// missing/invalid target used to fall back to cwd and confidently audit the WRONG
// project (or report a nonexistent repo as "passed"). The boundary must refuse.

test("null / empty root is refused (not silently audited as cwd)", async () => {
  await assert.rejects(() => callKernelTool(null, "kernel.review.quality_score", {}), /target root is required/);
  await assert.rejects(() => callKernelTool("", "kernel.security.sast", {}), /target root is required/);
});

test("a nonexistent target root is an honest error, not a 'passed' scorecard", async () => {
  await assert.rejects(() => callKernelTool("/Users/Sage/definitely/not/here", "kernel.security.sast", {}), /does not exist or is not a directory/);
});

test("a provided-but-nonexistent projectPath/targetRoot is refused", async () => {
  const root = process.cwd();
  await assert.rejects(() => callKernelTool(root, "kernel.security.sast", { projectPath: "/no/such/dir" }), /projectPath does not exist/);
  await assert.rejects(() => callKernelTool(root, "kernel.enforce.proof_gate", { targetRoot: "/no/such/dir" }), /targetRoot does not exist/);
});

test("a valid target with projectPath '.' still works (no false rejection)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-boundary-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "b", type: "module" }));
  try {
    const r = await callKernelTool(dir, "kernel.profile.gaps", { projectPath: "." });
    assert.ok(r.project, "valid target must produce a result");
    // Compare realpath (macOS /tmp -> /private/tmp symlink) — the point is it
    // analyzed the SUPPLIED target, not the kernel's cwd.
    assert.equal(fs.realpathSync(r.project.root), fs.realpathSync(dir), "must analyze the SUPPLIED target, not cwd");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
