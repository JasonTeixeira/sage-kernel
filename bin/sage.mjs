#!/usr/bin/env node
/* node:coverage disable */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callToolCli } from "../apps/mcp-server/scripts/call-tool.mjs";
import {
  createAgentsDoctorReport,
  formatAgentsText,
  installGlobalAgentPack,
  listAgentProfiles,
  validateAgentPack
} from "../packages/agents/agent-pack.mjs";
import {
  evaluateAgentRuntime,
  formatAgentRuntimeOutput,
  listAgentRoles,
  reviewWithCouncil,
  runAgentTask,
  validateAgentRuntime
} from "../packages/agents/runtime.mjs";
import { createDoctorReport, formatDoctorReport } from "../packages/core/doctor.mjs";
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
import {
  detectProjectProfile,
  formatProfileOutput,
  generateDefinitionOfDone,
  proveProfilePaths,
  validateSdlcProfiles
} from "../packages/profiles/project-detector.mjs";
import {
  createClosedLoopWorkflow,
  formatClosedLoopOutput,
  proveClosedLoopWorkflows,
  validateClosedLoopWorkflows
} from "../packages/workflows/closed-loop.mjs";
import {
  createDefaultWorkflowDefinition,
  createWorkflowEngineFixture,
  formatWorkflowEngineOutput,
  runWorkflow,
  validateWorkflowDefinition
} from "../packages/workflows/engine.mjs";

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), "..");
const [command, ...args] = process.argv.slice(2);

function runNode(script, scriptArgs = []) {
  const result = spawnSync("node", [script, ...scriptArgs], {
    cwd: root,
    stdio: "inherit"
  });
  process.exitCode = result.status ?? 1;
}

function runNpm(script, scriptArgs = []) {
  const result = spawnSync("npm", ["run", script, "--", ...scriptArgs], {
    cwd: root,
    stdio: "inherit"
  });
  process.exitCode = result.status ?? 1;
}

async function printTool(tool, input = {}) {
  const result = await callToolCli([tool, JSON.stringify(input)], { root });
  if (result.stderr) console.error(result.stderr);
  if (result.stdout) console.log(result.stdout);
  process.exitCode = result.status;
}

