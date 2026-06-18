import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createKernelRuntime } from "../packages/core/runtime.mjs";
import { createToolRegistry } from "../packages/core/tool-registry.mjs";
import { createPolicyEngine } from "../packages/core/policy-engine.mjs";
import { createEventBus } from "../packages/core/event-bus.mjs";
import { createSqliteAdapter } from "../packages/db/adapter.mjs";
import { KernelError, isKernelError, normalizeKernelError } from "../packages/core/kernel-error.mjs";
import { createAuditSink, redactSecrets } from "../packages/core/audit-log.mjs";
import { zodFromJsonSchema } from "../packages/core/zod-schema.mjs";

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

test("runtime surfaces normalized kernel errors for unknown tools and permission denial", async () => {
  const runtime = createKernelRuntime({
    root,
    policyOptions: { scopes: ["catalog:read"] }
  });
  runtime.registerTool({
    name: "kernel.test.denied",
    description: "Denied test tool.",
    risk: "safe",
    permission: "jobs:write",
    sideEffects: "none",
    inputSchema: { type: "object", properties: {} },
    handler: async () => ({ ok: true })
  });

  await assert.rejects(
    () => runtime.call("kernel.missing", {}),
    (error) => isKernelError(error) && error.code === "KERNEL_TOOL_NOT_FOUND" && /Unknown tool/.test(error.message)
  );
  await assert.rejects(
    () => runtime.call("kernel.test.denied", {}),
    (error) => isKernelError(error) && error.code === "KERNEL_PERMISSION_DENIED" && error.remediation.includes("Grant")
  );
});

test("runtime persists redacted audit events for tool lifecycle", async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "sage-runtime-audit-"));
  fs.mkdirSync(path.join(sandbox, "packages/db"), { recursive: true });
  fs.copyFileSync(path.join(root, "packages/db/schema.sql"), path.join(sandbox, "packages/db/schema.sql"));
  const db = createSqliteAdapter({ root: sandbox });
  const runtime = createKernelRuntime({ root: sandbox, db });

  runtime.registerTool({
    name: "kernel.test.audit",
    description: "Audit test tool.",
    risk: "safe",
    permission: "test:read",
    sideEffects: "none",
    inputSchema: { type: "object", properties: { token: { type: "string" } } },
    handler: async ({ input }) => ({ echoedToken: input.token })
  });

  await runtime.call("kernel.test.audit", { token: "secret-token" });
  const rows = db.query("SELECT type, metadata_json FROM audit_events ORDER BY created_at ASC;");
  assert.deepEqual(rows.map((row) => row.type), ["tool.started", "tool.finished"]);
  assert.match(rows[0].metadata_json, /REDACTED/);
  assert.doesNotMatch(rows[0].metadata_json, /secret-token/);
});

test("runtime plugin loading is disabled by default and allowlist-gated when enabled", async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "sage-runtime-plugin-"));
  const pluginDir = path.join(sandbox, "plugins");
  fs.mkdirSync(pluginDir, { recursive: true });
  const pluginPath = path.join(pluginDir, "demo.plugin.json");
  fs.writeFileSync(pluginPath, JSON.stringify({
    name: "demo",
    version: "0.1.0",
    tools: [
      {
        name: "kernel.plugin.demo",
        description: "Demo read-only plugin tool.",
        risk: "safe",
        permission: "plugin:read",
        sideEffects: "none",
        inputSchema: { type: "object", properties: {} },
        output: { ok: true, plugin: "demo" }
      }
    ]
  }));

  const disabled = createKernelRuntime({ root });
  assert.equal(disabled.loadPlugins({ directory: pluginDir }).loaded, 0);
  assert.equal(disabled.getTool("kernel.plugin.demo"), null);

  const blocked = createKernelRuntime({ root });
  assert.throws(
    () => blocked.loadPlugins({ enabled: true, directory: pluginDir, allowlist: [] }),
    /not allowlisted/
  );

  const enabled = createKernelRuntime({ root });
  const result = enabled.loadPlugins({ enabled: true, directory: pluginDir, allowlist: ["demo"] });
  assert.deepEqual(result, { loaded: 1, skipped: 0 });
  assert.deepEqual(await enabled.call("kernel.plugin.demo", {}), { ok: true, plugin: "demo" });
});

