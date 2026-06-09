const SAFE_RISKS = new Set(["safe", "read"]);
const MUTATING_RISKS = new Set(["mutating", "local-write", "command"]);
const EXTERNAL_RISKS = new Set(["external", "external-write", "destructive"]);

export function createPolicyEngine(options = {}) {
  const readOnly = options.readOnly ?? isReadOnlyEnv();
  const scopes = new Set(options.scopes || ["*"]);
  const approvalLedger = options.approvalLedger || null;
  return {
    authorize(tool, input = {}) {
      if (!tool?.name) throw new Error("Policy requires tool.name");
      if (tool.permission && !scopes.has("*") && !scopes.has(tool.permission)) {
        throw new Error(`Missing permission scope for ${tool.name}: ${tool.permission}`);
      }
      if (SAFE_RISKS.has(tool.risk)) return { allowed: true };
      if (readOnly && MUTATING_RISKS.has(tool.risk)) {
        throw new Error(`Read-only mode blocks mutating tool: ${tool.name}`);
      }
      if (tool.approvalRequired) {
        if (!approvalLedger) throw new Error(`Tool requires approval but no approval ledger is configured: ${tool.name}`);
        if (!input.approvalId) throw new Error(`Tool requires approval: ${tool.name}`);
        return approvalLedger.verify({
          id: input.approvalId,
          action: tool.name,
          payload: stripApprovalInput(input)
        });
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

function stripApprovalInput(input) {
  const { approvalId, ...rest } = input || {};
  return rest;
}
