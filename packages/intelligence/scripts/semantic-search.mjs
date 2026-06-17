import { createSemanticCode } from "../semantic-code.mjs";

const input = parseArgs(process.argv.slice(2));
const semantic = createSemanticCode({ root: process.cwd() });
console.log(JSON.stringify(semantic.searchSymbol(input), null, 2));

function parseArgs(args) {
  const input = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--query") input.query = args[++index];
    else if (arg === "--project-path") input.projectPath = args[++index];
    else if (arg === "--limit") input.limit = Number(args[++index]);
    else throw new Error(`Unknown semantic:search argument: ${arg}`);
  }
  return input;
}