test("kernel errors serialize and normalize non-kernel failures", () => {
  const error = new KernelError("KERNEL_TEST", "Test failure", {
    details: { field: "value" },
    remediation: "Fix the test fixture."
  });
  assert.equal(isKernelError(error), true);
  assert.deepEqual(error.toJSON(), {
    code: "KERNEL_TEST",
    message: "Test failure",
    details: { field: "value" },
    remediation: "Fix the test fixture."
  });

  const normalized = normalizeKernelError(new Error("plain failure"), {
    code: "KERNEL_PLAIN",
    details: { safe: true },
    remediation: "Use a kernel error."
  });
  assert.equal(normalized.code, "KERNEL_PLAIN");
  assert.equal(normalized.details.safe, true);
  assert.equal(normalized.remediation, "Use a kernel error.");
  assert.equal(normalizeKernelError(error), error);

  const fallbackOnly = normalizeKernelError(null, { message: "fallback message" });
  assert.equal(fallbackOnly.code, "KERNEL_INTERNAL_ERROR");
  assert.equal(fallbackOnly.message, "fallback message");

  const defaulted = normalizeKernelError(null);
  assert.equal(defaulted.message, "Kernel operation failed");
  assert.match(defaulted.remediation, /Review the failing command output/);
  const plainKernelShape = { name: "KernelError", code: "KERNEL_SHAPE" };
  assert.equal(isKernelError(plainKernelShape), true);
});

test("json schema conversion and audit helpers cover primitive, optional, and fallback branches", () => {
  const schema = zodFromJsonSchema({
    type: "object",
    required: ["name", "count", "enabled", "tags", "meta"],
    properties: {
      name: { type: "string" },
      count: { type: "integer" },
      enabled: { type: "boolean" },
      tags: { type: "array", items: { type: "string" } },
      meta: { type: "object" },
      optionalAny: {}
    }
  });
  const parsed = schema.parse({ name: "ok", count: 1, enabled: true, tags: ["a"], meta: { extra: true } });
  assert.equal(parsed.name, "ok");
  assert.equal(zodFromJsonSchema({ type: "string" }).parse({ arbitrary: true }).arbitrary, true);

  assert.deepEqual(redactSecrets([{ apiKey: "secret", nested: { password: "pw", safe: "ok" } }]), [
    { apiKey: "[REDACTED]", nested: { password: "[REDACTED]", safe: "ok" } }
  ]);
  assert.equal(createAuditSink(), null);

  const auditRows = [];
  const sink = createAuditSink({
    db: {
      execute(sql, params) {
        auditRows.push({ sql, params });
      }
    }
  });
  const originalCrypto = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    sink({ type: "tool.started", tool: "kernel.test", at: "2026-01-01T00:00:00.000Z", input: { token: "secret", safe: "ok" } });
  } finally {
    Object.defineProperty(globalThis, "crypto", { value: originalCrypto, configurable: true });
  }
  assert.match(auditRows[0].params[0], /^audit_\d+_/);
  assert.equal(auditRows[0].params[2], "kernel.test");
  assert.doesNotMatch(auditRows[0].params[3], /secret/);
  assert.match(auditRows[0].params[3], /REDACTED/);
});

