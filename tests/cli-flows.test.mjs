import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function run(args, options = {}) {
  return spawnSync(args[0], args.slice(1), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
    ...options
  });
}

function parseJsonAfterNpm(output) {
  let parsed = null;
  let searchFrom = 0;
  while (searchFrom < output.length) {
    const start = output.indexOf("{", searchFrom);
    if (start === -1) break;
    const candidate = parseJsonAt(output, start);
    if (candidate) {
      parsed = candidate.value;
      searchFrom = candidate.end + 1;
    } else {
      searchFrom = start + 1;
    }
  }
  assert.notEqual(parsed, null, output);
  return parsed;
}

function parseJsonAt(output, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < output.length; index += 1) {
    const char = output[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') inString = !inString;
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      try {
        return { value: JSON.parse(output.slice(start, index + 1)), end: index };
      } catch {
        return null;
      }
    }
  }
  return null;
}

test("mcp:call approval CLI can request and approve a signed approval", () => {
  const request = run([
    "npm",
    "run",
    "mcp:call",
    "--",
    "kernel.approvals.request",
    JSON.stringify({ action: "kernel.jobs.run", reason: "cli test", payload: { job: "repo-health" } })
  ]);
  assert.equal(request.status, 0, request.stderr || request.stdout);
  const approval = parseJsonAfterNpm(request.stdout);
  assert.equal(approval.status, "pending");

  const approve = run([
    "npm",
    "run",
    "mcp:call",
    "--",
    "kernel.approvals.approve",
    JSON.stringify({ id: approval.id, decidedBy: "cli-test" })
  ]);
  assert.equal(approve.status, 0, approve.stderr || approve.stdout);
  const signed = parseJsonAfterNpm(approve.stdout);
  assert.equal(signed.status, "approved");
  assert.equal(typeof signed.signature, "string");
});

test("job queue CLI enqueues and worker tick drains a safe local job", () => {
  const enqueue = run(["npm", "run", "jobs:enqueue", "--", "repo-health", "{}", "0"]);
  assert.equal(enqueue.status, 0, enqueue.stderr || enqueue.stdout);
  const queued = parseJsonAfterNpm(enqueue.stdout);
  assert.equal(queued.status, "queued");

  const tick = run(["npm", "run", "jobs:next"]);
  assert.equal(tick.status, 0, tick.stderr || tick.stdout);
  const result = parseJsonAfterNpm(tick.stdout);
  assert.equal(result.jobId, "repo-health");
  assert.equal(result.status, "passed");
});