function jsonArg(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Input must be JSON: ${error.message}`);
    process.exit(1);
  }
}

function help() {
  console.log(`Sage Kernel OS

Usage:
  sage status
  sage tools
  sage ask <query>
  sage templates
  sage plan <template> [target] [name]
  sage new <template> <name>
  sage infra <template> [target]
  sage emit <template> <target> [name]
  sage qa <template|projectPath>
  sage repo <repo-name>
  sage deploy <template> [target]
  sage jobs
  sage enqueue <job-id>
  sage tick
  sage daemon
  sage run <job-id>
  sage runs
  sage approvals [status]
  sage dashboard
  sage dashboard-live
  sage postgres-schema
  sage dogfood-prod [repo...]
  sage doctor [--json] [--fast] [--client=codex|claude|cursor|all]
  sage agents [list|validate|install|doctor] [--json] [--force] [--home=/path]
  sage agent [roles|validate|eval|run] [role] [projectPath] [--objective=text] [--json]
  sage council review [projectPath] [--roles=a,b,c] [--objective=text] [--json]
  sage profile [detect|validate] [projectPath] [--json]
  sage loop [plan|dry-run|run|validate|prove] [projectPath] [--objective=text] [--risk=low|medium|high|critical] [--json]
  sage workflow [validate|prove|run] [workflow-json-file] [--json]
  sage done generate [projectPath] [--objective=text] [--risk=low|medium|high|critical] [--profile=id] [--json]
  sage review [inspect|architecture|clean-code|tests|security|diff|routes|score|senior|prove] [projectPath] [--json]
  sage security [threat-model|supply-chain|prove] [projectPath] [--json]
  sage testing [strategy|playwright|budget|proof] [projectPath] [--json]
  sage release-evidence [projectPath] [--json]
  sage memory [policy|graph|learn|approve|e2e] [projectPath] [--summary=text] [--failure=text] [--fix=text] [--json]
  sage score [validate|report|benchmarks|regression|compare] [projectPath] [--json]
  sage self-heal [plan|prove|apply] [--approved] [--json]
  sage final-audit [projectPath] [--json]
  sage drift [map|scope|audit|prove] [--json]
  sage mcp [start|config|smoke]
  sage daily
  sage audit [projectPath]
  sage full-qa [projectPath]
  sage failures [json-report]
  sage create-app <template> <name>
  sage release [template] [target]
  sage pending
  sage stress [url]
  sage db

Examples:
  sage plan next-saas-app vercel contractor-dispatch-os
  sage new next-ai-app ai-research-copilot
  sage run nightly-local-audit
  sage mcp config codex --json
  sage daily
`);
}

switch (command) {
  case undefined:
  case "help":
  case "--help":
  case "-h":
    help();
    break;

  case "status":
    runNpm("phase:status");
    break;

  case "tools":
    runNpm("mcp:tools");
    break;

  case "ask": {
    const query = args.join(" ");
    if (!query) {
      console.error("Usage: sage ask <query>");
      process.exit(1);
    }
    runNode("apps/mcp-server/scripts/call-tool.mjs", [
      "kernel.catalog.search",
      JSON.stringify({ query, limit: 10 })
    ]);
    break;
  }

  case "templates":
    runNpm("template:list");
    break;

  case "plan": {
    const [template, target = "vercel", ...nameParts] = args;
    if (!template) {
      console.error("Usage: sage plan <template> [target] [name]");
      process.exit(1);
    }
    runNode("apps/mcp-server/scripts/call-tool.mjs", [
      "kernel.project.plan",
      JSON.stringify({ template, target, name: nameParts.join(" ") || undefined })
    ]);
    break;
  }

  case "new": {
    const [template, ...nameParts] = args;
    const name = nameParts.join(" ");
    if (!template || !name) {
      console.error("Usage: sage new <template> <name>");
      process.exit(1);
    }
    runNode("apps/mcp-server/scripts/call-tool.mjs", [
      "kernel.project.scaffold",
      JSON.stringify({ template, name })
    ]);
    break;
  }

  case "infra": {
    const [template, target = "vercel"] = args;
    if (!template) {
      console.error("Usage: sage infra <template> [target]");
      process.exit(1);
    }
    runNode("apps/mcp-server/scripts/call-tool.mjs", [
      "kernel.infra.plan",
      JSON.stringify({ template, target })
    ]);
    break;
  }

  case "emit": {
    const [template, target = "docker-compose", name = template] = args;
    if (!template) {
      console.error("Usage: sage emit <template> <target> [name]");
      process.exit(1);
    }
    runNpm("infra:emit", ["--template", template, "--target", target, "--name", name]);
    break;
  }

  case "qa": {
    const [value = "next-saas-app"] = args;
    if (value.includes("/") || value === ".") {
      runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.qa.run", JSON.stringify({ projectPath: value })]);
    } else {
      runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.qa.plan", JSON.stringify({ template: value })]);
    }
    break;
  }

  case "repo": {
    const [repo] = args;
    if (!repo) {
      console.error("Usage: sage repo <repo-name>");
      process.exit(1);
    }
    runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.repo.inspect", JSON.stringify({ repo })]);
    break;
  }

  case "deploy": {
    const [template, target = "vercel"] = args;
    if (!template) {
      console.error("Usage: sage deploy <template> [target]");
      process.exit(1);
    }
    runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.deploy.prepare", JSON.stringify({ template, target })]);
    break;
  }

  case "jobs":
    runNpm("jobs:list");
    break;

  case "run": {
    const [job] = args;
    if (!job) {
      console.error("Usage: sage run <job-id>");
      process.exit(1);
    }
    runNpm("jobs:run", [job]);
    break;
  }

  case "enqueue": {
    const [job] = args;
    if (!job) {
      console.error("Usage: sage enqueue <job-id>");
      process.exit(1);
    }
    runNpm("jobs:enqueue", [job]);
    break;
  }

  case "tick":
    runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.worker.tick", "{}"]);
    break;

  case "daemon":
    runNpm("worker:daemon");
    break;

  case "approvals": {
    const [status] = args;
    runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.approvals.list", JSON.stringify({ status })]);
    break;
  }

  case "runs":
    runNpm("jobs:runs");
    break;

  case "dashboard":
    runNpm("dashboard:build");
    break;

  case "dashboard-live":
    runNpm("dashboard:serve");
    break;

  case "postgres-schema":
    runNpm("db:postgres:schema");
    break;

  case "dogfood-prod":
    runNpm("dogfood:prod", args);
    break;

  case "doctor":
    {
      const client = valueArg(args, "--client") || "all";
      const report = await createDoctorReport({ root, fast: args.includes("--fast"), client });
      console.log(formatDoctorReport(report, { json: args.includes("--json") }));
      process.exitCode = report.status === "passed" ? 0 : 1;
    }
    break;

  case "agents": {
    const [subcommand = "list"] = args.filter((arg) => !arg.startsWith("--"));
    const json = args.includes("--json");
    const home = valueArg(args, "--home") || process.env.SAGE_AGENT_HOME || null;
    try {
      if (subcommand === "list") {
        console.log(formatAgentsText(listAgentProfiles({ root }), { json }));
        break;
      }
      if (subcommand === "validate") {
        const report = validateAgentPack({ root });
        console.log(formatAgentsText(report, { json }));
        process.exitCode = report.status === "passed" ? 0 : 1;
        break;
      }
      if (subcommand === "install") {
        const result = installGlobalAgentPack({ root, home, force: args.includes("--force") });
        console.log(formatAgentsText(result, { json }));
        break;
      }
      if (subcommand === "doctor") {
        const report = createAgentsDoctorReport({ root, home });
        console.log(formatAgentsText(report, { json }));
        process.exitCode = report.status === "passed" ? 0 : 1;
        break;
      }
      console.error(`Unknown agents subcommand: ${subcommand}`);
      process.exitCode = 1;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "agent": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "roles", role = "reviewer", projectPath = "."] = positional;
    const json = args.includes("--json");
    try {
      const value = subcommand === "roles"
        ? listAgentRoles({ root })
        : subcommand === "validate"
          ? validateAgentRuntime({ root })
          : subcommand === "eval"
            ? evaluateAgentRuntime({ root })
            : subcommand === "run"
              ? runAgentTask({
                role,
                projectPath,
                objective: valueArg(args, "--objective") || undefined
              }, { root })
              : null;
      if (!value) {
        console.error(`Unknown agent subcommand: ${subcommand}`);
        process.exitCode = 1;
        break;
      }
      console.log(formatAgentRuntimeOutput(value, { json }));
      process.exitCode = value.status === "failed" ? 1 : 0;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "council": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "review", projectPath = "."] = positional;
    const json = args.includes("--json");
    try {
      if (subcommand !== "review") {
        console.error(`Unknown council subcommand: ${subcommand}`);
        process.exitCode = 1;
        break;
      }
      const roles = valueArg(args, "--roles")
        ?.split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const value = reviewWithCouncil({
        projectPath,
        roles,
        objective: valueArg(args, "--objective") || undefined
      }, { root });
      console.log(formatAgentRuntimeOutput(value, { json }));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "profile": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "detect", projectPath = "."] = positional;
    const json = args.includes("--json");
    try {
      const value = subcommand === "detect"
        ? detectProjectProfile({ root, projectPath })
        : subcommand === "validate"
          ? validateSdlcProfiles()
          : subcommand === "prove-paths"
            ? proveProfilePaths({ paths: positional.slice(1) }, { root })
          : null;
      if (!value) {
        console.error(`Unknown profile subcommand: ${subcommand}`);
        process.exitCode = 1;
        break;
      }
      console.log(formatProfileOutput(value, { json }));
      process.exitCode = value.status === "failed" ? 1 : 0;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "loop": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "plan", projectPath = "."] = positional;
    const json = args.includes("--json");
    try {
      const value = subcommand === "validate"
        ? validateClosedLoopWorkflows({ root })
        : subcommand === "prove"
          ? proveClosedLoopWorkflows({ root })
          : createClosedLoopWorkflow({
              projectPath,
              mode: subcommand,
              objective: valueArg(args, "--objective") || undefined,
              risk: valueArg(args, "--risk") || undefined
            }, { root });
      console.log(formatClosedLoopOutput(value, { json }));
      process.exitCode = value.status === "failed" ? 1 : 0;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "workflow": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "validate", workflowFile] = positional;
    const json = args.includes("--json");
    try {
      const definition = workflowFile ? JSON.parse(fs.readFileSync(path.resolve(process.cwd(), workflowFile), "utf8")) : createDefaultWorkflowDefinition();
      const value = subcommand === "validate"
        ? validateWorkflowDefinition(definition)
        : subcommand === "prove"
          ? createWorkflowEngineFixture({ root })
          : subcommand === "run"
            ? runWorkflow(definition, { root })
            : null;
      if (!value) {
        console.error(`Unknown workflow subcommand: ${subcommand}`);
        process.exitCode = 1;
        break;
      }
      console.log(formatWorkflowEngineOutput(value, { json }));
      process.exitCode = value.status === "failed" || value.status === "blocked" ? 1 : 0;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "done": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "generate", projectPath = "."] = positional;
    if (subcommand !== "generate") {
      console.error(`Unknown done subcommand: ${subcommand}`);
      process.exitCode = 1;
      break;
    }
    try {
      const value = generateDefinitionOfDone({
        projectPath,
        objective: valueArg(args, "--objective") || undefined,
        risk: valueArg(args, "--risk") || undefined,
        profile: valueArg(args, "--profile") || undefined
      }, { root });
      console.log(formatProfileOutput(value, { json: args.includes("--json") }));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "review": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "inspect", projectPath = "."] = positional;
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
      if (!value) {
        console.error(`Unknown review subcommand: ${subcommand}`);
        process.exitCode = 1;
        break;
      }
      console.log(formatReviewOutput(value, { json }));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "security": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "prove", projectPath = "."] = positional;
    const json = args.includes("--json");
    try {
      const value = subcommand === "threat-model"
        ? generateThreatModel({ root, projectPath })
        : subcommand === "supply-chain"
          ? createSupplyChainReport({ root, projectPath })
          : subcommand === "prove"
            ? createSecurityProof({ root, projectPath })
            : null;
      if (!value) {
        console.error(`Unknown security subcommand: ${subcommand}`);
        process.exitCode = 1;
        break;
      }
      console.log(formatSecurityOutput(value, { json }));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "testing": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "proof", projectPath = "."] = positional;
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
      if (!value) {
        console.error(`Unknown testing subcommand: ${subcommand}`);
        process.exitCode = 1;
        break;
      }
      console.log(formatTestingLabOutput(value, { json }));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "release-evidence": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [projectPath = "."] = positional;
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
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "memory": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "graph", projectPath = "."] = positional;
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
      if (!value) {
        console.error(`Unknown memory subcommand: ${subcommand}`);
        process.exitCode = 1;
        break;
      }
      console.log(formatKnowledgeOutput(value, { json }));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "score": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "report", projectPath = "."] = positional;
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
      if (!value) {
        console.error(`Unknown score subcommand: ${subcommand}`);
        process.exitCode = 1;
        break;
      }
      console.log(formatScoreOutput(value, { json }));
      process.exitCode = value.status === "failed" ? 1 : 0;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "self-heal": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "prove"] = positional;
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
      if (!value) {
        console.error(`Unknown self-heal subcommand: ${subcommand}`);
        process.exitCode = 1;
        break;
      }
      console.log(formatSelfHealingOutput(value, { json }));
      process.exitCode = value.status === "failed" ? 1 : 0;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "final-audit": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [projectPath = "."] = positional;
    const json = args.includes("--json");
    try {
      const value = await createFinalAuditReport({ root, projectPath });
      console.log(formatFinalAuditOutput(value, { json }));
      process.exitCode = value.status === "failed" ? 1 : 0;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    break;
  }

  case "drift": {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    const [subcommand = "prove"] = positional;
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
    if (!value) {
      console.error(`Unknown drift subcommand: ${subcommand}`);
      process.exitCode = 1;
      break;
    }
    console.log(formatDriftOutput(value, { json }));
    process.exitCode = value.status === "passed" ? 0 : 1;
    break;
  }

  case "db":
    runNpm("db:summary");
    break;

  case "mcp": {
    const [subcommand = "start", client = "all"] = args.filter((arg) => !arg.startsWith("--"));
    if (subcommand === "start" || subcommand === "server") {
      runNpm("mcp:server");
      break;
    }
    if (subcommand === "smoke") {
      runNpm("mcp:smoke");
      break;
    }
    if (subcommand === "config") {
      try {
        console.log(formatMcpClientConfig(client, { root, json: args.includes("--json") }));
      } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
      }
      break;
    }
    console.error(`Unknown mcp subcommand: ${subcommand}`);
    process.exitCode = 1;
    break;
  }

  case "daily":
    await printTool("kernel.workflow.daily_summary", {});
    break;

  case "audit":
    await printTool("kernel.workflow.audit_repo", { projectPath: args[0] || ".", mode: args[1] || "fast" });
    break;

  case "full-qa":
    await printTool("kernel.workflow.run_full_qa", { projectPath: args[0] || ".", mode: args[1] || "standard" });
    break;

  case "failures":
    await printTool("kernel.workflow.explain_failures", { report: jsonArg(args.join(" "), null) });
    break;

  case "create-app": {
    const [template, name, out] = args;
    if (!template || !name) {
      console.error("Usage: sage create-app <template> <name> [out]");
      process.exit(1);
    }
    await printTool("kernel.workflow.create_app", { template, name, out });
    break;
  }

  case "release":
    await printTool("kernel.workflow.release_readiness", { template: args[0] || "worker-service", target: args[1] || "docker" });
    break;

  case "pending":
    await printTool("kernel.workflow.pending_approvals", { status: args[0] || "pending" });
    break;

  case "stress":
    await printTool("kernel.workflow.stress_dashboard", { url: args[0] || "http://127.0.0.1:8787" });
    break;

  case "root":
    console.log(root);
    break;

  default:
    console.error(`Unknown command: ${command}`);
    help();
    process.exit(1);
}

function valueArg(values, name) {
  const arg = values.find((item) => item.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : null;
}
