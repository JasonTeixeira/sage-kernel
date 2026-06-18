import { createSqliteAdapter } from "../../../packages/db/adapter.mjs";
import { createJobQueue } from "../../../packages/jobs/queue.mjs";
import { findJob } from "./lib.mjs";
import { fileURLToPath } from "node:url";

export function enqueueJobCli(args = process.argv.slice(2), options = {}) {
  const root = options.root || process.cwd();
  const [jobId, rawPayload = "{}", delayArg = "0"] = args;
  if (!jobId) {
    return { status: 1, stderr: "Usage: npm run jobs:enqueue -- <job-id> ['{}']" };
  }

  findJob(root, jobId);
  let payload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return { status: 1, stderr: "Payload must be JSON" };
  }

  const delayMs = Number(delayArg) || 0;
  const db = options.db || createSqliteAdapter({ root });
  db.init();
  const queue = options.queue || createJobQueue({ db });
  const queued = queue.enqueue({ jobId, payload, delayMs });
  return { status: 0, stdout: JSON.stringify(queued, null, 2) };
}

/* node:coverage ignore next 6 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = enqueueJobCli();
  if (result.stderr) console.error(result.stderr);
  if (result.stdout) console.log(result.stdout);
  process.exit(result.status);
}
