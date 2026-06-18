import { createSoakReport } from "../../scripts/soak-runner.mjs";
import { createPerformanceBudget } from "./testing-lab.mjs";

export async function createReleaseStressEvidence(options = {}) {
  const root = options.root || process.cwd();
  const budget = createPerformanceBudget({ root, projectPath: options.projectPath || "." });
  const soak = await createSoakReport({
    root,
    profile: options.profile || "release-evidence",
    cycles: Number(options.cycles ?? 1),
    queueCount: Number(options.queueCount ?? 1000),
    dashboardCount: Number(options.dashboardCount ?? 0),
    concurrency: Number(options.concurrency ?? 5),
    includeDashboard: Boolean(options.includeDashboard),
    includeMcp: options.includeMcp ?? true,
    mcpSmoke: options.mcpSmoke
  });
  return {
    status: soak.status === "passed" ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    budget,
    soak,
    releaseProfiles: {
      queue100k: budget.stressProfiles.find((profile) => profile.id === "queue-100k"),
      dashboard1k: budget.stressProfiles.find((profile) => profile.id === "dashboard-1k"),
      longSoak: budget.stressProfiles.find((profile) => profile.id === "release-soak")
    },
    evidenceStatus: {
      boundedCiProof: soak.status,
      queue100kRecorded: Number(options.queueCount || 0) >= 100000,
      dashboard1kRecorded: Number(options.dashboardCount || 0) >= 1000,
      longDurationRecorded: ["extended", "release"].includes(String(options.profile || ""))
    },
    nextActions: [
      "For a release candidate, rerun with --queue-count=100000.",
      "For dashboard release proof, run against a live dashboard with --dashboard-count=1000 --dashboard.",
      "For long soak proof, run npm run soak:run -- --profile=extended and archive the memory delta."
    ]
  };
}

export function formatReleaseEvidenceOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  return `Release stress evidence ${value.status}: cycles=${value.soak.cycles.length}, queue100k=${value.evidenceStatus.queue100kRecorded}, long=${value.evidenceStatus.longDurationRecorded}\n`;
}
