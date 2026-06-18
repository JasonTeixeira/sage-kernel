import { fileURLToPath } from "node:url";

import { createDailyPlan } from "../runbooks.mjs";

export function runPlanDayCli(args = process.argv.slice(2), options = {}) {
  const input = parseArgs(args);
  const root = options.root || process.cwd();
  const createPlan = options.createPlan || createDailyPlan;
  const stdout = options.stdout || console.log;
  const plan = createPlan({ root, ...input });
  stdout(JSON.stringify(plan, null, 2));
  return 0;
}

function parseArgs(args) {
  const input = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--objective") input.objective = args[++index];
    else throw new Error(`Unknown plan:day argument: ${arg}`);
  }
  return input;
}

export const __planDayTestInternals = { parseArgs };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPlanDayCli();
}
