import { createSqliteAdapter } from "../../../packages/db/adapter.mjs";
import { createJobQueue } from "../../../packages/jobs/queue.mjs";
import { findJob } from "./lib.mjs";

const root = process.cwd();
const [jobId, rawPayload = "{}", delayArg = "0"] = process.argv.slice(2);
if (!jobId) {
  console.error("Usage: npm run jobs:enqueue -- <job-id> ['{}']");
  process.exit(1);
}

findJob(root, jobId);
let payload;
try {
  payload = JSON.parse(rawPayload);
} catch {
  throw new Error("Payload must be JSON");
}

const delayMs = Number(delayArg) || 0;
const db = createSqliteAdapter({ root });
db.init();
const queue = createJobQueue({ db });
const queued = queue.enqueue({ jobId, payload, delayMs });
console.log(JSON.stringify(queued, null, 2));
