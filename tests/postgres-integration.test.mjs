import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createPostgresAdapter } from "../packages/db/adapter.mjs";
import { migrateKernelDb } from "../packages/db/migrations.mjs";

const enabled = process.env.SAGE_RUN_POSTGRES_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const schemaRoot = path.resolve(import.meta.dirname, "..");

test("postgres adapter migrates, writes, queries, and batches against a real server", { skip: !enabled }, async () => {
  const db = createPostgresAdapter({ schemaRoot });
  try {
    await db.init();
    await migrateKernelDb({ db, schemaRoot, provider: "postgres" });
    await db.executeBatch([
      "DELETE FROM audit_events;",
      "DELETE FROM approvals;",
      {
        sql: `INSERT INTO approvals (id, action, status, reason, payload_json, created_at)
              VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        params: ["approval_pg_integration", "kernel.test", "pending", "integration", JSON.stringify({ ok: true }), "2026-01-01T00:00:00.000Z"]
      },
      {
        sql: `INSERT INTO audit_events (id, type, subject, metadata_json, created_at)
              VALUES ($1, $2, $3, $4::jsonb, $5)`,
        params: ["audit_pg_integration", "tool.started", "kernel.test", JSON.stringify({ ok: true }), "2026-01-01T00:00:01.000Z"]
      }
    ]);

    const approvals = await db.query("SELECT id, action FROM approvals WHERE id=$1", ["approval_pg_integration"]);
    assert.deepEqual(approvals, [{ id: "approval_pg_integration", action: "kernel.test" }]);
    assert.equal(await db.scalar("SELECT COUNT(*)::int AS count FROM audit_events WHERE id=$1", ["audit_pg_integration"]), 1);
  } finally {
    await db.close();
  }
});
