import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { enqueueJobCli } from "../apps/worker/scripts/jobs-enqueue.mjs";
import { nextJobCli } from "../apps/worker/scripts/jobs-next.mjs";
import { catalogSourceRoot, repoHealth, runJob, runJobCli } from "../apps/worker/scripts/jobs-run.mjs";
import { createSqliteAdapter } from "../packages/db/adapter.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

function createWorkerFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-worker-"));
  fs.mkdirSync(path.join(root, "apps/worker"), { recursive: true });
  fs.mkdirSync(path.join(root, "catalog"), { recursive: true });
  fs.mkdirSync(path.join(root, "packages/db"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "packages/db/schema.sql"), path.join(root, "packages/db/schema.sql"));
  fs.writeFileSync(path.join(root, "apps/worker/approval-policy.json"), JSON.stringify({ default: "safe-local" }));
  fs.writeFileSync(path.join(root, "catalog/repos.json"), JSON.stringify({
    sourceRoot: "",
    repos: [{ name: "missing-app", role: "fixture", target: "test" }]
  }));
  fs.writeFileSync(path.join(root, "apps/worker/jobs.json"), JSON.stringify({
    jobs: [
      { id: "safe-npm", kind: "qa", risk: "low", timeoutMs: 1000, steps: [{ type: "npm-script", script: "test" }] },
      { id: "fail-npm", kind: "qa", risk: "low", timeoutMs: 1000, steps: [{ type: "npm-script", script: "fail" }] },
      { id: "health", kind: "audit", risk: "low", steps: [{ type: "builtin", name: "repo-health" }] },
      { id: "child-ok", kind: "qa", risk: "low", steps: [{ type: "npm-script", script: "test" }] },
      { id: "parent-ok", kind: "qa", risk: "low", steps: [{ type: "job", job: "child-ok" }] },
      { id: "child-block", kind: "deploy", risk: "high", approval: "required", steps: [] },
      { id: "parent-block", kind: "deploy", risk: "high", steps: [{ type: "job", job: "child-block" }] },
      { id: "blocked-step", kind: "deploy", risk: "high", steps: [{ type: "approval-required" }] },
      { id: "unknown-step", kind: "qa", risk: "low", steps: [{ type: "unknown" }] }
    ]
  }));
  return root;
}

test("worker runner covers pass, fail, nested, blocked, and unknown step branches", async () => {
  const root = createWorkerFixture();
  const commandRunner = (_root, command, args) => ({
    command,
    args,
    status: args.includes("fail") ? 1 : 0,
    signal: null,
    durationMs: 1,
    stdout: "",
    stderr: args.includes("fail") ? "failed" : "",
    error: null
  });

  const passed = await runJob("safe-npm", { root, commandRunner, persist: false });
  assert.equal(passed.status, "passed");
  assert.equal(passed.steps[0].status, "passed");

  const failed = await runJob("fail-npm", { root, commandRunner, persist: false });
  assert.equal(failed.status, "failed");
  assert.equal(failed.steps[0].status, "failed");

  const health = await runJob("health", { root, commandRunner, persist: false });
  assert.equal(health.status, "passed");
  assert.equal(health.steps[0].result.configured, false);

  const nested = await runJob("parent-ok", { root, commandRunner, persist: false });
  assert.equal(nested.status, "passed");
  assert.equal(nested.steps[0].nested.status, "passed");

  const blockedNested = await runJob("parent-block", { root, commandRunner, persist: false });
  assert.equal(blockedNested.status, "blocked");
  assert.equal(blockedNested.steps[0].status, "blocked");

  const blockedStep = await runJob("blocked-step", { root, commandRunner, persist: false });
  assert.equal(blockedStep.status, "blocked");

  const unknown = await runJob("unknown-step", { root, commandRunner, persist: false });
  assert.equal(unknown.status, "failed");
  assert.match(unknown.steps[0].error, /Unknown step type/);

  const persisted = await runJob("safe-npm", { root, commandRunner });
  assert.equal(persisted.status, "passed");
  assert.equal(fs.existsSync(path.join(root, ".sage-kernel", "runs", `${persisted.runId}.json`)), true);
  const db = createSqliteAdapter({ root });
  const row = db.query("SELECT id, status, signature FROM job_runs WHERE id=?", [persisted.runId])[0];
  assert.equal(row.status, "passed");
  assert.equal(typeof row.signature, "string");
});

test("worker CLI wrapper reports usage and successful run summaries", async () => {
  const root = createWorkerFixture();
  const usage = await runJobCli([], { root, persist: false });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /Usage/);

  const result = await runJobCli(["safe-npm"], {
    root,
    persist: false,
    commandRunner() {
      return { status: 0, stdout: "", stderr: "" };
    }
  });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.jobId, "safe-npm");
  assert.equal(parsed.status, "passed");

  const blocked = await runJobCli(["child-block"], { root, persist: false });
  assert.equal(blocked.status, 0);
  assert.equal(JSON.parse(blocked.stdout).status, "blocked");
});

