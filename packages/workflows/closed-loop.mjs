import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { detectProjectProfile, generateDefinitionOfDone } from "../profiles/project-detector.mjs";

const LOOP_MODES = new Set(["plan", "dry-run", "run"]);
const SAFE_COMMANDS = new Set([
  "npm run profiles:validate",
  "npm run profiles:prove",
  "npm run mcp:validate",
  "npm run mcp:contracts",
  "npm run qa:gate",
  "npm run release:check",
  "npm run security:scan",
  "npm audit",
  "git diff --check"
]);

export function createClosedLoopWorkflow(input = {}, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const mode = normalizeMode(input.mode);
  const projectPath = input.projectPath || ".";
  const objective = input.objective || "Complete the requested engineering task with evidence.";
  const risk = normalizeRisk(input.risk || "medium");
  const profile = detectProjectProfile({ root, projectPath });
  const done = generateDefinitionOfDone({ projectPath, objective, risk }, { root });
  const phases = buildLoopPhases({ profile, done, risk });
  const commands = [...new Set(phases.flatMap((phase) => phase.commands))];
  const evidence = done.evidenceRequired;
  const stopConditions = [
    ...done.stopConditions,
    "Any command exits non-zero in run mode.",
    "Evidence cannot be produced for a required check."
  ];
  const run = mode === "run" ? executeLoopCommands(root, commands, options.runner) : [];
  const failed = run.filter((item) => item.status !== 0);
  return {
    id: `closed_loop_${slug(profile.profile.id)}_${risk}`,
    status: failed.length === 0 ? "passed" : "failed",
    mode,
    objective,
    risk,
    project: profile.project,
    profile: profile.profile,
    secondaryProfiles: profile.secondaryProfiles,
    confidence: profile.confidence,
    phases,
    commands,
    evidence,
    stopConditions,
    rollback: done.rollback,
    run,
    nextActions: nextActions({ mode, failed, commands, evidence })
  };
}

export function validateClosedLoopWorkflows(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const sample = createClosedLoopWorkflow({ projectPath: ".", mode: "plan", risk: "high" }, { root });
  const failures = [];
  if (!sample.profile?.id) failures.push("closed loop missing profile");
  if (!Array.isArray(sample.phases) || sample.phases.length < 4) failures.push("closed loop must include at least four phases");
  if (!sample.commands.includes("git diff --check")) failures.push("closed loop missing diff proof command");
  if (!sample.stopConditions.some((item) => item.includes("non-zero"))) failures.push("closed loop missing command failure stop condition");
  return {
    status: failures.length === 0 ? "passed" : "failed",
    checked: { workflows: 1, phases: sample.phases.length },
    failures
  };
}

export function proveClosedLoopWorkflows(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const fixtureRoot = createWorkflowFixture();
  const plan = createClosedLoopWorkflow({ projectPath: fixtureRoot, mode: "plan", objective: "Ship a fixture API.", risk: "high" }, {
    root: path.dirname(fixtureRoot)
  });
  const dryRun = createClosedLoopWorkflow({ projectPath: fixtureRoot, mode: "dry-run", risk: "low" }, {
    root: path.dirname(fixtureRoot)
  });
  const run = createClosedLoopWorkflow({ projectPath: ".", mode: "run", risk: "low" }, {
    root,
    runner: (command) => ({ command, status: 0, stdout: "ok", stderr: "" })
  });
  const status = plan.profile.id === "backend-api" && dryRun.run.length === 0 && run.run.length > 0 && run.status === "passed"
    ? "passed"
    : "failed";
  return {
    status,
    fixtureRoot,
    plan: { status: plan.status, profile: plan.profile.id, phases: plan.phases.length },
    dryRun: { status: dryRun.status, mode: dryRun.mode, commands: dryRun.commands.length },
    run: { status: run.status, executed: run.run.length }
  };
}

