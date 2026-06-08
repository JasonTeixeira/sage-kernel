import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createKernelRuntime } from "../packages/core/runtime.mjs";
import { createToolRegistry } from "../packages/core/tool-registry.mjs";
import { createPolicyEngine } from "../packages/core/policy-engine.mjs";
import { createEventBus } from "../packages/core/event-bus.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("tool registry requires complete metadata and blocks duplicate tools", () => {
  const registry = createToolRegistry();
  registry.register({
    name: "kernel.test.safe",
    description: "Safe test tool.",
    risk: "safe",
    sideEffects: "none",
    inputSchema: { type: "object", properties: {} },
    handler: async () => ({ ok: true })
  });

  assert.equal(registry.list().length, 1);
  assert.throws(
    () => registry.register({ name: "kernel.test.safe", description: "duplicate", risk: "safe", sideEffects: "none", inputSchema: { type: "object" }, handler: async () => ({}) }),
    /Duplicate tool/
  );
  assert.throws(
    () => registry.register({ name: "kernel.test.bad", description: "", risk: "safe", sideEffects: "none", inputSchema: { type: "object" }, handler: async () => ({}) }),
    /description/
  );
});

test("policy engine blocks mutating tools in read-only mode", () => {
  const policy = createPolicyEngine({ readOnly: true });
  assert.deepEqual(policy.authorize({ name: "kernel.safe", risk: "safe", sideEffects: "none" }), { allowed: true });
  assert.throws(
    () => policy.authorize({ name: "kernel.mutate", risk: "mutating", sideEffects: "writes local files" }),
    /Read-only mode blocks/
  );
});

test("runtime emits lifecycle events and dispatches through registered handlers", async () => {
  const events = [];
  const runtime = createKernelRuntime({
    root,
    eventBus: createEventBus((event) => events.push(event))
  });

  runtime.registerTool({
    name: "kernel.test.echo",
    description: "Echo test tool.",
    risk: "safe",
    sideEffects: "none",
    inputSchema: { type: "object", properties: { value: { type: "string" } } },
    handler: async ({ input }) => ({ value: input.value })
  });

  const result = await runtime.call("kernel.test.echo", { value: "ok" });
  assert.deepEqual(result, { value: "ok" });
  assert.deepEqual(events.map((event) => event.type), ["tool.started", "tool.finished"]);
});

test("kernel runtime registers every MCP manifest tool", async () => {
  const runtime = createKernelRuntime({ root });
  await runtime.loadBuiltInTools();
  const runtimeTools = new Set(runtime.listTools().map((tool) => tool.name));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "apps/mcp-server/tools.json"), "utf8"));

  for (const tool of manifest.tools) {
    assert.equal(runtimeTools.has(tool.name), true, `runtime missing ${tool.name}`);
  }
});
