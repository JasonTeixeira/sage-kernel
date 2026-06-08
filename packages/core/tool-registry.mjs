const REQUIRED_FIELDS = ["name", "description", "risk", "sideEffects", "inputSchema", "handler"];

export function createToolRegistry() {
  const tools = new Map();
  return {
    register(tool) {
      validateTool(tool);
      if (tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
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
    if (!tool?.[field]) throw new Error(`Tool missing ${field}`);
  }
  if (!tool.name.startsWith("kernel.")) throw new Error(`Tool name must start with kernel.: ${tool.name}`);
  if (typeof tool.handler !== "function") throw new Error(`Tool handler must be a function: ${tool.name}`);
  if (tool.inputSchema.type !== "object") throw new Error(`Tool inputSchema.type must be object: ${tool.name}`);
}
