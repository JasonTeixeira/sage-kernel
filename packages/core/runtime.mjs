import fs from "node:fs";
import path from "node:path";
import { zodFromJsonSchema } from "./zod-schema.mjs";
import { createEventBus } from "./event-bus.mjs";
import { createPolicyEngine } from "./policy-engine.mjs";
import { createToolRegistry } from "./tool-registry.mjs";
import { callKernelTool } from "../../apps/mcp-server/src/kernel-tools.mjs";

export function createKernelRuntime(options = {}) {
  const root = options.root || process.cwd();
  const registry = options.registry || createToolRegistry();
  const policy = options.policy || createPolicyEngine(options.policyOptions || {});
  const eventBus = options.eventBus || createEventBus();

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
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      policy.authorize(tool);
      eventBus.emit({ type: "tool.started", tool: name, risk: tool.risk });
      try {
        const result = await tool.handler({ root, input, runtime: this });
        eventBus.emit({ type: "tool.finished", tool: name, risk: tool.risk });
        return result;
      } catch (error) {
        eventBus.emit({ type: "tool.failed", tool: name, risk: tool.risk, error: error.message });
        throw error;
      }
    },
    events() {
      return eventBus.list();
    },
    async loadBuiltInTools() {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, "apps/mcp-server/tools.json"), "utf8"));
      for (const tool of manifest.tools) {
        registry.register({
          name: tool.name,
          description: tool.description,
          risk: inferRisk(tool),
          sideEffects: tool.sideEffects || "none",
          inputSchema: tool.inputSchema,
          zodSchema: zodFromJsonSchema(tool.inputSchema),
          handler: async ({ input }) => callKernelTool(root, tool.name, input)
        });
      }
      return this;
    },
    entries() {
      return registry.entries();
    }
  };
}

function inferRisk(tool) {
  if (!tool.sideEffects) return "safe";
  if (tool.sideEffects.includes("external")) return "external";
  if (tool.sideEffects.includes("runs") || tool.sideEffects.includes("writes")) return "mutating";
  return "safe";
}
