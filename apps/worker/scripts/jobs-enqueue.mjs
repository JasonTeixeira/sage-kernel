import crypto from "node:crypto";
import { ensureKernelSchema, runSql, sqlJson, sqlString } from "../../../packages/db/scripts/db-lib.mjs";
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

ensureKernelSchema(root);
const id = crypto.randomUUID();
const now = new Date().toISOString();
const delayMs = Number(delayArg) || 0;
const nextRunAt = delayMs > 0 ? new Date(Date.now() + delayMs).toISOString() : null;
runSql(
  root,
  `INSERT INTO job_queue (id, job_id, payload_json, created_at, next_run_at) VALUES (${sqlString(id)}, ${sqlString(jobId)}, ${sqlJson(payload)}, ${sqlString(now)}, ${nextRunAt ? sqlString(nextRunAt) : "NULL"});`
);
console.log(JSON.stringify({ id, jobId, status: "queued", nextRunAt }, null, 2));
