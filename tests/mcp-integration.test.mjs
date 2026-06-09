import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createKernelRuntime } from "../packages/core/runtime.mjs";

const root = path.resolve(import.meta.dirname, "..");

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
