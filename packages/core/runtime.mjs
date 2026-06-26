import fs from "node:fs";
import path from "node:path";
import { createAuditSink } from "./audit-log.mjs";
import { KernelError, normalizeKernelError, classifyErrorKind } from "./kernel-error.mjs";
import { zodFromJsonSchema } from "./zod-schema.mjs";
import { createEventBus } from "./event-bus.mjs";
import { createPolicyEngine } from "./policy-engine.mjs";
import { createToolRegistry } from "./tool-registry.mjs";
import { createSqliteAdapter } from "../db/adapter.mjs";
import { createApprovalLedger } from "../security/approvals.mjs";
import { callKernelTool } from "../../apps/mcp-server/src/kernel-tools.mjs";

export function createKernelRuntime(options = {}) {
  const root = options.root || process.cwd();
  const registry = options.registry || createToolRegistry();
  const db = options.db || createSqliteAdapter({ root });
  db.init();
  const approvalLedger = options.approvalLedger || createApprovalLedger({ db });
  const policy = options.policy || createPolicyEngine({ approvalLedger, ...(options.policyOptions || {}) });
  const auditSink = options.auditSink === undefined ? createAuditSink({ db }) : options.auditSink;
  const eventBus = options.eventBus || createEventBus(auditSink);

  return {
    root,
    registerTool(tool) {
      return registry.register(tool);
    },
    listTools() {
      return registry.list();
    },
    getTool(name) {
      return registry.get(name);
    },
    async call(name, input = {}) {
      const tool = registry.get(name);
      if (!tool) {
        throw new KernelError("KERNEL_TOOL_NOT_FOUND", `Unknown tool: ${name}`, {
          details: { tool: name },
          remediation: "List available tools with mcp:tools or client.listTools before calling."
        });
      }
      policy.authorize(tool, input);
      eventBus.emit({ type: "tool.started", tool: name, risk: tool.risk, input });
      try {
        const result = await tool.handler({ root, input, runtime: this });
        eventBus.emit({ type: "tool.finished", tool: name, risk: tool.risk });
        return result;
      } catch (error) {
        const normalized = normalizeKernelError(error, {
          code: "KERNEL_TOOL_FAILED",
          details: { tool: name },
          remediation: "Inspect the tool failure details, fix the underlying condition, and retry."
        });
        eventBus.emit({ type: "tool.failed", tool: name, risk: tool.risk, error: normalized.message, code: normalized.code });
        throw normalized;
      }
    },
    // Uniform error envelope: never throws. Returns { ok:true, data } on success
    // or { ok:false, error:{ code, kind, message, remediation, details } }. This is
    // the contract MCP clients and the autonomous loop reason over — a tool failure
    // is data, not an exception. (call() keeps throwing for internal callers/tests.)
    async callSafe(name, input = {}) {
      try {
        return { ok: true, data: await this.call(name, input) };
      } catch (error) {
        const normalized = normalizeKernelError(error, { code: "KERNEL_TOOL_FAILED", details: { tool: name } });
        return { ok: false, error: { ...normalized.toJSON(), kind: classifyErrorKind(normalized) } };
      }
    },
    events() {
      return eventBus.list();
    },
    approvalLedger() {
      return approvalLedger;
    },
    async loadBuiltInTools() {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, "apps/mcp-server/tools.json"), "utf8"));
      for (const tool of manifest.tools) {
        registry.register({
          name: tool.name,
          description: tool.description,
          risk: tool.risk,
          permission: tool.permission,
          approvalRequired: Boolean(tool.approvalRequired),
          sideEffects: tool.sideEffects || "none",
          inputSchema: tool.inputSchema,
          zodSchema: zodFromJsonSchema(tool.inputSchema),
          handler: async ({ input }) => callKernelTool(root, tool.name, input)
        });
      }
      return this;
    },
    loadPlugins(pluginOptions = {}) {
      return loadPlugins({ root, registry, pluginOptions });
    },
    entries() {
      return registry.entries();
    }
  };
}

function loadPlugins({ root, registry, pluginOptions }) {
  if (!pluginOptions.enabled) return { loaded: 0, skipped: 0 };
  const directory = pluginOptions.directory || path.join(root, "plugins");
  const allowlist = new Set(pluginOptions.allowlist || []);
  if (!fs.existsSync(directory)) return { loaded: 0, skipped: 0 };

  let loaded = 0;
  let skipped = 0;
  for (const file of fs.readdirSync(directory).filter((item) => item.endsWith(".plugin.json")).sort()) {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
    validatePluginManifest(manifest);
    if (!allowlist.has(manifest.name)) {
      throw new KernelError("KERNEL_PLUGIN_NOT_ALLOWLISTED", `Plugin is not allowlisted: ${manifest.name}`, {
        details: { plugin: manifest.name },
        remediation: "Add the plugin name to the explicit allowlist after reviewing its manifest."
      });
    }
    for (const tool of manifest.tools) {
      registry.register({
        ...tool,
        handler: async () => tool.output
      });
      loaded += 1;
    }
  }
  return { loaded, skipped };
}

function validatePluginManifest(manifest) {
  if (!manifest?.name || !manifest.version) {
    throw new KernelError("KERNEL_PLUGIN_INVALID", "Plugin manifest requires name and version");
  }
  if (!Array.isArray(manifest.tools)) {
    throw new KernelError("KERNEL_PLUGIN_INVALID", `Plugin ${manifest.name} requires a tools array`);
  }
  for (const tool of manifest.tools) {
    if (!tool.name?.startsWith("kernel.plugin.")) {
      throw new KernelError("KERNEL_PLUGIN_INVALID", `Plugin tool must start with kernel.plugin.: ${tool.name}`);
    }
    if (tool.risk !== "safe" && tool.risk !== "read") {
      throw new KernelError("KERNEL_PLUGIN_INVALID", `Plugin tool must be read-only by default: ${tool.name}`);
    }
    if (!tool.permission || !tool.inputSchema || tool.output === undefined) {
      throw new KernelError("KERNEL_PLUGIN_INVALID", `Plugin tool has incomplete metadata: ${tool.name}`);
    }
  }
}
