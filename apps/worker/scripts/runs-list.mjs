import fs from "node:fs";
import path from "node:path";
import { runsDir } from "./lib.mjs";

const dir = runsDir(process.cwd());

if (!fs.existsSync(dir)) {
  console.log("No runs yet.");
  process.exit(0);
}

const files = fs
  .readdirSync(dir)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .reverse();

for (const file of files.slice(0, 50)) {
  const run = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  console.log(`${run.runId} | ${run.jobId} | ${run.status} | ${run.durationMs}ms | ${run.finishedAt}`);
}
