import fs from "node:fs";
import path from "node:path";

import { createDbAdapter, createSqliteAdapter } from "./adapter.mjs";

export const KERNEL_MIGRATIONS = [
  {
    id: "0001_kernel_schema",
    description: "Create the canonical kernel persistence schema",
    async up(db, context) {
      const schemaPath = context.provider === "postgres" ? "packages/db/postgres.schema.sql" : "packages/db/schema.sql";
      await db.execute(fs.readFileSync(path.join(context.schemaRoot, schemaPath), "utf8"));
    }
  },
  {
    id: "0002_job_queue_locking_columns",
    description: "Add scheduled and locked job queue columns for worker coordination",
    async up(db, context) {
      await ensureColumns(db, context, "job_queue", [
        { name: "next_run_at", sqlite: "TEXT", postgres: "TIMESTAMPTZ" },
        { name: "locked_at", sqlite: "TEXT", postgres: "TIMESTAMPTZ" },
        { name: "locked_by", sqlite: "TEXT", postgres: "TEXT" }
      ]);
    }
  },
  {
    id: "0003_approval_signature_columns",
    description: "Add approval signature and decision actor columns",
    async up(db, context) {
      await ensureColumns(db, context, "approvals", [
        { name: "signature", sqlite: "TEXT", postgres: "TEXT" },
        { name: "decided_by", sqlite: "TEXT", postgres: "TEXT" }
      ]);
    }
  },
  {
    id: "0004_audit_events",
    description: "Add append-only kernel audit event storage",
    statements: [
      {
        sqlite: `CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  subject TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);`,
        postgres: `CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  subject TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);`
      }
    ]
  },
  {
    id: "0005_kernel_indexes",
    description: "Add read-path indexes for queues, job runs, and audit events",
    statements: [
      {
        sqlite: "CREATE INDEX IF NOT EXISTS job_queue_ready_idx ON job_queue (status, priority, next_run_at, created_at);",
        postgres: "CREATE INDEX IF NOT EXISTS job_queue_ready_idx ON job_queue (status, priority, next_run_at, created_at);"
      },
      {
        sqlite: "CREATE INDEX IF NOT EXISTS job_runs_job_idx ON job_runs (job_id, created_at DESC);",
        postgres: "CREATE INDEX IF NOT EXISTS job_runs_job_idx ON job_runs (job_id, created_at DESC);"
      },
      {
        sqlite: "CREATE INDEX IF NOT EXISTS audit_events_type_idx ON audit_events (type, created_at DESC);",
        postgres: "CREATE INDEX IF NOT EXISTS audit_events_type_idx ON audit_events (type, created_at DESC);"
      }
    ]
  },
  {
    id: "0006_memory_records",
    description: "Add durable project memory records",
    statements: [
      {
        sqlite: `CREATE TABLE IF NOT EXISTS memory_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  actor TEXT NOT NULL,
  confidence REAL NOT NULL,
  observed_at TEXT NOT NULL,
  supersedes_json TEXT NOT NULL DEFAULT '[]',
  content_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);`,
        postgres: `CREATE TABLE IF NOT EXISTS memory_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  actor TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  supersedes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_json JSONB NOT NULL,
  provenance_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);`
      },
      {
        sqlite: "CREATE INDEX IF NOT EXISTS memory_records_project_idx ON memory_records (project_id, observed_at DESC);",
        postgres: "CREATE INDEX IF NOT EXISTS memory_records_project_idx ON memory_records (project_id, observed_at DESC);"
      },
      {
        sqlite: "CREATE INDEX IF NOT EXISTS memory_records_kind_idx ON memory_records (kind, observed_at DESC);",
        postgres: "CREATE INDEX IF NOT EXISTS memory_records_kind_idx ON memory_records (kind, observed_at DESC);"
      }
    ]
  }
];

export async function migrateKernelDb(options = {}) {
  const root = options.root || process.cwd();
  const schemaRoot = options.schemaRoot || root;
  const db = options.db || createDbAdapter(options);
  const provider = db.provider || options.provider || "sqlite";
  return runKernelMigrations({
    db,
    root,
    schemaRoot,
    provider,
    migrations: options.migrations || KERNEL_MIGRATIONS,
    now: options.now
  });
}

export async function runKernelMigrations(options = {}) {
  const db = options.db || createSqliteAdapter(options);
  const root = options.root || process.cwd();
  const schemaRoot = options.schemaRoot || root;
  const provider = options.provider || db.provider || "sqlite";
  const migrations = options.migrations || KERNEL_MIGRATIONS;
  const now = options.now || (() => new Date().toISOString());
  const context = { root, schemaRoot, provider, now };

  await ensureMigrationTable(db, provider);
  const applied = new Set((await db.query("SELECT id FROM schema_migrations ORDER BY id;")).map((row) => row.id));
  const results = [];

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      results.push({ id: migration.id, status: "skipped" });
      continue;
    }
    await applyMigration(db, provider, migration, context);
    results.push({ id: migration.id, status: "applied" });
  }

  return {
    provider,
    applied: results.filter((result) => result.status === "applied").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    migrations: results
  };
}

async function applyMigration(db, provider, migration, context) {
  const record = migrationRecordStatement(provider, migration, context.now());
  if (migration.up) {
    await migration.up(db, context);
    await db.execute(record.sql, record.params);
    return;
  }

  await db.executeBatch([
    ...selectStatements(migration, provider),
    record
  ]);
}

async function ensureMigrationTable(db, provider) {
  const appliedAtType = provider === "postgres" ? "TIMESTAMPTZ" : "TEXT";
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at ${appliedAtType} NOT NULL
);`);
}

async function ensureColumns(db, context, table, columns) {
  const existing = await columnNames(db, context.provider, table);
  const statements = columns
    .filter((column) => !existing.has(column.name))
    .map((column) => `ALTER TABLE ${table} ADD COLUMN ${column.name} ${column[context.provider]};`);
  if (statements.length > 0) await db.executeBatch(statements);
}

async function columnNames(db, provider, table) {
  if (provider === "postgres") {
    const rows = await db.query(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1;",
      [table]
    );
    return new Set(rows.map((row) => row.name));
  }
  const rows = await db.query(`PRAGMA table_info(${table});`);
  return new Set(rows.map((row) => row.name));
}

function selectStatements(migration, provider) {
  return (migration.statements || []).map((statement) => {
    if (typeof statement === "string") return statement;
    return statement[provider];
  });
}

function migrationRecordStatement(provider, migration, appliedAt) {
  const placeholders = provider === "postgres" ? "$1, $2, $3" : "?, ?, ?";
  return {
    sql: `INSERT INTO schema_migrations (id, description, applied_at) VALUES (${placeholders})`,
    params: [migration.id, migration.description, appliedAt]
  };
}
