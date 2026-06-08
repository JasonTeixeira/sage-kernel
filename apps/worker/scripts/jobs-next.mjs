import { spawnSync } from "node:child_process";
import { runSql, sqlString } from "../../../packages/db/scripts/db-lib.mjs";

const root = process.cwd();
runSql(root, `.read packages/db/schema.sql`);

const row = runSql(
  root,
  "SELECT id || '|' || job_id FROM job_queue WHERE status='queued' ORDER BY priority ASC, created_at ASC LIMIT 1;"
);

if (!row) {
  console.log("No queued jobs.");
  process.exit(0);
}

const [queueId, jobId] = row.split("|");
const now = new Date().toISOString();
runSql(root, `UPDATE job_queue SET status='running', started_at=${sqlString(now)}, attempts=attempts+1 WHERE id=${sqlString(queueId)};`);

const result = spawnSync("node", ["apps/worker/scripts/jobs-run.mjs", jobId], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 1024 * 1024 * 8
});

const status = result.status === 0 ? "finished" : "failed";
runSql(root, `UPDATE job_queue SET status=${sqlString(status)}, finished_at=${sqlString(new Date().toISOString())} WHERE id=${sqlString(queueId)};`);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
