import { createSemanticCode } from "../semantic-code.mjs";

const input = parseArgs(process.argv.slice(2));
const semantic = createSemanticCode({ root: process.cwd() });
console.log(JSON.stringify(semantic.summarizeModule(input), null, 2));

function parseArgs(args) {
  const input = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--file") input.file = args[++index];
    else throw new Error(`Unknown semantic:summary argument: ${arg}`);
  }
  return input;
}
