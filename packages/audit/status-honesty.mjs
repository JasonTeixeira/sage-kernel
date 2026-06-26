const DISHONEST_PASS_PATTERNS = [
  /\bblocked_not_verified\b/i,
  /\bblocked_not_implemented\b/i,
  /\bneeds_external_evidence\b/i,
  /\bpassed_with_manual_ui_gaps\b/i,
  /\bready_without_external_publish\b/i,
  /\bmanual_client_launch_required\b/i,
  /\bunverified\b/i,
  /\bnot verified\b/i,
  /\bsimulated\b/i,
  /\bsynthetic proof\b/i,
  /\bfixture-only\b/i,
  /\bmanual proof\b/i,
  /\brequires real\b/i,
  /\brequires an actual\b/i
];

export function validateStatusHonesty(value, options = {}) {
  const failures = [];
  const rootLabel = options.label || "root";
  visit(value, rootLabel, failures);
  return {
    status: failures.length === 0 ? "passed" : "failed",
    checked: { dishonestPassedClaims: failures.length },
    failures
  };
}

export function assertStatusHonest(value, options = {}) {
  const report = validateStatusHonesty(value, options);
  if (report.status !== "passed") {
    throw new Error(`Status honesty failed:\n${report.failures.map((failure) => `- ${failure}`).join("\n")}`);
  }
  return report;
}

function visit(value, path, failures) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${path}[${index}]`, failures));
    return;
  }

  if (value.status === "passed") {
    const dishonest = collectDishonestSignals(value);
    for (const signal of dishonest) {
      failures.push(`${path}: status passed with unverified signal at ${signal.path}: ${signal.value}`);
    }
  }

  for (const [key, child] of Object.entries(value)) {
    visit(child, `${path}.${key}`, failures);
  }
}

function collectDishonestSignals(value, basePath = "$", results = []) {
  if (value === null || value === undefined) return results;
  if (typeof value === "string") {
    for (const pattern of DISHONEST_PASS_PATTERNS) {
      if (pattern.test(value)) {
        results.push({ path: basePath, value: summarize(value) });
        break;
      }
    }
    return results;
  }
  if (typeof value !== "object") return results;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectDishonestSignals(item, `${basePath}[${index}]`, results));
    return results;
  }
  for (const [key, child] of Object.entries(value)) {
    collectDishonestSignals(child, `${basePath}.${key}`, results);
  }
  return results;
}

function summarize(value) {
  return String(value).replace(/\s+/g, " ").slice(0, 220);
}
