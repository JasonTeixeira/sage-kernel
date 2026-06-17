import { executeRunbookStep } from "../runbooks.mjs";

const input = parseArgs(process.argv.slice(2));
const result = executeRunbookStep(input, { root: process.cwd() });
console.log(JSON.stringify(result, null, 2));
process.exit(["planned", "passed"].includes(result.status) ? 0 : 1);

function parseArgs(argv) {
  const input = { dryRun: true };
  for (const arg of argv) {
    if (arg.startsWith("--runbook=")) input.runbook = arg.split("=")[1];
    else if (arg.startsWith("--step=")) input.step = arg.split("=")[1];
    else if (arg === "--execute") input.dryRun = false;
    else if (arg.startsWith("--timeout-ms=")) input.timeoutMs = Number(arg.split("=")[1]);
    else throw new Error(`Unknown runbooks:execute argument: ${arg}`);
  }
  return input;
}
