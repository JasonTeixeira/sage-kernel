import { loadJobs } from "./lib.mjs";

const jobs = loadJobs(process.cwd());

for (const job of jobs) {
  console.log(`${job.id} | ${job.kind} | ${job.risk} | approval=${job.approval} | ${job.description}`);
}
