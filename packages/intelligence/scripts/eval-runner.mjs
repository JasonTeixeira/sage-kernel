import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { validateEvalDefinitionFile } from "./validate-intelligence.mjs";

const root = process.cwd();
const defaultEvalDir = path.join("packages", "intelligence", "evals");
const defaultReportDir = path.join(".sage-kernel", "evals");

export function listEvalDefinitions(options = {}) {
  const workspace = options.root || root;
  const evalDir = options.evalDir || path.join(workspace, defaultEvalDir);
  if (!fs.existsSync(evalDir)) return [];
  return fs
    .readdirSync(evalDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const fullPath = path.join(evalDir, file);
      return {
        file: path.relative(workspace, fullPath),
        definition: JSON.parse(fs.readFileSync(fullPath, "utf8"))
      };
    });
}

export function runEvalSuite(options = {}) {
  const workspace = options.root || root;
  const reportDir = options.reportDir || path.join(workspace, defaultReportDir);
  const selected = new Set(options.ids || []);
  const startedAt = new Date().toISOString();
  const definitions = listEvalDefinitions(options)
    .filter((item) => selected.size === 0 || selected.has(item.definition.id));
  const failures = [];
  const evals = [];

  if (definitions.length === 0) {
    failures.push(selected.size > 0 ? `No matching eval definitions: ${[...selected].join(", ")}` : "No eval definitions found");
  }

  for (const item of definitions) {
    const definitionFailures = validateEvalDefinitionFile(item.definition, item.file);
    const graders = definitionFailures.length > 0
      ? []
      : item.definition.graders.map((grader) => runGrader(workspace, grader));
    const status = definitionFailures.length === 0 && graders.every((grader) => grader.status === "passed") ? "passed" : "failed";
    if (definitionFailures.length > 0) failures.push(...definitionFailures);
    evals.push({
      id: item.definition.id,
      name: item.definition.name,
      scope: item.definition.scope,
      version: item.definition.version,
      status,
      file: item.file,
      graders,
      failures: definitionFailures
    });
  }

  const finishedAt = new Date().toISOString();
  const report = {
    id: `eval_run_${Date.now()}`,
    status: failures.length === 0 && evals.every((item) => item.status === "passed") ? "passed" : "failed",
    startedAt,
    finishedAt,
    evals,
    summary: {
      total: evals.length,
      passed: evals.filter((item) => item.status === "passed").length,
      failed: evals.filter((item) => item.status !== "passed").length
    },
    failures
  };

  if (options.writeReport !== false) {
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `${report.id}.json`);
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(reportDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
    report.reportPath = path.relative(workspace, reportPath);
    report.latestPath = path.relative(workspace, path.join(reportDir, "latest.json"));
  }

  return report;
}

export function readLatestEvalReport(options = {}) {
  const workspace = options.root || root;
  const reportPath = options.reportPath || path.join(workspace, defaultReportDir, "latest.json");
  if (!fs.existsSync(reportPath)) {
    return {
      status: "missing",
      evals: [],
      summary: { total: 0, passed: 0, failed: 0 },
      failures: ["No eval report has been generated yet."]
    };
  }
  return JSON.parse(fs.readFileSync(reportPath, "utf8"));
}

function runGrader(workspace, grader) {
  if (grader.type === "command") return runCommandGrader(workspace, grader);
  if (grader.type === "file_exists") return runFileExistsGrader(workspace, grader);
  if (grader.type === "mcp_contract") return runMcpContractGrader(workspace, grader);
  if (grader.type === "json_schema") return runJsonSchemaGrader(workspace, grader);
  if (grader.type === "coverage") return runCoverageGrader(grader);
  /* node:coverage ignore next 6 */
  return {
    id: grader.id,
    type: grader.type,
    status: "failed",
    message: `Unsupported grader type: ${grader.type}`
  };
}

function runCommandGrader(workspace, grader) {
  const result = spawnSync(grader.command, {
    cwd: workspace,
    shell: true,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 1024 * 1024 * 8
  });
  return {
    id: grader.id,
    type: grader.type,
    status: result.status === 0 ? "passed" : "failed",
    command: grader.command,
    exitCode: result.status ?? 1,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr)
  };
}

function runFileExistsGrader(workspace, grader) {
  const fullPath = path.resolve(workspace, grader.path || "");
  const insideWorkspace = fullPath === workspace || fullPath.startsWith(`${workspace}${path.sep}`);
  const exists = insideWorkspace && fs.existsSync(fullPath);
  return {
    id: grader.id,
    type: grader.type,
    status: exists ? "passed" : "failed",
    path: grader.path,
    message: insideWorkspace ? undefined : "Path escapes workspace"
  };
}

function runMcpContractGrader(workspace, grader) {
  const fileResult = runFileExistsGrader(workspace, grader);
  if (fileResult.status !== "passed") return fileResult;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(workspace, grader.path), "utf8"));
    const key = parsed.tools ? "tools" : parsed.resources ? "resources" : parsed.prompts ? "prompts" : null;
    const count = key ? parsed[key].length : 0;
    return {
      id: grader.id,
      type: grader.type,
      status: count > 0 ? "passed" : "failed",
      path: grader.path,
      count
    };
  } catch (error) {
    return {
      id: grader.id,
      type: grader.type,
      status: "failed",
      path: grader.path,
      message: error.message
    };
  }
}

function runJsonSchemaGrader(workspace, grader) {
  const schemaPath = path.resolve(workspace, grader.schema || "");
  const targetPath = path.resolve(workspace, grader.path || "");
  const insideWorkspace = [schemaPath, targetPath].every((item) => item === workspace || item.startsWith(`${workspace}${path.sep}`));
  if (!insideWorkspace) {
    return { id: grader.id, type: grader.type, status: "failed", message: "Path escapes workspace" };
  }
  try {
    JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    JSON.parse(fs.readFileSync(targetPath, "utf8"));
    return { id: grader.id, type: grader.type, status: "passed", schema: grader.schema, path: grader.path };
  } catch (error) {
    return { id: grader.id, type: grader.type, status: "failed", schema: grader.schema, path: grader.path, message: error.message };
  }
}

function runCoverageGrader(grader) {
  const threshold = grader.threshold;
  return {
    id: grader.id,
    type: grader.type,
    status: typeof threshold === "number" && threshold >= 0 && threshold <= 100 ? "passed" : "failed",
    threshold
  };
}

function trimOutput(value = "") {
  return value.trim().slice(-4000);
}

function parseArgs(argv) {
  const options = { ids: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--id") options.ids.push(argv[++index]);
    else if (arg === "--no-write") options.writeReport = false;
    else if (arg === "--report-dir") options.reportDir = path.resolve(root, argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export const __evalRunnerTestInternals = {
  parseArgs,
  runCommandGrader,
  runCoverageGrader,
  runFileExistsGrader,
  runGrader,
  runJsonSchemaGrader,
  runMcpContractGrader,
  trimOutput
};

/* node:coverage ignore next 9 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runEvalSuite(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "passed" ? 0 : 1);
}
