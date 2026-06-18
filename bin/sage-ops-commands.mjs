/* node:coverage disable */
import { formatMcpClientConfig } from "../packages/core/mcp-client-config.mjs";
import {
  createDriftMap,
  createDriftProof,
  detectScopeCreep,
  formatDriftOutput,
  runSelfAudit
} from "../packages/drift/drift-engine.mjs";
import {
  auditArchitecture,
  auditCleanCode,
  auditSecurity,
  auditTests,
  createReleaseProof,
  createReviewScore,
  createSeniorReview,
  formatReviewOutput,
  inspectRepository,
  mapRoutesToTests,
  reviewDiff
} from "../packages/review/review-engine.mjs";
import {
  createSecurityProof,
  createSupplyChainReport,
  formatSecurityOutput,
  generateThreatModel
} from "../packages/security/supply-chain.mjs";
import {
  createPerformanceBudget,
  createPlaywrightTemplate,
  createTestingLabProof,
  formatTestingLabOutput,
  generateTestStrategy
} from "../packages/testing/testing-lab.mjs";
import { createReleaseStressEvidence, formatReleaseEvidenceOutput } from "../packages/testing/release-evidence.mjs";
import {
  approveLearningUpdate,
  createKnowledgeGraph,
  createMemoryE2EProof,
  enforceMemoryPolicy,
  formatKnowledgeOutput,
  proposeLearningUpdate
} from "../packages/intelligence/knowledge-graph.mjs";
import {
  createBenchmarkReport,
  createExternalComparisonReport,
  createQualityScoreboard,
  createScoreRegressionReport,
  formatScoreOutput,
  validateScoreModel
} from "../packages/score/scoreboard.mjs";
import {
  applyApprovedRepair,
  createRepairPlan,
  createSelfHealingProof,
  formatSelfHealingOutput
} from "../packages/self-healing/self-healing.mjs";
import { createFinalAuditReport, formatFinalAuditOutput } from "../packages/audit/final-audit.mjs";
import { jsonArg, positionalArgs, printTool, root, runNpm, valueArg } from "./sage-runtime.mjs";

export async function handleOpsCommand(command, args) {
  switch (command) {
    case "review":
      printReview(args);
      return true;
    case "security":
      printSecurity(args);
      return true;
    case "testing":
      printTesting(args);
      return true;
    case "release-evidence":
      await printReleaseEvidence(args);
      return true;
    case "memory":
      printMemory(args);
      return true;
    case "score":
      await printScore(args);
      return true;
    case "self-heal":
      printSelfHeal(args);
      return true;
    case "final-audit":
      await printFinalAudit(args);
      return true;
    case "drift":
      printDrift(args);
      return true;
    case "mcp":
      printMcp(args);
      return true;
    case "failures":
      await printTool("kernel.workflow.explain_failures", { report: jsonArg(args.join(" "), null) });
      return true;
    case "root":
      console.log(root);
      return true;
    default:
      return false;
  }
}

function printReview(args) {
  const [subcommand = "inspect", projectPath = "."] = positionalArgs(args);
  const json = args.includes("--json");
  try {
    const value = subcommand === "inspect"
      ? inspectRepository({ root, projectPath })
      : subcommand === "architecture"
        ? auditArchitecture({ root, projectPath })
        : subcommand === "clean-code"
          ? auditCleanCode({ root, projectPath })
          : subcommand === "tests"
            ? auditTests({ root, projectPath })
            : subcommand === "security"
              ? auditSecurity({ root, projectPath })
              : subcommand === "diff"
                ? reviewDiff({ root, projectPath })
                : subcommand === "routes"
                  ? mapRoutesToTests({ root, projectPath })
                  : subcommand === "score"
                    ? createReviewScore({ root, projectPath })
                    : subcommand === "senior"
                      ? createSeniorReview({ root, projectPath })
                      : subcommand === "prove"
                        ? createReleaseProof({ root, projectPath })
                        : null;
    if (!value) return failUnknown("review", subcommand);
    console.log(formatReviewOutput(value, { json }));
  } catch (error) {
    fail(error);
  }
}

function printSecurity(args) {
  const [subcommand = "prove", projectPath = "."] = positionalArgs(args);
  const json = args.includes("--json");
  try {
    const value = subcommand === "threat-model"
      ? generateThreatModel({ root, projectPath })
      : subcommand === "supply-chain"
        ? createSupplyChainReport({ root, projectPath })
        : subcommand === "prove"
          ? createSecurityProof({ root, projectPath })
          : null;
    if (!value) return failUnknown("security", subcommand);
    console.log(formatSecurityOutput(value, { json }));
  } catch (error) {
    fail(error);
  }
}

function printTesting(args) {
  const [subcommand = "proof", projectPath = "."] = positionalArgs(args);
  const json = args.includes("--json");
  try {
    const value = subcommand === "strategy"
      ? generateTestStrategy({ root, projectPath, risk: valueArg(args, "--risk") || undefined })
      : subcommand === "playwright"
        ? createPlaywrightTemplate({ root, projectPath })
        : subcommand === "budget"
          ? createPerformanceBudget({ root, projectPath })
          : subcommand === "proof"
            ? createTestingLabProof({ root, projectPath, risk: valueArg(args, "--risk") || undefined })
            : null;
    if (!value) return failUnknown("testing", subcommand);
    console.log(formatTestingLabOutput(value, { json }));
  } catch (error) {
    fail(error);
  }
}

