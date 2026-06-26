import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { callKernelToolSafe } from "../apps/mcp-server/src/kernel-tools.mjs";
import { classifyErrorKind } from "../packages/core/kernel-error.mjs";

// The uniform envelope: callKernelToolSafe NEVER throws — success is { ok:true,
// data }, failure is { ok:false, error:{ code, kind, message } }. The autonomous
// loop and MCP clients reason over `kind` instead of string-matching.

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-env-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "e", type: "module" }));
  return dir;
}

test("success returns { ok:true, data } and never throws", async () => {
  const dir = tmp();
  try {
    const r = await callKernelToolSafe(dir, "kernel.profile.gaps", { projectPath: "." });
    assert.equal(r.ok, true);
    assert.ok(r.data && r.data.project, "data carries the real result");
    assert.equal(r.error, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("unknown tool -> { ok:false, kind:not_found } (no throw)", async () => {
  const dir = tmp();
  try {
    const r = await callKernelToolSafe(dir, "kernel.does.not.exist", {});
    assert.equal(r.ok, false);
    assert.equal(r.error.kind, "not_found");
    assert.match(r.error.message, /Unknown tool/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("nonexistent target -> { ok:false, kind:not_found }", async () => {
  const r = await callKernelToolSafe("/Users/Sage/definitely/not/here", "kernel.security.sast", {});
  assert.equal(r.ok, false);
  assert.equal(r.error.kind, "not_found");
});

test("missing required input -> { ok:false, kind:validation }", async () => {
  const dir = tmp();
  try {
    const r = await callKernelToolSafe(dir, "kernel.catalog.search", {});
    assert.equal(r.ok, false);
    assert.equal(r.error.kind, "validation");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("read-only mode refusal -> { ok:false, kind:forbidden }", async () => {
  const dir = tmp();
  process.env.SAGE_KERNEL_READ_ONLY = "1";
  try {
    const r = await callKernelToolSafe(dir, "kernel.jobs.enqueue", { job: "repo-health" });
    assert.equal(r.ok, false);
    assert.equal(r.error.kind, "forbidden");
  } finally {
    delete process.env.SAGE_KERNEL_READ_ONLY;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("classifyErrorKind maps representative messages", () => {
  assert.equal(classifyErrorKind({ message: "Unknown tool: x", code: "KERNEL_TOOL_NOT_FOUND" }), "not_found");
  assert.equal(classifyErrorKind({ message: "kernel.x requires input.query" }), "validation");
  assert.equal(classifyErrorKind({ message: "Read-only mode blocks mutating action" }), "forbidden");
  assert.equal(classifyErrorKind({ message: "Refusing to run QA outside allowed roots" }), "forbidden");
  assert.equal(classifyErrorKind({ message: "AI Warehouse source root is not configured. Set AI_WAREHOUSE_ROOT" }), "blocked");
  assert.equal(classifyErrorKind({ message: "totally weird internal explosion" }), "internal");
});
