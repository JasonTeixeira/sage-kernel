import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createMemoryRecord, createMemoryStore } from "../packages/intelligence/memory-store.mjs";
import { createProjectState } from "../packages/intelligence/project-state.mjs";
import { createSqliteAdapter } from "../packages/db/adapter.mjs";
import { createApprovalLedger } from "../packages/security/approvals.mjs";
import { runMemorySmoke, runMemorySmokeCli } from "../packages/intelligence/scripts/memory-smoke.mjs";

const root = path.resolve(import.meta.dirname, "..");

function tempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-memory-state-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "memory-state", version: "1.0.0" }));
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["add", "package.json"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["-c", "user.email=sage@example.com", "-c", "user.name=Sage Kernel", "commit", "-m", "initial"], { cwd: dir, encoding: "utf8" });
  return dir;
}

test("memory store writes, validates, searches, audits, and preserves provenance", () => {
  const workspace = tempRoot();
  const store = createMemoryStore({ root: workspace, schemaRoot: root, now: () => "2026-06-17T00:00:00.000Z" });
  const record = store.write({
    id: "mem_test_fact",
    projectId: "memory-state",
    kind: "fact",
    source: "test",
    actor: "node-test",
    confidence: 0.98,
    observedAt: "2026-06-17T00:00:00.000Z",
    content: {
      summary: "Memory store persisted a fact.",
      tags: ["memory", "test"]
    },
    provenance: {
      evidenceType: "command",
      evidenceRef: "node --test tests/memory-project-state.test.mjs"
    }
  });

  assert.equal(record.id, "mem_test_fact");
  assert.equal(store.search({ query: "persisted" }).length, 1);
  assert.equal(store.search({ kind: "decision" }).length, 0);
  assert.equal(store.search({ projectId: "memory-state", source: "test" }).length, 1);
  const audit = store.audit();
  assert.equal(audit.total, 1);
  assert.deepEqual(audit.kinds, [{ kind: "fact", count: 1 }]);
  assert.deepEqual(audit.sources, [{ source: "test", count: 1 }]);
  assert.equal(audit.latest[0].provenance.evidenceType, "command");
});

test("memory store rejects invalid records and can normalize minimal input", () => {
  const workspace = tempRoot();
  const store = createMemoryStore({ root: workspace, schemaRoot: root });
  assert.throws(() => store.write({ id: "bad", summary: "" }), /Invalid memory record/);

  const normalized = createMemoryRecord({
    summary: "Normalized memory",
    tags: ["normalized"],
    evidenceRef: "test"
  }, { now: () => "2026-06-17T00:00:00.000Z" });
  assert.match(normalized.id, /^mem_/);
  assert.equal(normalized.content.summary, "Normalized memory");
  assert.equal(normalized.provenance.evidenceRef, "test");
});

test("memory store clamps search limits and tolerates malformed persisted JSON", () => {
  const workspace = tempRoot();
  const db = createSqliteAdapter({ root: workspace, schemaRoot: root });
  const store = createMemoryStore({ root: workspace, schemaRoot: root, db });
  store.write({
    id: "mem_bad_json",
    projectId: "memory-state",
    kind: "fact",
    source: "test",
    actor: "node-test",
    confidence: 0.9,
    observedAt: "2026-06-17T00:00:00.000Z",
    content: { summary: "Record with malformed JSON after direct DB mutation." },
    provenance: { evidenceType: "manual", evidenceRef: "test" }
  });
  db.execute(
    "UPDATE memory_records SET supersedes_json = ?, content_json = ?, provenance_json = ? WHERE id = ?",
    ["not-json", "not-json", "not-json", "mem_bad_json"]
  );

  const records = store.search({ query: "mem_bad_json", limit: 0 });
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].supersedes, []);
  assert.deepEqual(records[0].content, {});
  assert.deepEqual(records[0].provenance, {});
});

