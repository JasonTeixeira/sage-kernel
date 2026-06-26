export class KernelError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "KernelError";
    this.code = code;
    this.details = options.details || {};
    this.remediation = options.remediation || "";
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      remediation: this.remediation
    };
  }
}

export function isKernelError(error) {
  return error instanceof KernelError || Boolean(error?.code && error?.name === "KernelError");
}

// Classify an error into a stable, machine-actionable KIND so the MCP client and
// the autonomous loop can reason about failures programmatically (instead of
// string-matching). Order matters: most-specific intent first.
export function classifyErrorKind(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "");
  if (/read-only|requires approval|approval before|refusing to|outside allowed|not allowed/.test(message)) return "forbidden";
  if (code === "KERNEL_TOOL_NOT_FOUND" || /unknown tool|does not exist|not a directory|not in catalog|no such/.test(message)) return "not_found";
  if (/requires input|is required|must be|invalid|expected |is not a function|cannot read propert|received (number|undefined|null)/.test(message)) return "validation";
  if (/^blocked_|blocked_not_|not configured|set [a-z_]+ /.test(message)) return "blocked";
  return "internal";
}

export function normalizeKernelError(error, fallback = {}) {
  if (isKernelError(error)) return error;
  return new KernelError(
    fallback.code || "KERNEL_INTERNAL_ERROR",
    error?.message || fallback.message || "Kernel operation failed",
    {
      cause: error,
      details: fallback.details,
      remediation: fallback.remediation || "Review the failing command output and retry after fixing the reported issue."
    }
  );
}
