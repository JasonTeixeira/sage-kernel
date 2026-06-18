import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { bindSql, createCliSqliteAdapter, createDbAdapter, createPersistentSqliteAdapter, createPostgresAdapter, createSqliteAdapter, detectDbProvider, __dbAdapterTestInternals } from "../packages/db/adapter.mjs";
import {
  backupSqliteDb,
  exportKernelData,
  __persistenceTestInternals,
  importKernelData,
  restoreSqliteDbBackup
} from "../packages/db/persistence.mjs";
import { __migrationsTestInternals, KERNEL_MIGRATIONS, migrateKernelDb, runKernelMigrations } from "../packages/db/migrations.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-db-"));
}

test("detectDbProvider defaults to sqlite and recognizes postgres urls", () => {
  assert.equal(detectDbProvider({}), "sqlite");
  assert.equal(detectDbProvider({ SAGE_DB_PROVIDER: "postgres" }), "postgres");
  assert.equal(detectDbProvider({ SAGE_DB_PROVIDER: "sqlite", DATABASE_URL: "postgresql://localhost/db" }), "sqlite");
  assert.equal(detectDbProvider({ DATABASE_URL: "postgres://user:pass@localhost:5432/db" }), "postgres");
  assert.equal(detectDbProvider({ DATABASE_URL: "postgresql://user:pass@localhost:5432/db" }), "postgres");
});

test("SQL binding covers primitive values, escaping, nullish values, and missing parameters", () => {
  assert.equal(
    bindSql("VALUES (?, ?, ?, ?, ?, ?)", ["O'Hara", true, false, null, undefined, Number.NaN]),
    "VALUES ('O''Hara', 1, 0, NULL, NULL, NULL)"
  );
  assert.throws(() => bindSql("VALUES (?, ?)", ["only-one"]), /Missing SQL bind parameter/);
  assert.equal(__dbAdapterTestInternals.sqlValue(Number.POSITIVE_INFINITY), "NULL");
  assert.equal(__dbAdapterTestInternals.sqlValue("Bob's"), "'Bob''s'");
});

