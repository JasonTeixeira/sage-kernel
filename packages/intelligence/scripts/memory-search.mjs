import { createMemoryStore } from "../memory-store.mjs";

const args = parseArgs(process.argv.slice(2));
const records = createMemoryStore().search(args);
console.log(JSON.stringify({ status: "passed", records }, null, 2));

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--query") args.query = argv[++index];
    else if (arg === "--kind") args.kind = argv[++index];
    else if (arg === "--source") args.source = argv[++index];
    else if (arg === "--project") args.projectId = argv[++index];
    else if (arg === "--limit") args.limit = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

