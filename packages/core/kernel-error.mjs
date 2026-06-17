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
