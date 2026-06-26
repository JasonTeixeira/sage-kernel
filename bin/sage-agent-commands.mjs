/* node:coverage disable */
import fs from "node:fs";
import path from "node:path";
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
import {
  detectProjectProfile,
  formatProfileOutput,
  generateDefinitionOfDone,
  proveProfilePaths,
  validateSdlcProfiles
} from "../packages/profiles/project-detector.mjs";
import { recordProfileOverride, profileLearningStats } from "../packages/profiles/profile-learning.mjs";
import {
  createClosedLoopWorkflow,
  formatClosedLoopOutput,
  proveClosedLoopWorkflows,
  validateClosedLoopWorkflows
} from "../packages/workflows/closed-loop.mjs";
import {
  createDefaultWorkflowDefinition,
  formatWorkflowEngineOutput,
  runWorkflow,
  validateWorkflowDefinition
} from "../packages/workflows/engine.mjs";
import { createWorkflowEngineFixture } from "../packages/workflows/test-fixtures/workflow-engine-proof.mjs";
import { positionalArgs, root, valueArg } from "./sage-runtime.mjs";

export async function handleAgentCommand(command, args) {
  switch (command) {
    case "doctor":
      await printDoctor(args);
      return true;
    case "agents":
      printAgents(args);
      return true;
    case "agent":
      printAgentRuntime(args);
      return true;
    case "council":
      printCouncilReview(args);
      return true;
    case "profile":
      printProfile(args);
      return true;
    case "loop":
      printLoop(args);
      return true;
    case "workflow":
      printWorkflow(args);
      return true;
    case "done":
      printDone(args);
      return true;
    default:
      return false;
  }
}

async function printDoctor(args) {
  const client = valueArg(args, "--client") || "all";
  const report = await createDoctorReport({ root, fast: args.includes("--fast"), client });
  console.log(formatDoctorReport(report, { json: args.includes("--json") }));
  process.exitCode = report.status === "passed" ? 0 : 1;
}

function printAgents(args) {
  const [subcommand = "list"] = positionalArgs(args);
  const json = args.includes("--json");
  const home = valueArg(args, "--home") || process.env.SAGE_AGENT_HOME || null;
  try {
    if (subcommand === "list") return console.log(formatAgentsText(listAgentProfiles({ root }), { json }));
    if (subcommand === "validate") return printReport(validateAgentPack({ root }), formatAgentsText, json);
    if (subcommand === "install") return console.log(formatAgentsText(installGlobalAgentPack({ root, home, force: args.includes("--force") }), { json }));
    if (subcommand === "doctor") return printReport(createAgentsDoctorReport({ root, home }), formatAgentsText, json);
    failUnknown("agents", subcommand);
  } catch (error) {
    fail(error);
  }
}

function printAgentRuntime(args) {
  const [subcommand = "roles", role = "reviewer", projectPath = "."] = positionalArgs(args);
  const json = args.includes("--json");
  try {
    const value = subcommand === "roles"
      ? listAgentRoles({ root })
      : subcommand === "validate"
        ? validateAgentRuntime({ root })
        : subcommand === "eval"
          ? evaluateAgentRuntime({ root })
          : subcommand === "run"
            ? runAgentTask({ role, projectPath, objective: valueArg(args, "--objective") || undefined }, { root })
            : null;
    if (!value) return failUnknown("agent", subcommand);
    console.log(formatAgentRuntimeOutput(value, { json }));
    process.exitCode = value.status === "failed" ? 1 : 0;
  } catch (error) {
    fail(error);
  }
}

function printCouncilReview(args) {
  const [subcommand = "review", projectPath = "."] = positionalArgs(args);
  const json = args.includes("--json");
  try {
    if (subcommand !== "review") return failUnknown("council", subcommand);
    const roles = valueArg(args, "--roles")?.split(",").map((item) => item.trim()).filter(Boolean);
    const value = reviewWithCouncil({ projectPath, roles, objective: valueArg(args, "--objective") || undefined }, { root });
    console.log(formatAgentRuntimeOutput(value, { json }));
  } catch (error) {
    fail(error);
  }
}

function printProfile(args) {
  const positional = positionalArgs(args);
  const [subcommand = "detect", projectPath = "."] = positional;
  const json = args.includes("--json");
  try {
    if (subcommand === "learn") {
      // Learning is keyed to the target project (where the operator runs sage),
      // not the kernel install root.
      const learnRoot = process.cwd();
      const profile = valueArg(args, "--profile");
      if (!profile) {
        console.error('Usage: sage profile learn --profile=<id> [--reason="..."]');
        process.exitCode = 1;
        return;
      }
      const override = recordProfileOverride({ root: learnRoot, profile, reason: valueArg(args, "--reason") });
      console.log(JSON.stringify({ override, stats: profileLearningStats({ root: learnRoot }) }, null, 2));
      return;
    }
    if (subcommand === "stats") {
      console.log(JSON.stringify(profileLearningStats({ root: process.cwd() }), null, 2));
      return;
    }
    const value = subcommand === "detect"
      ? detectProjectProfile({ root, projectPath })
      : subcommand === "validate"
        ? validateSdlcProfiles()
        : subcommand === "prove-paths"
          ? proveProfilePaths({ paths: positional.slice(1) }, { root })
          : null;
    if (!value) return failUnknown("profile", subcommand);
    console.log(formatProfileOutput(value, { json }));
    process.exitCode = value.status === "failed" ? 1 : 0;
  } catch (error) {
    fail(error);
  }
}

function printLoop(args) {
  const [subcommand = "plan", projectPath = "."] = positionalArgs(args);
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
    fail(error);
  }
}

function printWorkflow(args) {
  const [subcommand = "validate", workflowFile] = positionalArgs(args);
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
    if (!value) return failUnknown("workflow", subcommand);
    console.log(formatWorkflowEngineOutput(value, { json }));
    process.exitCode = value.status === "failed" || value.status === "blocked" ? 1 : 0;
  } catch (error) {
    fail(error);
  }
}

function printDone(args) {
  const [subcommand = "generate", projectPath = "."] = positionalArgs(args);
  if (subcommand !== "generate") return failUnknown("done", subcommand);
  try {
    const value = generateDefinitionOfDone({
      projectPath,
      objective: valueArg(args, "--objective") || undefined,
      risk: valueArg(args, "--risk") || undefined,
      profile: valueArg(args, "--profile") || undefined
    }, { root });
    console.log(formatProfileOutput(value, { json: args.includes("--json") }));
  } catch (error) {
    fail(error);
  }
}

function printReport(report, formatter, json) {
  console.log(formatter(report, { json }));
  process.exitCode = report.status === "passed" ? 0 : 1;
}

function failUnknown(scope, subcommand) {
  console.error(`Unknown ${scope} subcommand: ${subcommand}`);
  process.exitCode = 1;
}

function fail(error) {
  console.error(error.message);
  process.exitCode = 1;
}