export function formatClosedLoopOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  if (value.checked) {
    return `Closed-loop validation ${value.status}: ${value.checked.workflows} workflow, ${value.checked.phases} phases\n`;
  }
  if (value.fixtureRoot) {
    return `Closed-loop proof ${value.status}: plan=${value.plan.profile}, executed=${value.run.executed}\n`;
  }
  return `Closed Loop ${value.status}: ${value.profile.title} (${value.risk})\n${value.phases.map((phase) => `- ${phase.id}: ${phase.commands.join(", ")}`).join("\n")}\n`;
}

function buildLoopPhases({ profile, done, risk }) {
  return [
    {
      id: "inspect",
      title: "Inspect",
      goal: "Detect the project, surface constraints, and define the proof target before editing.",
      commands: ["npm run profiles:validate", "npm run profiles:prove"],
      evidence: ["profile detection report", "definition of done"]
    },
    {
      id: "implement",
      title: "Implement",
      goal: "Make the smallest coherent change that satisfies the objective and project profile.",
      commands: profile.profile.id === "mcp-server"
        ? ["npm run mcp:validate", "npm run mcp:contracts"]
        : profile.profile.id === "web-app"
          ? ["npm run qa:gate"]
          : ["npm run qa:gate"],
      evidence: ["scoped diff", "contract updates when interfaces change"]
    },
    {
      id: "verify",
      title: "Verify",
      goal: "Run automated checks that map to the detected SDLC profile.",
      commands: selectVerificationCommands(done.recommendedCommands),
      evidence: done.evidenceRequired
    },
    {
      id: "harden",
      title: "Harden",
      goal: "Check security, release readiness, and drift before claiming completion.",
      commands: risk === "high" || risk === "critical"
        ? ["npm run security:scan", "npm audit", "npm run release:check", "git diff --check"]
        : ["npm run security:scan", "git diff --check"],
      evidence: ["security scan", "diff check", "release proof for high-risk work"]
    },
    {
      id: "report",
      title: "Report",
      goal: "Record proof, residual gaps, and the next sprint boundary.",
      commands: [],
      evidence: ["final proof summary", "what remains list"]
    }
  ];
}

function selectVerificationCommands(commands) {
  const selected = commands.filter((command) => SAFE_COMMANDS.has(command));
  return selected.length > 0 ? selected : ["npm run qa:gate"];
}

function executeLoopCommands(root, commands, runner) {
  return commands.map((command) => {
    if (!SAFE_COMMANDS.has(command)) {
      return { command, status: 125, stdout: "", stderr: "Command is not allowlisted for closed-loop execution." };
    }
    const run = runner || runShell;
    return run(command, { root });
  });
}

function runShell(command, { root }) {
  const result = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", timeout: 180000, maxBuffer: 1024 * 1024 * 8 });
  return {
    command,
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim().slice(0, 4000),
    stderr: (result.stderr || "").trim().slice(0, 4000)
  };
}

function nextActions({ mode, failed, commands, evidence }) {
  if (failed.length > 0) return failed.map((item) => `Fix failing command: ${item.command}`);
  if (mode !== "run") return [
    "Review the planned phases.",
    "Run with --mode=run only when the command list matches the intended scope.",
    `Collect evidence: ${evidence.join(", ")}.`
  ];
  return [
    "Attach command output to the sprint proof.",
    "Update what remains before starting the next sprint.",
    `Executed ${commands.length} allowlisted commands successfully.`
  ];
}

function createWorkflowFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-closed-loop-fixture-"));
  fs.writeFileSync(path.join(dir, "pyproject.toml"), "[project]\ndependencies = ['fastapi']\n");
  fs.mkdirSync(path.join(dir, "app"), { recursive: true });
  fs.writeFileSync(path.join(dir, "app/main.py"), "from fastapi import FastAPI\napp = FastAPI()\n");
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(dir, "tests/test_app.py"), "def test_ok(): assert True\n");
  return dir;
}

function normalizeMode(mode) {
  return LOOP_MODES.has(mode) ? mode : "plan";
}

function normalizeRisk(risk) {
  return ["low", "medium", "high", "critical"].includes(risk) ? risk : "medium";
}

function slug(value) {
  return String(value || "workflow").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

export const __closedLoopTestInternals = {
  executeLoopCommands,
  runShell,
  selectVerificationCommands
};
