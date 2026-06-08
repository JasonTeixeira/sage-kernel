import crypto from "node:crypto";
import { runSql, sqlJson, sqlString } from "../../../packages/db/scripts/db-lib.mjs";
import { findJob } from "./lib.mjs";

const root = process.cwd();
const [jobId, rawPayload = "{}"] = process.argv.slice(2);
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

runSql(root, `.read packages/db/schema.sql`);
const id = crypto.randomUUID();
const now = new Date().toISOString();
runSql(
  root,
  `INSERT INTO job_queue (id, job_id, payload_json, created_at) VALUES (${sqlString(id)}, ${sqlString(jobId)}, ${sqlJson(payload)}, ${sqlString(now)});`
);
console.log(JSON.stringify({ id, jobId, status: "queued" }, null, 2));
