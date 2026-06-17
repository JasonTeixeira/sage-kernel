import { createDailyPlan } from "../runbooks.mjs";

const input = parseArgs(process.argv.slice(2));
console.log(JSON.stringify(createDailyPlan({ root: process.cwd(), ...input }), null, 2));

function parseArgs(args) {
  const input = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--objective") input.objective = args[++index];
    else throw new Error(`Unknown plan:day argument: ${arg}`);
  }
  return input;
}