test("memory store covers default filters and rich normalized record fields", () => {
  const workspace = tempRoot();
  const store = createMemoryStore({ root: workspace, schemaRoot: root, now: () => "2026-06-17T00:00:00.000Z" });
  const record = store.write({
    summary: "Rich normalized memory",
    details: { phase: "program-3" },
    tags: ["rich", "default"],
    hash: "abc123"
  });

  assert.equal(record.projectId, "sage-kernel");
  assert.equal(record.kind, "episode");
  assert.equal(record.source, "user");
  assert.equal(record.actor, "local-user");
  assert.equal(record.confidence, 1);
  assert.equal(record.provenance.hash, "abc123");
  assert.equal(store.search({ limit: 500 }).length, 1);
  assert.equal(store.search({ source: "system" }).length, 0);
  assert.equal(store.search({ projectId: "other-project" }).length, 0);
  assert.equal(store.search({ query: "not-present" }).length, 0);
});

test("project state summarizes git, evals, dashboard, memory, and next actions", () => {
  const workspace = tempRoot();
  const store = createMemoryStore({ root: workspace, schemaRoot: root });
  store.write({
    id: "mem_project_state",
    projectId: "memory-state",
    kind: "episode",
    source: "test",
    actor: "node-test",
    confidence: 1,
    observedAt: "2026-06-17T00:00:00.000Z",
    content: { summary: "Project state has memory." },
    provenance: { evidenceType: "manual", evidenceRef: "test" }
  });
  fs.mkdirSync(path.join(workspace, ".sage-kernel/evals"), { recursive: true });
  fs.writeFileSync(path.join(workspace, ".sage-kernel/evals/latest.json"), JSON.stringify({
    status: "passed",
    summary: { total: 1, passed: 1, failed: 0 },
    evals: [],
    failures: []
  }));

  const state = createProjectState({ root: workspace, schemaRoot: root });
  assert.equal(state.project.name, "memory-state");
  assert.equal(state.evals.status, "passed");
  assert.equal(state.memory.total, 1);
  assert.equal(state.git.available, true);
  assert.equal(Array.isArray(state.checks), true);
  assert.equal(state.nextActions.length > 0, true);
});

test("project state reports dirty git and ready state when evidence is clean", () => {
  const workspace = tempRoot();
  fs.writeFileSync(path.join(workspace, ".gitignore"), ".sage-kernel/\n");
  spawnSync("git", ["add", ".gitignore"], { cwd: workspace, encoding: "utf8" });
  spawnSync("git", ["-c", "user.email=sage@example.com", "-c", "user.name=Sage Kernel", "commit", "-m", "ignore kernel state"], { cwd: workspace, encoding: "utf8" });
  fs.mkdirSync(path.join(workspace, ".sage-kernel/evals"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "catalog"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "apps/mcp-server"), { recursive: true });
  fs.writeFileSync(path.join(workspace, ".sage-kernel/evals/latest.json"), JSON.stringify({
    status: "passed",
    summary: { total: 1, passed: 1, failed: 0 }
  }));
  fs.writeFileSync(path.join(workspace, "catalog/phases.json"), JSON.stringify({
    phases: [{ id: 1, name: "Ready", status: "complete" }]
  }));
  fs.writeFileSync(path.join(workspace, "catalog/templates.json"), JSON.stringify({
    templates: [{ id: "worker", qaProfile: "default", coverage: ["test"], defaultStack: ["node"] }]
  }));
  fs.writeFileSync(path.join(workspace, "apps/mcp-server/tools.json"), JSON.stringify({
    tools: [{ name: "kernel.test" }]
  }));
  spawnSync("git", ["add", "catalog/phases.json", "catalog/templates.json", "apps/mcp-server/tools.json"], { cwd: workspace, encoding: "utf8" });
  spawnSync("git", ["-c", "user.email=sage@example.com", "-c", "user.name=Sage Kernel", "commit", "-m", "add dashboard catalog"], { cwd: workspace, encoding: "utf8" });

  let state = createProjectState({ root: workspace, schemaRoot: root });
  assert.equal(state.git.clean, true);
  assert.equal(state.status, "ready");
  assert.deepEqual(state.nextActions, ["Continue with the next implementation program."]);

  fs.writeFileSync(path.join(workspace, "dirty.txt"), "dirty\n");
  state = createProjectState({ root: workspace, schemaRoot: root });
  assert.equal(state.git.clean, false);
  assert.equal(state.status, "needs_attention");
  assert.equal(state.git.changed.some((item) => item.includes("dirty.txt")), true);
  assert.equal(state.nextActions.includes("Review and commit or intentionally discard local changes."), true);
});

