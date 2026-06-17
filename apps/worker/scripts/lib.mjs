import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

export function writeJson(root, relativePath, value) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeRunId(jobId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = crypto.randomUUID();
  return `${stamp}-${jobId}-${suffix}`;
}

export function runCommand(root, command, args, timeoutMs) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 8
  });
  const finishedAt = Date.now();
  return {
    command,
    args,
    status: result.status,
    signal: result.signal,
    durationMs: finishedAt - startedAt,
    stdout: result.stdout?.trim() || "",
    stderr: result.stderr?.trim() || "",
    error: result.error?.message || null
  };
}

export function loadJobs(root) {
  return readJson(root, "apps/worker/jobs.json").jobs;
}

export function findJob(root, jobId) {
  const job = loadJobs(root).find((item) => item.id === jobId);
  if (!job) throw new Error(`Unknown job: ${jobId}`);
  return job;
}

export function runsDir(root) {
  return path.join(root, ".sage-kernel", "runs");
}
