import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createSqliteAdapter } from "../packages/db/adapter.mjs";
import { createJobQueue } from "../packages/jobs/queue.mjs";

const schemaRoot = path.resolve(import.meta.dirname, "..");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-jobs-"));
  const db = createSqliteAdapter({ root, schemaRoot });
  db.init();
  return { root, db, queue: createJobQueue({ db, workerId: "test-worker" }) };
}

test("job queue enqueues and claims the highest-priority ready job", () => {
  const { queue } = setup();
  queue.enqueue({ jobId: "slow", priority: 50 });
  queue.enqueue({ jobId: "fast", priority: 1 });

  const claimed = queue.claimNext();
  assert.equal(claimed.jobId, "fast");
  assert.equal(claimed.status, "running");
  assert.equal(claimed.lockedBy, "test-worker");
});

test("job queue respects delayed jobs", () => {
  const { queue } = setup();
  queue.enqueue({ jobId: "later", delayMs: 60_000 });
  assert.equal(queue.claimNext(), null);
});

test("job queue retries with backoff before dead-lettering", () => {
  const { queue } = setup();
  const job = queue.enqueue({ jobId: "flaky", maxAttempts: 2 });
  const first = queue.claimNext();
  queue.fail(first.id, { error: "first failure", backoffMs: 1 });

  const retry = queue.claimNext({ now: new Date(Date.now() + 10).toISOString() });
  assert.equal(retry.jobId, "flaky");
  queue.fail(retry.id, { error: "second failure" });

  const row = queue.get(job.id);
  assert.equal(row.status, "dead-lettered");
  assert.equal(row.attempts, 2);
});

test("job queue completes claimed jobs and clears locks", () => {
  const { queue } = setup();
  queue.enqueue({ jobId: "repo-health" });
  const claimed = queue.claimNext();
  queue.complete(claimed.id);
  const row = queue.get(claimed.id);
  assert.equal(row.status, "finished");
  assert.equal(row.lockedBy, null);
});
