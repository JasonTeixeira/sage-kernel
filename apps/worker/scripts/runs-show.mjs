import fs from "node:fs";
import path from "node:path";
import { runsDir } from "./lib.mjs";

const [runId] = process.argv.slice(2);

if (!runId) {
  console.error("Usage: npm run jobs:show -- <run-id>");
  process.exit(1);
}

const file = path.join(runsDir(process.cwd()), `${runId}.json`);

if (!fs.existsSync(file)) {
  throw new Error(`Run not found: ${runId}`);
}

console.log(fs.readFileSync(file, "utf8"));