test("sqlite adapter initializes schema and supports parameterized writes", () => {
  const root = tempRoot();
  const db = createSqliteAdapter({ root, schemaRoot: path.resolve(import.meta.dirname, "..") });

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

test("persistent sqlite adapter supports in-process queries when node sqlite is available", () => {
  let db;
  try {
    db = createPersistentSqliteAdapter({ root: tempRoot(), schemaRoot: path.resolve(import.meta.dirname, "..") });
  } catch (error) {
    assert.match(error.message, /node:sqlite/);
    return;
  }
  db.init();
  assert.equal(db.driver, "persistent");
  db.execute(
    "INSERT INTO decisions (id, title, summary, source, created_at) VALUES (?, ?, ?, ?, ?)",
    ["decision_persistent", "Persistent", "Driver", "test", "2026-01-01T00:00:00.000Z"]
  );
  db.executeBatch([
    {
      sql: "INSERT INTO audit_events (id, type, subject, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)",
      params: ["audit_persistent", "tool.finished", "kernel.test", JSON.stringify({ ok: true }), "2026-01-01T00:00:01.000Z"]
    }
  ]);
  assert.equal(db.query("SELECT id FROM decisions WHERE id=?", ["decision_persistent"])[0].id, "decision_persistent");
  assert.equal(db.scalar("SELECT COUNT(*) AS count FROM audit_events WHERE id=?", ["audit_persistent"]), 1);
  assert.equal(db.scalar("SELECT NULL AS value"), "");
  db.close();
});

test("sqlite adapter can select persistent mode and rolls back failed persistent batches", () => {
  let db;
  try {
    db = createSqliteAdapter({
      root: tempRoot(),
      schemaRoot: path.resolve(import.meta.dirname, ".."),
      env: { SAGE_SQLITE_DRIVER: "persistent" }
    });
  } catch (error) {
    assert.match(error.message, /node:sqlite/);
    return;
  }
  assert.equal(db.driver, "persistent");
  db.init();
  db.execute("CREATE TABLE IF NOT EXISTS persistent_extra (id TEXT PRIMARY KEY);");
  db.executeBatch([
    "INSERT INTO persistent_extra (id) VALUES ('one')",
    { sql: "INSERT INTO persistent_extra (id) VALUES (?)", params: ["two"] }
  ]);
  assert.equal(db.scalar("SELECT COUNT(*) AS count FROM persistent_extra;"), 2);
  assert.throws(
    () => db.executeBatch(["INSERT INTO persistent_extra (id) VALUES ('three')", "INSERT INTO missing_table VALUES ('broken')"]),
    /missing_table/
  );
  assert.equal(db.scalar("SELECT COUNT(*) AS count FROM persistent_extra;"), 2);
  db.close();
});

test("sqlite adapter covers optional persistent fallback and cli execution errors", () => {
  assert.equal(typeof __dbAdapterTestInternals.loadNodeSqlite(true)?.DatabaseSync, "function");
  const selected = createSqliteAdapter({
    root: tempRoot(),
    schemaRoot: path.resolve(import.meta.dirname, ".."),
    env: {}
  });
  assert.equal(["cli", "persistent"].includes(selected.driver), true);
  selected.close?.();

  const cli = createCliSqliteAdapter({
    root: tempRoot(),
    schemaRoot: path.resolve(import.meta.dirname, "..")
  });
  assert.throws(() => cli.query("SELECT definitely_missing FROM missing_table;"), /no such table|failed/i);
});

test("sqlite adapter executes batched statements in one transaction", () => {
  const root = tempRoot();
  const db = createSqliteAdapter({ root, schemaRoot: path.resolve(import.meta.dirname, "..") });

  db.init();
  db.executeBatch([
    {
      sql: "INSERT INTO decisions (id, title, summary, source, created_at) VALUES (?, ?, ?, ?, ?)",
      params: ["decision_1", "One", "First", "test", "2026-01-01T00:00:00.000Z"]
    },
    {
      sql: "INSERT INTO decisions (id, title, summary, source, created_at) VALUES (?, ?, ?, ?, ?)",
      params: ["decision_2", "Two", "Second", "test", "2026-01-01T00:00:01.000Z"]
    }
  ]);

  assert.equal(Number(db.scalar("SELECT COUNT(*) FROM decisions;")), 2);
});

test("createDbAdapter returns sqlite locally and postgres when configured", () => {
  assert.equal(createDbAdapter({ root: tempRoot(), env: {} }).provider, "sqlite");
  assert.equal(createDbAdapter({ root: tempRoot(), env: { DATABASE_URL: "postgresql://localhost/db" } }).provider, "postgres");
  assert.throws(() => createDbAdapter({ root: tempRoot(), provider: "missing" }), /Unknown DB provider/);
});

test("postgres adapter supports schema init, parameterized queries, scalar values, transactions, and close", async () => {
  const calls = [];
  class FakeClient {
    constructor(config) {
      this.config = config;
    }
    async connect() {
      calls.push(["connect", this.config.connectionString]);
    }
    async query(sql, params = []) {
      calls.push(["query", sql, params]);
      if (sql === "SELECT 1 AS value") return { rows: [{ value: 1 }] };
      if (sql === "SELECT COUNT(*) AS count FROM approvals") return { rows: [{ count: "2" }] };
      return { rows: [] };
    }
    async end() {
      calls.push(["end"]);
    }
  }

  const adapter = createPostgresAdapter({
    root: path.resolve(import.meta.dirname, ".."),
    env: { DATABASE_URL: "postgresql://localhost/sage" },
    ClientClass: FakeClient
  });

  await adapter.init();
  await adapter.execute("INSERT INTO approvals (id) VALUES ($1)", ["approval_1"]);
  assert.deepEqual(await adapter.query("SELECT 1 AS value"), [{ value: 1 }]);
  assert.equal(await adapter.scalar("SELECT COUNT(*) AS count FROM approvals"), "2");
  assert.equal(await adapter.scalar("SELECT nothing"), "");
  await adapter.executeBatch([
    { sql: "INSERT INTO approvals (id) VALUES ($1)", params: ["approval_2"] },
    "DELETE FROM approvals WHERE id = 'approval_2'"
  ]);
  await adapter.close();
  await adapter.close();

  assert.equal(calls[0][0], "connect");
  assert.equal(calls.some((call) => call[1] === "BEGIN"), true);
  assert.equal(calls.some((call) => call[1] === "COMMIT"), true);
  assert.equal(calls.at(-1)[0], "end");
});

test("postgres adapter rolls back failed batches and rejects missing connection strings", async () => {
  assert.throws(() => createPostgresAdapter({ env: {} }), /requires DATABASE_URL/);

  const calls = [];
  class FailingClient {
    async connect() {
      calls.push(["connect"]);
    }
    async query(sql, params = []) {
      calls.push(["query", sql, params]);
      if (sql.includes("BROKEN")) throw new Error("broken statement");
      return { rows: [] };
    }
    async end() {
      calls.push(["end"]);
    }
  }

  const adapter = createPostgresAdapter({
    root: path.resolve(import.meta.dirname, ".."),
    env: { DATABASE_URL: "postgresql://localhost/sage" },
    ClientClass: FailingClient
  });
  await assert.rejects(
    adapter.executeBatch(["SELECT 1", "BROKEN"]),
    /broken statement/
  );
  assert.equal(calls.some((call) => call[1] === "ROLLBACK"), true);
  await adapter.close();
  assert.equal(calls.at(-1)[0], "end");
});

test("postgres migrations cover skipped columns and statement selection", async () => {
  const calls = [];
  const existingColumns = new Set(["next_run_at", "locked_at", "locked_by", "signature", "decided_by"]);
  const fakeDb = {
    provider: "postgres",
    async execute(sql, params = []) {
      calls.push(["execute", sql, params]);
    },
    async executeBatch(statements = []) {
      calls.push(["batch", statements]);
      for (const statement of statements) {
        if (typeof statement === "string") {
          assert.doesNotMatch(statement, /sqlite-only/);
        } else {
          assert.match(statement.sql, /INSERT INTO schema_migrations/);
        }
      }
    },
    async query(sql, params = []) {
      calls.push(["query", sql, params]);
      if (sql.includes("schema_migrations")) return [];
      if (sql.includes("information_schema.columns")) {
        return [...existingColumns].map((name) => ({ name }));
      }
      return [];
    }
  };

  const result = await runKernelMigrations({
    root: tempRoot(),
    schemaRoot: path.resolve(import.meta.dirname, ".."),
    db: fakeDb,
    provider: "postgres",
    now: () => "2026-01-01T00:00:00.000Z"
  });

  assert.equal(result.applied, 6);
  assert.equal(result.provider, "postgres");
  assert.equal(calls.some((call) => call[0] === "batch"), true);
  assert.equal(calls.some((call) => call[1]?.includes?.("ALTER TABLE")), false);
});

test("postgres migrations add missing columns when schema inspection is partial", async () => {
  const calls = [];
  const existingColumns = new Set(["next_run_at", "signature"]);
  const fakeDb = {
    provider: "postgres",
    async execute(sql, params = []) {
      calls.push(["execute", sql, params]);
    },
    async executeBatch(statements = []) {
      calls.push(["batch", statements]);
    },
    async query(sql) {
      calls.push(["query", sql]);
      if (sql.includes("schema_migrations")) return [];
      if (sql.includes("information_schema.columns")) {
        return [...existingColumns].map((name) => ({ name }));
      }
      return [];
    }
  };

  await runKernelMigrations({
    root: tempRoot(),
    schemaRoot: path.resolve(import.meta.dirname, ".."),
    db: fakeDb,
    provider: "postgres",
    now: () => "2026-01-01T00:00:00.000Z",
    migrations: [
      {
        id: "partial_columns",
        description: "partial columns",
        async up(db, context) {
          await KERNEL_MIGRATIONS[1].up(db, context);
          await KERNEL_MIGRATIONS[2].up(db, context);
        }
      }
    ]
  });

  const batches = calls.filter((call) => call[0] === "batch").flatMap((call) => call[1]);
  assert.equal(batches.some((statement) => /locked_at/.test(statement)), true);
  assert.equal(batches.some((statement) => /locked_by/.test(statement)), true);
  assert.equal(batches.some((statement) => /decided_by/.test(statement)), true);
});

test("migration runner reports skipped migrations and sqlite column additions", async () => {
  const calls = [];
  const fakeDb = {
    provider: "sqlite",
    async execute(sql, params = []) {
      calls.push(["execute", sql, params]);
    },
    async executeBatch(statements = []) {
      calls.push(["batch", statements]);
    },
    async query(sql) {
      calls.push(["query", sql]);
      if (sql.includes("schema_migrations")) return [{ id: "already_applied" }];
      if (sql.includes("PRAGMA table_info")) return [];
      return [];
    }
  };

  const result = await runKernelMigrations({
    root: tempRoot(),
    schemaRoot: path.resolve(import.meta.dirname, ".."),
    db: fakeDb,
    provider: "sqlite",
    now: () => "2026-01-01T00:00:00.000Z",
    migrations: [
      { id: "already_applied", description: "skip", statements: ["SELECT skipped"] },
      {
        id: "add_column",
        description: "add column",
        async up(db, context) {
          await db.executeBatch([`ALTER TABLE demo ADD COLUMN value ${context.provider === "sqlite" ? "TEXT" : "TEXT"};`]);
        }
      },
      {
        id: "string_statement",
        description: "string statement",
        statements: ["SELECT 1"]
      }
    ]
  });

  assert.equal(result.applied, 2);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.migrations.map((migration) => migration.status), ["skipped", "applied", "applied"]);
  assert.equal(calls.some((call) => call[0] === "batch" && JSON.stringify(call[1]).includes("SELECT 1")), true);
});

test("migration runner selects provider statements and records custom timestamps", async () => {
  const calls = [];
  const fakeDb = {
    provider: "postgres",
    async execute(sql, params = []) {
      calls.push(["execute", sql, params]);
    },
    async executeBatch(statements = []) {
      calls.push(["batch", statements]);
    },
    async query(sql) {
      calls.push(["query", sql]);
      if (sql.includes("schema_migrations")) return [];
      return [];
    }
  };

  const result = await runKernelMigrations({
    root: tempRoot(),
    schemaRoot: path.resolve(import.meta.dirname, ".."),
    db: fakeDb,
    provider: "postgres",
    now: () => "2026-06-17T00:00:00.000Z",
    migrations: [
      {
        id: "provider_choice",
        description: "provider choice",
        statements: [
          { sqlite: "SELECT 'sqlite-only'", postgres: "SELECT 'postgres-only'" },
          "SELECT 'shared'"
        ]
      }
    ]
  });

  assert.equal(result.applied, 1);
  const batch = calls.find((call) => call[0] === "batch")[1];
  assert.equal(batch[0], "SELECT 'postgres-only'");
  assert.equal(batch[1], "SELECT 'shared'");
  assert.deepEqual(batch[2].params, ["provider_choice", "provider choice", "2026-06-17T00:00:00.000Z"]);
  assert.match(batch[2].sql, /\$1, \$2, \$3/);
});

test("migration internals cover provider defaults, placeholders, and column inspection branches", async () => {
  assert.deepEqual(__migrationsTestInternals.selectStatements({}, "sqlite"), []);
  assert.deepEqual(__migrationsTestInternals.selectStatements({ statements: ["SELECT 1"] }, "sqlite"), ["SELECT 1"]);
  assert.equal(__migrationsTestInternals.selectStatements({
    statements: [{ sqlite: "SELECT sqlite", postgres: "SELECT pg" }]
  }, "postgres")[0], "SELECT pg");
  assert.match(__migrationsTestInternals.migrationRecordStatement("sqlite", {
    id: "id",
    description: "desc"
  }, "now").sql, /\?, \?, \?/);
  assert.match(__migrationsTestInternals.migrationRecordStatement("postgres", {
    id: "id",
    description: "desc"
  }, "now").sql, /\$1, \$2, \$3/);

  const sqliteColumns = await __migrationsTestInternals.columnNames({
    async query(sql) {
      assert.match(sql, /PRAGMA table_info/);
      return [{ name: "id" }, { name: "created_at" }];
    }
  }, "sqlite", "demo");
  assert.equal(sqliteColumns.has("created_at"), true);

  const executed = [];
  await __migrationsTestInternals.ensureColumns({
    async query() {
      return [{ name: "existing" }];
    },
    async executeBatch(statements) {
      executed.push(...statements);
    }
  }, { provider: "sqlite" }, "demo", [
    { name: "existing", sqlite: "TEXT", postgres: "TEXT" },
    { name: "missing", sqlite: "TEXT", postgres: "TEXT" }
  ]);
  assert.deepEqual(executed, ["ALTER TABLE demo ADD COLUMN missing TEXT;"]);

  let noOpBatchCalled = false;
  await __migrationsTestInternals.ensureColumns({
    async query() {
      return [{ name: "existing" }];
    },
    async executeBatch() {
      noOpBatchCalled = true;
    }
  }, { provider: "sqlite" }, "demo", [
    { name: "existing", sqlite: "TEXT", postgres: "TEXT" }
  ]);
  assert.equal(noOpBatchCalled, false);

  const tableStatements = [];
  await __migrationsTestInternals.ensureMigrationTable({
    async execute(sql) {
      tableStatements.push(sql);
    }
  }, "postgres");
  assert.match(tableStatements[0], /TIMESTAMPTZ/);
});

test("migration internals apply explicit up migrations and statement batches", async () => {
  const calls = [];
  const db = {
    async execute(sql, params) {
      calls.push({ kind: "execute", sql, params });
    },
    async executeBatch(statements) {
      calls.push({ kind: "batch", statements });
    }
  };

  await __migrationsTestInternals.applyMigration(db, "sqlite", {
    id: "custom_up",
    description: "Custom up migration",
    async up(innerDb, context) {
      assert.equal(innerDb, db);
      assert.equal(context.provider, "sqlite");
      await innerDb.execute("CREATE TABLE custom_up (id TEXT);");
    }
  }, {
    root: "/tmp/sage",
    schemaRoot: "/tmp/sage",
    provider: "sqlite",
    now: () => "2026-06-17T00:00:00.000Z"
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].sql, "CREATE TABLE custom_up (id TEXT);");
  assert.match(calls[1].sql, /INSERT INTO schema_migrations/);
  assert.deepEqual(calls[1].params, ["custom_up", "Custom up migration", "2026-06-17T00:00:00.000Z"]);

  await __migrationsTestInternals.applyMigration(db, "sqlite", {
    id: "custom_statements",
    description: "Custom statements",
    statements: ["CREATE TABLE custom_statements (id TEXT);"]
  }, {
    root: "/tmp/sage",
    schemaRoot: "/tmp/sage",
    provider: "sqlite",
    now: () => "2026-06-17T00:00:01.000Z"
  });
  assert.equal(calls.at(-1).kind, "batch");
  assert.equal(calls.at(-1).statements.length, 2);
});

test("sqlite persistence exports, imports, redacts, backs up, and restores data", () => {
  const root = tempRoot();
  const schemaRoot = path.resolve(import.meta.dirname, "..");
  const db = createSqliteAdapter({ root, schemaRoot });
  db.init();
  db.execute(
    "INSERT INTO approvals (id, action, status, reason, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ["approval_secret", "kernel.test", "pending", "contains secret", JSON.stringify({ token: "secret-token", ok: true }), "2026-01-01T00:00:00.000Z"]
  );
  db.execute(
    "INSERT INTO audit_events (id, type, subject, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)",
    ["audit_secret", "tool.started", "kernel.test", JSON.stringify({ input: { password: "secret-password" } }), "2026-01-01T00:00:01.000Z"]
  );
  db.execute(
    "INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)",
    ["9999_test", "test migration", "2026-01-01T00:00:02.000Z"]
  );

  const exported = exportKernelData({ root, schemaRoot });
  assert.equal(exported.tables.approvals.length, 1);
  assert.equal(exported.tables.audit_events.length, 1);
  assert.equal(exported.tables.schema_migrations.length, 1);
  assert.match(JSON.stringify(exported), /secret-token/);

  const redacted = exportKernelData({ root, schemaRoot, redacted: true });
  assert.doesNotMatch(JSON.stringify(redacted), /secret-token|secret-password/);
  assert.match(JSON.stringify(redacted), /REDACTED/);

  db.execute(
    "INSERT INTO audit_events (id, type, subject, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)",
    ["audit_array_secret", "tool.finished", "kernel.test", JSON.stringify([{ apiKey: "secret-array-key" }]), "2026-01-01T00:00:03.000Z"]
  );
  const redactedArray = exportKernelData({ root, schemaRoot, redacted: true });
  assert.doesNotMatch(JSON.stringify(redactedArray), /secret-array-key/);

  const importedRoot = tempRoot();
  importKernelData({ root: importedRoot, schemaRoot, data: exported });
  const importedDb = createSqliteAdapter({ root: importedRoot, schemaRoot });
  importedDb.init();
  assert.equal(Number(importedDb.scalar("SELECT COUNT(*) FROM approvals;")), 1);
  assert.equal(Number(importedDb.scalar("SELECT COUNT(*) FROM audit_events;")), 1);
  assert.equal(Number(importedDb.scalar("SELECT COUNT(*) FROM schema_migrations;")), 1);

  const backup = backupSqliteDb({ root, schemaRoot });
  assert.equal(fs.existsSync(backup.path), true);
  assert.equal(backup.bytes > 0, true);

  const restoredRoot = tempRoot();
  restoreSqliteDbBackup({ root: restoredRoot, backupPath: backup.path });
  const restoredDb = createSqliteAdapter({ root: restoredRoot, schemaRoot });
  restoredDb.init();
  assert.equal(Number(restoredDb.scalar("SELECT COUNT(*) FROM approvals;")), 1);
  assert.equal(Number(restoredDb.scalar("SELECT COUNT(*) FROM audit_events;")), 2);
  assert.equal(Number(restoredDb.scalar("SELECT COUNT(*) FROM schema_migrations;")), 1);
});

test("sqlite persistence validates import formats, file imports, custom backup paths, and restore inputs", () => {
  const root = tempRoot();
  const schemaRoot = path.resolve(import.meta.dirname, "..");
  const db = createSqliteAdapter({ root, schemaRoot });
  db.init();
  db.execute(
    "INSERT INTO audit_events (id, type, subject, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)",
    ["audit_invalid_json", "tool.finished", "kernel.test", "{not json", "2026-01-01T00:00:00.000Z"]
  );

  assert.throws(() => importKernelData({ root: tempRoot(), schemaRoot, data: { format: "wrong" } }), /Unsupported/);
  assert.throws(() => importKernelData({ root: tempRoot(), schemaRoot, data: {} }), /Unsupported/);
  assert.throws(() => importKernelData({ root: tempRoot(), schemaRoot }), /Import requires/);
  assert.throws(() => restoreSqliteDbBackup({ root: tempRoot() }), /Backup file does not exist/);
  assert.throws(() => restoreSqliteDbBackup({ root: tempRoot(), backupPath: "" }), /Backup file does not exist/);

  const exported = exportKernelData({ root, schemaRoot, redacted: true });
  assert.equal(exported.tables.audit_events[0].metadata_json, "{not json");

  const exportPath = path.join(root, "kernel-export.json");
  fs.writeFileSync(exportPath, JSON.stringify({
    ...exported,
    tables: {
      ...exported.tables,
      decisions: [{}]
    }
  }));
  const importedRoot = tempRoot();
  const imported = importKernelData({ root: importedRoot, schemaRoot, file: exportPath });
  assert.equal(imported.tables.decisions, 1);
  const importedDb = createSqliteAdapter({ root: importedRoot, schemaRoot });
  importedDb.init();
  assert.equal(Number(importedDb.scalar("SELECT COUNT(*) FROM decisions;")), 0);

  const customBackup = path.join(root, "custom-kernel.db");
  const backup = backupSqliteDb({ root, schemaRoot, path: customBackup });
  assert.equal(backup.path, customBackup);
  assert.equal(fs.existsSync(customBackup), true);

  const backupDir = path.join(root, "nested-backups");
  const backupInDir = backupSqliteDb({ root, schemaRoot, backupDir });
  assert.equal(path.dirname(backupInDir.path), backupDir);
  assert.match(path.basename(backupInDir.path), /^kernel-/);

  const emptyImportRoot = tempRoot();
  const emptyImport = importKernelData({
    root: emptyImportRoot,
    schemaRoot,
    data: { format: "sage-kernel.export.v1", tables: null }
  });
  assert.equal(emptyImport.tables.approvals, 0);

  const emptyRowImportRoot = tempRoot();
  const emptyRowImport = importKernelData({
    root: emptyRowImportRoot,
    schemaRoot,
    data: { format: "sage-kernel.export.v1", tables: { approvals: [{}] } }
  });
  assert.equal(emptyRowImport.tables.approvals, 1);
  const emptyRowDb = createSqliteAdapter({ root: emptyRowImportRoot, schemaRoot });
  emptyRowDb.init();
  assert.equal(Number(emptyRowDb.scalar("SELECT COUNT(*) FROM approvals;")), 0);

  assert.equal(__persistenceTestInternals.redactJsonString("not json"), "not json");
  assert.equal(__persistenceTestInternals.redactJsonString("{bad"), "{bad");
  assert.doesNotMatch(__persistenceTestInternals.redactJsonString(JSON.stringify({ password: "secret" })), /secret/);
  assert.equal(__persistenceTestInternals.redactRow({ metadata_json: JSON.stringify({ token: "abc" }) }).metadata_json.includes("REDACTED"), true);
  assert.match(__persistenceTestInternals.timestampForFile(), /^\d{4}-\d{2}-\d{2}T/);
  assert.throws(() => __persistenceTestInternals.readJsonFile(), /Import requires/);
});

test("sqlite migrations are tracked and idempotent", async () => {
  const root = tempRoot();
  const schemaRoot = path.resolve(import.meta.dirname, "..");

  const first = await migrateKernelDb({ root, schemaRoot });
  assert.equal(first.provider, "sqlite");
  assert.equal(first.applied, 6);
  assert.equal(first.skipped, 0);

  const second = await migrateKernelDb({ root, schemaRoot });
  assert.equal(second.applied, 0);
  assert.equal(second.skipped, 6);

  const db = createSqliteAdapter({ root, schemaRoot });
  db.init();
  assert.equal(Number(db.scalar("SELECT COUNT(*) FROM schema_migrations;")), 6);
  assert.equal(Number(db.scalar("SELECT COUNT(*) FROM audit_events;")), 0);
  assert.equal(Number(db.scalar("SELECT COUNT(*) FROM memory_records;")), 0);
});

test("sqlite migration failures roll back statements and migration records", async () => {
  const root = tempRoot();
  const schemaRoot = path.resolve(import.meta.dirname, "..");
  const db = createSqliteAdapter({ root, schemaRoot });
  db.init();

  await assert.rejects(
    runKernelMigrations({
      root,
      schemaRoot,
      db,
      migrations: [
        {
          id: "9999_broken",
          description: "broken test migration",
          statements: [
            "CREATE TABLE rollback_probe (id TEXT PRIMARY KEY);",
            "INSERT INTO missing_table (id) VALUES ('nope');"
          ]
        }
      ]
    }),
    /missing_table|no such table/
  );

  assert.equal(Number(db.scalar("SELECT COUNT(*) FROM schema_migrations WHERE id = ?", ["9999_broken"])), 0);
  assert.equal(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", ["rollback_probe"]).length, 0);
});
