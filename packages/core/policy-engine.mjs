import { KernelError } from "./kernel-error.mjs";

const SAFE_RISKS = new Set(["safe", "read"]);
const MUTATING_RISKS = new Set(["mutating", "local-write", "command"]);
const EXTERNAL_RISKS = new Set(["external", "external-write", "destructive"]);

export function createPolicyEngine(options = {}) {
  const readOnly = options.readOnly ?? isReadOnlyEnv();
  const scopes = new Set(options.scopes || ["*"]);
  const approvalLedger = options.approvalLedger || null;
  return {
    authorize(tool, input = {}) {
      if (!tool?.name) {
        throw new KernelError("KERNEL_POLICY_INVALID_TOOL", "Policy requires tool.name", {
          remediation: "Pass complete tool metadata into the policy engine."
        });
      }
      if (tool.permission && !hasPermissionScope(scopes, tool.permission)) {
        throw new KernelError("KERNEL_PERMISSION_DENIED", `Missing permission scope for ${tool.name}: ${tool.permission}`, {
          details: { tool: tool.name, permission: tool.permission },
          remediation: `Grant the ${tool.permission} scope or call a tool allowed by the active policy.`
        });
      }
      if (SAFE_RISKS.has(tool.risk)) return { allowed: true };
      if (readOnly && MUTATING_RISKS.has(tool.risk)) {
        throw new KernelError("KERNEL_READ_ONLY_DENIED", `Read-only mode blocks mutating tool: ${tool.name}`, {
          details: { tool: tool.name, risk: tool.risk },
          remediation: "Disable read-only mode only in a trusted local environment."
        });
      }
      if (tool.approvalRequired) {
        if (!approvalLedger) {
          throw new KernelError("KERNEL_APPROVAL_UNAVAILABLE", `Tool requires approval but no approval ledger is configured: ${tool.name}`);
        }
        if (!input.approvalId) {
          throw new KernelError("KERNEL_APPROVAL_REQUIRED", `Tool requires approval: ${tool.name}`, {
            details: { tool: tool.name },
            remediation: "Create and approve a matching approval request, then retry with approvalId."
          });
        }
        return approvalLedger.verify({
          id: input.approvalId,
          action: tool.name,
          payload: stripApprovalInput(input)
        });
      }
      if (EXTERNAL_RISKS.has(tool.risk)) {
        throw new KernelError("KERNEL_EXTERNAL_APPROVAL_REQUIRED", `External-risk tool requires explicit approval: ${tool.name}`, {
          details: { tool: tool.name, risk: tool.risk },
          remediation: "Route this action through a signed approval before execution."
        });
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

function hasPermissionScope(scopes, permission) {
  if (scopes.has("*") || scopes.has(permission)) return true;
  for (const scope of scopes) {
    if (!scope.endsWith("*")) continue;
    const prefix = scope.slice(0, -1);
    if (permission.startsWith(prefix)) return true;
    if (prefix.endsWith(":") && permission.startsWith(`${prefix.slice(0, -1)}.`)) return true;
  }
  return false;
}
