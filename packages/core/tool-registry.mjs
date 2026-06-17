import { KernelError } from "./kernel-error.mjs";

const REQUIRED_FIELDS = ["name", "description", "risk", "sideEffects", "inputSchema", "handler"];

export function createToolRegistry() {
  const tools = new Map();
  return {
    register(tool) {
      validateTool(tool);
      if (tools.has(tool.name)) {
        throw new KernelError("KERNEL_TOOL_DUPLICATE", `Duplicate tool: ${tool.name}`, {
          details: { tool: tool.name },
          remediation: "Register each tool once and use unique kernel.* names."
        });
      }
      tools.set(tool.name, Object.freeze({ ...tool }));
      return tool;
    },
    get(name) {
      return tools.get(name) || null;
    },
    list() {
      return [...tools.values()].map(({ handler, ...metadata }) => metadata);
    },
    entries() {
      return [...tools.values()];
    }
  };
}

function validateTool(tool) {
  for (const field of REQUIRED_FIELDS) {
    if (!tool?.[field]) {
      throw new KernelError("KERNEL_TOOL_INVALID", `Tool missing ${field}`, {
        details: { field, tool: tool?.name || null },
        remediation: "Provide complete tool metadata before registering the tool."
      });
    }
  }
  if (!tool.name.startsWith("kernel.")) {
    throw new KernelError("KERNEL_TOOL_INVALID", `Tool name must start with kernel.: ${tool.name}`, {
      details: { tool: tool.name },
      remediation: "Rename the tool using the kernel.<domain>.<action> convention."
    });
  }
  if (typeof tool.handler !== "function") {
    throw new KernelError("KERNEL_TOOL_INVALID", `Tool handler must be a function: ${tool.name}`);
  }
  if (tool.inputSchema.type !== "object") {
    throw new KernelError("KERNEL_TOOL_INVALID", `Tool inputSchema.type must be object: ${tool.name}`);
  }
}
