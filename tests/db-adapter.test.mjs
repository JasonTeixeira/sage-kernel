import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createDbAdapter, createSqliteAdapter, detectDbProvider } from "../packages/db/adapter.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-db-"));
}

test("detectDbProvider defaults to sqlite and recognizes postgres urls", () => {
  assert.equal(detectDbProvider({}), "sqlite");
  assert.equal(detectDbProvider({ DATABASE_URL: "postgres://user:pass@localhost:5432/db" }), "postgres");
  assert.equal(detectDbProvider({ DATABASE_URL: "postgresql://user:pass@localhost:5432/db" }), "postgres");
});

test("sqlite adapter initializes schema and supports parameterized writes", () => {
  const root = tempRoot();
  const db = createSqliteAdapter({ root });

  db.init();
  db.execute(
    "INSERT INTO approvals (id, action, status, reason, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ["approval_test", "test.action", "pending", "reason", JSON.stringify({ ok: true }), "2026-01-01T00:00:00.000Z"]
  );

  const rows = db.query("SELECT id, action, payload_json FROM approvals WHERE id = ?", ["approval_test"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "test.action");
  assert.deepEqual(JSON.parse(rows[0].payload_json), { ok: true });
});

test("createDbAdapter returns sqlite locally and rejects runtime postgres until adapter is configured", () => {
  assert.equal(createDbAdapter({ root: tempRoot(), env: {} }).provider, "sqlite");
  assert.throws(
    () => createDbAdapter({ root: tempRoot(), env: { DATABASE_URL: "postgresql://localhost/db" } }),
    /Postgres runtime adapter is not configured/
  );
});