async function printReleaseEvidence(args) {
  const [projectPath = "."] = positionalArgs(args);
  const json = args.includes("--json");
  try {
    const value = await createReleaseStressEvidence({
      root,
      projectPath,
      queueCount: Number(valueArg(args, "--queue-count") || 1000),
      dashboardCount: Number(valueArg(args, "--dashboard-count") || 0),
      cycles: Number(valueArg(args, "--cycles") || 1),
      includeDashboard: args.includes("--dashboard"),
      profile: valueArg(args, "--profile") || "release-evidence"
    });
    console.log(formatReleaseEvidenceOutput(value, { json }));
    process.exitCode = value.status === "passed" ? 0 : 1;
  } catch (error) {
    fail(error);
  }
}

function printMemory(args) {
  const [subcommand = "graph", projectPath = "."] = positionalArgs(args);
  const json = args.includes("--json");
  try {
    const proposal = proposeLearningUpdate({
      root,
      projectPath,
      summary: valueArg(args, "--summary") || undefined,
      failure: valueArg(args, "--failure") || undefined,
      fix: valueArg(args, "--fix") || undefined,
      scope: valueArg(args, "--scope") || undefined
    });
    const value = subcommand === "policy"
      ? enforceMemoryPolicy({
          projectId: "sage-kernel",
          scope: valueArg(args, "--scope") || "project",
          kind: valueArg(args, "--kind") || "episode",
          summary: valueArg(args, "--summary") || "Validate memory policy.",
          confidence: Number(valueArg(args, "--confidence") || 0.8),
          evidenceRef: valueArg(args, "--evidence") || "cli"
        })
      : subcommand === "graph"
        ? createKnowledgeGraph({ root, projectPath })
        : subcommand === "learn"
          ? proposal
          : subcommand === "approve"
            ? approveLearningUpdate(proposal, { approvedBy: valueArg(args, "--approved-by") || "local-user" })
            : subcommand === "e2e"
              ? createMemoryE2EProof({ root, projectPath })
              : null;
    if (!value) return failUnknown("memory", subcommand);
    console.log(formatKnowledgeOutput(value, { json }));
  } catch (error) {
    fail(error);
  }
}

async function printScore(args) {
  const [subcommand = "report", projectPath = "."] = positionalArgs(args);
  const json = args.includes("--json");
  try {
    const value = subcommand === "validate"
      ? validateScoreModel()
      : subcommand === "report"
        ? await createQualityScoreboard({ root, projectPath })
        : subcommand === "benchmarks"
          ? createBenchmarkReport({ root, projectPath })
          : subcommand === "regression"
            ? createScoreRegressionReport({ scoreboard: await createQualityScoreboard({ root, projectPath }) })
            : subcommand === "compare"
              ? createExternalComparisonReport()
              : null;
    if (!value) return failUnknown("score", subcommand);
    console.log(formatScoreOutput(value, { json }));
    process.exitCode = value.status === "failed" ? 1 : 0;
  } catch (error) {
    fail(error);
  }
}

function printSelfHeal(args) {
  const [subcommand = "prove"] = positionalArgs(args);
  const json = args.includes("--json");
  try {
    const plan = createRepairPlan({
      failedGate: valueArg(args, "--gate") || "test -f SELF_HEALING_PROOF.txt",
      signal: valueArg(args, "--signal") || "controlled proof failure"
    });
    const value = subcommand === "plan"
      ? plan
      : subcommand === "prove"
        ? createSelfHealingProof({ root })
        : subcommand === "apply"
          ? applyApprovedRepair(plan, { root, approved: args.includes("--approved") })
          : null;
    if (!value) return failUnknown("self-heal", subcommand);
    console.log(formatSelfHealingOutput(value, { json }));
    process.exitCode = value.status === "failed" ? 1 : 0;
  } catch (error) {
    fail(error);
  }
}

async function printFinalAudit(args) {
  const [projectPath = "."] = positionalArgs(args);
  const json = args.includes("--json");
  try {
    const value = await createFinalAuditReport({ root, projectPath });
    console.log(formatFinalAuditOutput(value, { json }));
    process.exitCode = value.status === "failed" ? 1 : 0;
  } catch (error) {
    fail(error);
  }
}

function printDrift(args) {
  const [subcommand = "prove"] = positionalArgs(args);
  const json = args.includes("--json");
  const value = subcommand === "map"
    ? createDriftMap({ root })
    : subcommand === "scope"
      ? detectScopeCreep({ root })
      : subcommand === "audit"
        ? runSelfAudit({ root })
        : subcommand === "prove"
          ? createDriftProof({ root })
          : null;
  if (!value) return failUnknown("drift", subcommand);
  console.log(formatDriftOutput(value, { json }));
  process.exitCode = value.status === "passed" ? 0 : 1;
}

function printMcp(args) {
  const [subcommand = "start", client = "all"] = positionalArgs(args);
  if (subcommand === "start" || subcommand === "server") return runNpm("mcp:server");
  if (subcommand === "smoke") return runNpm("mcp:smoke");
  if (subcommand === "config") {
    try {
      console.log(formatMcpClientConfig(client, { root, json: args.includes("--json") }));
    } catch (error) {
      fail(error);
    }
    return;
  }
  failUnknown("mcp", subcommand);
}

function failUnknown(scope, subcommand) {
  console.error(`Unknown ${scope} subcommand: ${subcommand}`);
  process.exitCode = 1;
}

function fail(error) {
  console.error(error.message);
  process.exitCode = 1;
}
