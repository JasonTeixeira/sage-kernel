import { fileURLToPath } from "node:url";

// CI-native PR report (cat 20). Turns a kernel run into a Markdown scorecard for
// a PR comment, and a pass/fail gate verdict. Pure builders (testable) + a CLI
// that gathers live data and prints the comment, failing the check on regression
// or any high-severity security finding.

export function buildPrReport(data = {}) {
  const score = data.score ?? 0;
  const baseline = data.baselineScore ?? null;
  const delta = baseline == null ? null : score - baseline;
  const sast = data.sast || { high: 0, medium: 0 };
  const gaps = Array.isArray(data.gaps) ? data.gaps : [];
  const profile = data.profile || "unknown";
  const lines = [];
  lines.push("## 🛡️ Sage Kernel Review");
  lines.push("");
  lines.push(`**Profile:** \`${profile}\`  ·  **Score:** ${score}/100${delta == null ? "" : `  (${delta >= 0 ? "▲ +" : "▼ "}${delta} vs base)`}`);
  lines.push("");
  lines.push(`**Security (SAST):** ${sast.high} high · ${sast.medium} medium`);
  lines.push("");
  if (gaps.length) {
    lines.push(`### Gaps (${gaps.length})`);
    for (const gap of gaps.slice(0, 20)) lines.push(`- ${gap}`);
    if (gaps.length > 20) lines.push(`- …and ${gaps.length - 20} more`);
  } else {
    lines.push("### Gaps");
    lines.push("- none 🎉");
  }
  lines.push("");
  const verdict = evaluatePrGate(data);
  lines.push(`**Verdict:** ${verdict.status === "passed" ? "✅ passed" : "❌ failed"} — ${verdict.reasons.join("; ") || "all checks within budget"}`);
  return lines.join("\n");
}

// Fails the PR on a high-severity security finding or a score regression beyond
// the allowed drop (default 0 — score must not decrease vs base).
export function evaluatePrGate(data = {}) {
  const reasons = [];
  const sast = data.sast || { high: 0 };
  if ((sast.high || 0) > 0) reasons.push(`${sast.high} high-severity security finding(s)`);
  const baseline = data.baselineScore ?? null;
  const allowedDrop = data.allowedDrop ?? 0;
  if (baseline != null && data.score != null && data.score < baseline - allowedDrop) {
    reasons.push(`score regressed ${baseline} → ${data.score}`);
  }
  return { status: reasons.length ? "failed" : "passed", reasons };
}

/* node:coverage ignore next 22 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { callKernelTool } = await import("../apps/mcp-server/src/kernel-tools.mjs");
  const root = process.cwd();
  const score = await callKernelTool(root, "kernel.loop.score", { projectPath: ".", risk: "high" }).catch(() => ({ score: 0 }));
  const gapsReport = await callKernelTool(root, "kernel.profile.gaps", { projectPath: "." }).catch(() => ({ missing: [], primaryProfile: "unknown" }));
  const sast = await callKernelTool(root, "kernel.security.sast", { projectPath: "." }).catch(() => ({ high: 0, summary: { medium: 0 } }));
  const data = {
    score: typeof score.score === "number" ? score.score : 0,
    profile: gapsReport.primaryProfile,
    gaps: gapsReport.missing || [],
    sast: { high: sast.high || 0, medium: sast.summary?.medium || 0 },
    baselineScore: process.env.SAGE_BASELINE_SCORE ? Number(process.env.SAGE_BASELINE_SCORE) : null
  };
  console.log(buildPrReport(data));
  process.exit(evaluatePrGate(data).status === "passed" ? 0 : 1);
}
