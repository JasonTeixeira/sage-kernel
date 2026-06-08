import fs from "node:fs";
import path from "node:path";
import { readJson } from "./lib.mjs";

const root = process.cwd();
const registryPath = path.join(root, "apps/worker/jobs.json");
const schedulesPath = path.join(root, "apps/worker/schedules.json");
const approvalPath = path.join(root, "apps/worker/approval-policy.json");

for (const file of [registryPath, schedulesPath, approvalPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}

const { jobs } = readJson(root, "apps/worker/jobs.json");
const { schedules } = readJson(root, "apps/worker/schedules.json");
const seen = new Set();
const jobIds = new Set();

for (const job of jobs) {
  if (!job.id) throw new Error("Job missing id");
  if (seen.has(job.id)) throw new Error(`Duplicate job id: ${job.id}`);
  seen.add(job.id);
  jobIds.add(job.id);
  if (!job.description || !job.kind || !job.risk || !job.approval) {
    throw new Error(`Job ${job.id} missing description/kind/risk/approval`);
  }
  if (!Number.isInteger(job.timeoutMs) || job.timeoutMs <= 0) {
    throw new Error(`Job ${job.id} has invalid timeoutMs`);
  }
  if (!Number.isInteger(job.retries) || job.retries < 0 || job.retries > 3) {
    throw new Error(`Job ${job.id} has invalid retries`);
  }
  if (!Array.isArray(job.steps) || job.steps.length === 0) {
    throw new Error(`Job ${job.id} needs at least one step`);
  }
}

for (const job of jobs) {
  for (const step of job.steps) {
    if (step.type === "job" && !jobIds.has(step.job)) {
      throw new Error(`Job ${job.id} references unknown nested job: ${step.job}`);
    }
  }
}

for (const schedule of schedules) {
  if (!jobIds.has(schedule.job)) {
    throw new Error(`Schedule ${schedule.id} references unknown job: ${schedule.job}`);
  }
}

console.log("Job registry validation passed.");
console.log(`Jobs: ${jobs.length}`);
console.log(`Schedules: ${schedules.length}`);
