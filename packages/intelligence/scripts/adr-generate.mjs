import { createAdr } from "../runbooks.mjs";

const input = parseArgs(process.argv.slice(2));
console.log(JSON.stringify(createAdr(input, { root: process.cwd() }), null, 2));

function parseArgs(args) {
  const input = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--title") input.title = args[++index];
    else if (arg === "--status") input.status = args[++index];
    else if (arg === "--context") input.context = args[++index];
    else if (arg === "--decision") input.decision = args[++index];
    else if (arg === "--consequences") input.consequences = args[++index];
    else if (arg === "--out") input.out = args[++index];
    else throw new Error(`Unknown adr:generate argument: ${arg}`);
  }
  return input;
}
