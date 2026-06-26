import { fileURLToPath } from "node:url";
import { analyzeComplexity } from "../packages/refactor/complexity.mjs";

// Maintainability gate: fail when any function exceeds the branch-complexity or
// length budget, except documented flat dispatch/detection/template functions
// (high cyclomatic, low cognitive complexity — routing tables, not tangled logic).
export const COMPLEXITY_BUDGET = { maxComplexity: 30, maxLines: 250 };
export const COMPLEXITY_ALLOW = [
  "apps/mcp-server/src/kernel-tools.mjs#callKernelTool",   // flat MCP dispatch table (123 tools)
  "packages/profiles/project-detector.mjs#detectProjectTypes", // flat profile-detection table
  "apps/dashboard/dashboard-render.mjs#renderDashboardHtmlView" // HTML template assembly (Phase 12 cockpit replaces)
];

export function runComplexityGate(root = process.cwd()) {
  return analyzeComplexity({ root, ...COMPLEXITY_BUDGET, allow: COMPLEXITY_ALLOW });
}

/* node:coverage ignore next 9 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runComplexityGate(process.cwd());
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "passed") {
    console.error(`Complexity gate failed: ${report.violations.length} function(s) over budget (max complexity ${report.maxComplexity}, max lines ${report.maxLines}).`);
    process.exit(1);
  }
  console.log(`Complexity gate passed: ${report.functionsScanned} functions scanned, ${report.allowedExemptions} documented exemptions.`);
}
