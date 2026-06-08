const SAFE_RISKS = new Set(["safe", "read"]);
const MUTATING_RISKS = new Set(["mutating", "local-write", "command"]);
const EXTERNAL_RISKS = new Set(["external", "external-write", "destructive"]);

export function createPolicyEngine(options = {}) {
  const readOnly = options.readOnly ?? isReadOnlyEnv();
  return {
    authorize(tool) {
      if (!tool?.name) throw new Error("Policy requires tool.name");
      if (SAFE_RISKS.has(tool.risk)) return { allowed: true };
      if (readOnly && MUTATING_RISKS.has(tool.risk)) {
        throw new Error(`Read-only mode blocks mutating tool: ${tool.name}`);
      }
      if (EXTERNAL_RISKS.has(tool.risk)) {
        throw new Error(`External-risk tool requires explicit approval: ${tool.name}`);
      }
      return { allowed: true };
    }
  };
}

function isReadOnlyEnv() {
  return process.env.SAGE_KERNEL_READ_ONLY === "1" || process.env.SAGE_KERNEL_READ_ONLY === "true";
}