test("project state handles missing package metadata, non-git roots, and missing eval reports", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-memory-no-git-"));
  const state = createProjectState({ root: workspace, schemaRoot: root });
  assert.equal(state.project.name, path.basename(workspace));
  assert.equal(state.project.version, null);
  assert.equal(state.git.available, false);
  assert.equal(state.git.branch, null);
  assert.equal(state.evals.status, "missing");
  assert.equal(state.status, "needs_attention");
  assert.equal(state.nextActions.includes("Run npm run eval:run to refresh deterministic eval evidence."), true);
});

test("project state reports pending approval next actions from the dashboard ledger", () => {
  const workspace = tempRoot();
  const db = createSqliteAdapter({ root: workspace, schemaRoot: root });
  db.init();
  createApprovalLedger({ db }).request({
    action: "dashboard.workflow.full-qa",
    reason: "Exercise project-state pending approval reporting.",
    payload: { workflowId: "full-qa" }
  });

  const state = createProjectState({ root: workspace, schemaRoot: root });
  assert.equal(state.dashboard.pendingApprovals, 1);
  assert.equal(
    state.nextActions.includes("Review pending approvals before executing mutating workflows."),
    true
  );
});

test("project state falls back when memory and dashboard storage cannot initialize", () => {
  const workspace = tempRoot();
  const badSchemaRoot = path.join(workspace, "missing-schema-root");
  const state = createProjectState({ root: workspace, schemaRoot: badSchemaRoot });
  assert.equal(state.memory.total, 0);
  assert.deepEqual(state.memory.latest, []);
  assert.equal(state.dashboard, null);
  assert.equal(state.checks.find((check) => check.name === "dashboard-health").status, "passed");
});

test("memory smoke script proves CLI-level storage and state path", () => {
  const result = spawnSync("npm", ["run", "memory:smoke"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
  assert.equal(parsed.status, "passed");
  assert.equal(parsed.audit.total, 1);
  assert.equal(parsed.state.memoryTotal, 1);
});

test("memory smoke direct runner covers CLI status branches", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-memory-smoke-direct-"));
  const result = runMemorySmoke({ root: workspace, schemaRoot: root });
  assert.equal(result.status, "passed");
  assert.equal(fs.existsSync(path.join(workspace, "package.json")), true);

  const existingPackage = fs.mkdtempSync(path.join(os.tmpdir(), "sage-memory-smoke-existing-"));
  fs.writeFileSync(path.join(existingPackage, "package.json"), JSON.stringify({ name: "existing" }));
  assert.equal(runMemorySmoke({ root: existingPackage, schemaRoot: root }).status, "passed");

  const lines = [];
  const passed = runMemorySmokeCli({
    root: fs.mkdtempSync(path.join(os.tmpdir(), "sage-memory-smoke-cli-")),
    schemaRoot: root,
    stdout: (line) => lines.push(line)
  });
  assert.equal(passed, 0);
  assert.equal(JSON.parse(lines[0]).status, "passed");

  const failed = runMemorySmokeCli({
    root: fs.mkdtempSync(path.join(os.tmpdir(), "sage-memory-smoke-failed-")),
    schemaRoot: root,
    stdout: () => {},
    createStore: () => ({
      write: () => ({ id: "wrong_id" }),
      search: () => [],
      audit: () => ({ total: 0 })
    }),
    createState: () => ({ status: "needs_attention", memory: { total: 0 } })
  });
  assert.equal(failed, 1);
});
