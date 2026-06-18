/* node:coverage disable */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callToolCli } from "../apps/mcp-server/scripts/call-tool.mjs";

const currentFile = fileURLToPath(import.meta.url);
export const root = path.resolve(path.dirname(currentFile), "..");

export function runNode(script, scriptArgs = []) {
  const result = spawnSync("node", [script, ...scriptArgs], {
    cwd: root,
    stdio: "inherit"
  });
  process.exitCode = result.status ?? 1;
}

export function runNpm(script, scriptArgs = []) {
  const result = spawnSync("npm", ["run", script, "--", ...scriptArgs], {
    cwd: root,
    stdio: "inherit"
  });
  process.exitCode = result.status ?? 1;
}

export async function printTool(tool, input = {}) {
  const result = await callToolCli([tool, JSON.stringify(input)], { root });
  if (result.stderr) console.error(result.stderr);
  if (result.stdout) console.log(result.stdout);
  process.exitCode = result.status;
}

export function jsonArg(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Input must be JSON: ${error.message}`);
    process.exit(1);
  }
}

export function valueArg(values, name) {
  const arg = values.find((item) => item.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : null;
}

export function positionalArgs(args) {
  return args.filter((arg) => !arg.startsWith("--"));
}

export function help() {
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
