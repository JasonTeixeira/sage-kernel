import { spawnSync } from "node:child_process";
import { createSqliteAdapter } from "../../../packages/db/adapter.mjs";
import { createJobQueue } from "../../../packages/jobs/queue.mjs";

const root = process.cwd();
const workerArg = process.argv.includes("--worker") ? process.argv[process.argv.indexOf("--worker") + 1] : null;
const workerId = workerArg || process.env.SAGE_WORKER_ID || `worker-${process.pid}`;
const db = createSqliteAdapter({ root });
db.init();
const queue = createJobQueue({ db, workerId });
const claimed = queue.claimNext();

if (!claimed) {
  console.log("No queued jobs.");
  process.exit(0);
}

const result = spawnSync("node", ["apps/worker/scripts/jobs-run.mjs", claimed.jobId], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 1024 * 1024 * 8
});

if (result.status === 0) {
  queue.complete(claimed.id);
} else {
  queue.fail(claimed.id, { error: result.stderr || result.stdout || "job failed", backoffMs: 1000 });
}

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