test("registry and policy report explicit edge-case errors", () => {
  const registry = createToolRegistry();
  assert.throws(
    () => registry.register({ name: "bad.tool", description: "Bad name.", risk: "safe", sideEffects: "none", inputSchema: { type: "object" }, handler: async () => ({}) }),
    (error) => isKernelError(error) && error.code === "KERNEL_TOOL_INVALID"
  );
  assert.throws(
    () => registry.register({ name: "kernel.bad.handler", description: "Bad handler.", risk: "safe", sideEffects: "none", inputSchema: { type: "object" }, handler: "nope" }),
    /handler/
  );
  assert.throws(
    () => registry.register({ name: "kernel.bad.schema", description: "Bad schema.", risk: "safe", sideEffects: "none", inputSchema: { type: "string" }, handler: async () => ({}) }),
    /inputSchema/
  );

  const policy = createPolicyEngine({ readOnly: false, approvalLedger: null });
  assert.throws(() => policy.authorize({}, {}), /Policy requires tool.name/);
  assert.throws(
    () => policy.authorize({ name: "kernel.needs.approval", risk: "mutating", permission: "jobs:run", approvalRequired: true }, {}),
    (error) => isKernelError(error) && error.code === "KERNEL_APPROVAL_UNAVAILABLE"
  );
  assert.throws(
    () => policy.authorize({ name: "kernel.external", risk: "external", permission: "external:write" }, {}),
    (error) => isKernelError(error) && error.code === "KERNEL_EXTERNAL_APPROVAL_REQUIRED"
  );
});

test("runtime normalizes tool failures and plugin manifest validation errors", async () => {
  const runtime = createKernelRuntime({ root });
  runtime.registerTool({
    name: "kernel.test.fail",
    description: "Failing test tool.",
    risk: "safe",
    permission: "test:read",
    sideEffects: "none",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      throw new Error("boom");
    }
  });

  await assert.rejects(
    () => runtime.call("kernel.test.fail", {}),
    (error) => isKernelError(error) && error.code === "KERNEL_TOOL_FAILED" && error.message === "boom"
  );
  assert.equal(runtime.events().at(-1).type, "tool.failed");

  assert.deepEqual(runtime.loadPlugins({ enabled: true, directory: path.join(root, "does-not-exist") }), { loaded: 0, skipped: 0 });

  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-runtime-bad-plugin-"));
  fs.writeFileSync(path.join(pluginRoot, "bad.plugin.json"), JSON.stringify({ name: "bad", version: "0.1.0", tools: [] }));
  assert.deepEqual(runtime.loadPlugins({ enabled: true, directory: pluginRoot, allowlist: ["bad"] }), { loaded: 0, skipped: 0 });

  fs.writeFileSync(path.join(pluginRoot, "bad.plugin.json"), JSON.stringify({ name: "bad", version: "0.1.0", tools: [{ name: "bad.name" }] }));
  assert.throws(
    () => runtime.loadPlugins({ enabled: true, directory: pluginRoot, allowlist: ["bad"] }),
    (error) => isKernelError(error) && error.code === "KERNEL_PLUGIN_INVALID"
  );

  fs.writeFileSync(path.join(pluginRoot, "bad.plugin.json"), JSON.stringify({ version: "0.1.0", tools: [] }));
  assert.throws(
    () => runtime.loadPlugins({ enabled: true, directory: pluginRoot, allowlist: ["bad"] }),
    /requires name and version/
  );

  fs.writeFileSync(path.join(pluginRoot, "bad.plugin.json"), JSON.stringify({ name: "bad", version: "0.1.0", tools: {} }));
  assert.throws(
    () => runtime.loadPlugins({ enabled: true, directory: pluginRoot, allowlist: ["bad"] }),
    /requires a tools array/
  );

  fs.writeFileSync(
    path.join(pluginRoot, "bad.plugin.json"),
    JSON.stringify({ name: "bad", version: "0.1.0", tools: [{ name: "kernel.plugin.bad", risk: "mutating", permission: "plugin:read", inputSchema: { type: "object" }, output: {} }] })
  );
  assert.throws(
    () => runtime.loadPlugins({ enabled: true, directory: pluginRoot, allowlist: ["bad"] }),
    /read-only by default/
  );

  fs.writeFileSync(
    path.join(pluginRoot, "bad.plugin.json"),
    JSON.stringify({ name: "bad", version: "0.1.0", tools: [{ name: "kernel.plugin.bad", risk: "safe", inputSchema: { type: "object" }, output: {} }] })
  );
  assert.throws(
    () => runtime.loadPlugins({ enabled: true, directory: pluginRoot, allowlist: ["bad"] }),
    /incomplete metadata/
  );
});
