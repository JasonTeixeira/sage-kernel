import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createKernelRuntime } from "../packages/core/runtime.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");

function tempKernelRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-mcp-"));
  fs.mkdirSync(path.join(tempRoot, "packages/db"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "catalog"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "apps/worker"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "apps/mcp-server"), { recursive: true });
  fs.copyFileSync(path.join(root, "packages/db/schema.sql"), path.join(tempRoot, "packages/db/schema.sql"));
  fs.writeFileSync(path.join(tempRoot, "package.json"), JSON.stringify({ version: "9.9.9-test" }));
  fs.writeFileSync(path.join(tempRoot, "README.md"), "# Test Kernel\n");
  fs.writeFileSync(path.join(tempRoot, ".env.example"), "APP_ENV=test\n");
  fs.writeFileSync(path.join(tempRoot, "catalog/phases.json"), JSON.stringify({ phases: [{ id: 1, name: "Test", status: "complete" }] }));
  fs.writeFileSync(path.join(tempRoot, "catalog/repos.json"), JSON.stringify({ sourceRoot: path.join(tempRoot, "sources"), sourceRepoPolicy: "test", repos: [] }));
  fs.writeFileSync(path.join(tempRoot, "catalog/templates.json"), JSON.stringify({ templates: [{ id: "starter", qaProfile: "basic", coverage: ["qa", "deploy"] }] }));
  fs.writeFileSync(path.join(tempRoot, "apps/worker/jobs.json"), JSON.stringify({ jobs: [] }));
  fs.writeFileSync(path.join(tempRoot, "apps/mcp-server/tools.json"), JSON.stringify({ tools: [{ name: "kernel.test" }] }));
  return tempRoot;
}

test("runtime MCP integration supports catalog search and dashboard snapshot", async () => {
  const runtime = createKernelRuntime({ root });
  await runtime.loadBuiltInTools();

  const search = await runtime.call("kernel.catalog.search", { query: "qa", limit: 3 });
  assert.equal(Array.isArray(search), true);
  assert.equal(search.length > 0, true);

  const snapshot = await runtime.call("kernel.dashboard.snapshot", {});
  assert.equal(snapshot.version, "0.3.0");
  assert.equal(snapshot.tools.length >= 23, true);
  assert.equal(typeof snapshot.db.runs, "number");
});

test("runtime MCP integration blocks approval-required jobs without signed approval", async () => {
  const runtime = createKernelRuntime({ root });
  await runtime.loadBuiltInTools();

  await assert.rejects(
    () => runtime.call("kernel.jobs.run", { job: "repo-health" }),
    /requires approval/
  );
});

test("kernel dashboard snapshot honors the runtime root", async () => {
  const tempRoot = tempKernelRoot();
  const snapshot = await callKernelTool(tempRoot, "kernel.dashboard.snapshot", {});

  assert.equal(snapshot.version, "9.9.9-test");
  assert.equal(snapshot.tools.length, 1);
});

test("kernel job enqueue uses durable UUID-backed ids", async () => {
  const tempRoot = tempKernelRoot();
  const queued = await callKernelTool(tempRoot, "kernel.jobs.enqueue", { job: "repo-health" });

  assert.match(queued.id, /^job_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(queued.status, "queued");
});

test("kernel QA run is constrained to the configured workspace root", async () => {
  const tempRoot = tempKernelRoot();
  const report = await callKernelTool(tempRoot, "kernel.qa.run", { projectPath: "." });

  assert.equal(report.status, "passed");
  assert.equal(report.projectPath, fs.realpathSync.native(tempRoot));
  await assert.rejects(
    () => callKernelTool(tempRoot, "kernel.qa.run", { projectPath: path.dirname(tempRoot) }),
    /outside allowed roots/
  );
});