test("repo health reports missing repositories only when source root is configured", () => {
  const root = createWorkerFixture();
  assert.equal(repoHealth(root).configured, false);
  assert.equal(repoHealth(root).missingCount, 0);

  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-source-"));
  fs.writeFileSync(path.join(root, "catalog/repos.json"), JSON.stringify({
    sourceRoot,
    repos: [{ name: "missing-app", role: "fixture", target: "test" }]
  }));
  const health = repoHealth(root);
  assert.equal(health.configured, true);
  assert.equal(health.missingCount, 1);

  const existingRepo = path.join(sourceRoot, "ready-app");
  fs.mkdirSync(existingRepo, { recursive: true });
  fs.writeFileSync(path.join(existingRepo, "package.json"), "{}\n");
  fs.writeFileSync(path.join(existingRepo, "pyproject.toml"), "[project]\nname = \"ready-app\"\n");
  fs.writeFileSync(path.join(existingRepo, "README.md"), "# Ready\n");
  fs.writeFileSync(path.join(root, "catalog/repos.json"), JSON.stringify({
    sourceRootEnv: "SAGE_WORKER_TEST_SOURCE",
    sourceRoot: "/fallback",
    repos: [{ name: "ready-app", role: "fixture", target: "test" }]
  }));
  process.env.SAGE_WORKER_TEST_SOURCE = sourceRoot;
  try {
    assert.equal(catalogSourceRoot({ sourceRootEnv: "SAGE_WORKER_TEST_SOURCE", sourceRoot: "/fallback" }), sourceRoot);
    const configured = repoHealth(root);
    assert.equal(configured.missingCount, 0);
    assert.equal(configured.checked[0].hasPackageJson, true);
    assert.equal(configured.checked[0].hasPyproject, true);
    assert.equal(configured.checked[0].hasReadme, true);
  } finally {
    delete process.env.SAGE_WORKER_TEST_SOURCE;
  }
});

test("worker enqueue CLI wrapper validates input and enqueues valid payloads", () => {
  const root = createWorkerFixture();
  const db = { initCalled: false, init() { this.initCalled = true; } };
  const enqueued = [];
  const queue = {
    enqueue(job) {
      enqueued.push(job);
      return { id: "queue_1", status: "queued", ...job };
    }
  };

  const usage = enqueueJobCli([], { root, db, queue });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /Usage/);

  const invalid = enqueueJobCli(["safe-npm", "not-json"], { root, db, queue });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Payload must be JSON/);

  const result = enqueueJobCli(["safe-npm", "{\"ok\":true}", "25"], { root, db, queue });
  assert.equal(result.status, 0);
  assert.equal(db.initCalled, true);
  assert.deepEqual(enqueued[0], { jobId: "safe-npm", payload: { ok: true }, delayMs: 25 });
  assert.equal(JSON.parse(result.stdout).status, "queued");

  const defaultDelay = enqueueJobCli(["safe-npm", "{\"ok\":true}", "not-number"], { root, db, queue });
  assert.equal(defaultDelay.status, 0);
  assert.equal(enqueued.at(-1).delayMs, 0);
  assert.throws(() => enqueueJobCli(["missing-job"], { root, db, queue }), /Unknown job/);
});

test("worker next CLI wrapper handles empty queue, completion, and failure", () => {
  const root = createWorkerFixture();
  const db = { init() {} };

  const empty = nextJobCli([], {
    root,
    db,
    queue: { claimNext() { return null; } }
  });
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /No queued jobs/);

  const completed = [];
  const success = nextJobCli(["--worker", "fixture-worker"], {
    root,
    db,
    queue: {
      claimNext() { return { id: "queue_1", jobId: "safe-npm" }; },
      complete(id) { completed.push(id); },
      fail() { throw new Error("should not fail successful jobs"); }
    },
    spawn() {
      return { status: 0, stdout: "{\"status\":\"passed\"}\n", stderr: "" };
    }
  });
  assert.equal(success.status, 0);
  assert.equal(success.workerId, "fixture-worker");
  assert.deepEqual(completed, ["queue_1"]);

  const failures = [];
  const failed = nextJobCli([], {
    root,
    db,
    env: { SAGE_WORKER_ID: "env-worker" },
    queue: {
      claimNext() { return { id: "queue_2", jobId: "fail-npm" }; },
      complete() { throw new Error("should not complete failed jobs"); },
      fail(id, details) { failures.push({ id, details }); }
    },
    spawn() {
      return { status: null, stdout: "", stderr: "" };
    }
  });
  assert.equal(failed.status, 1);
  assert.equal(failed.workerId, "env-worker");
  assert.equal(failures[0].id, "queue_2");
  assert.equal(failures[0].details.error, "job failed");
});
