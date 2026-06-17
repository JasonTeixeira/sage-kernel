import fs from "node:fs";
import path from "node:path";

import { redactSecrets } from "../core/audit-log.mjs";
import { createSqliteAdapter } from "./adapter.mjs";

export const KERNEL_TABLES = [
  "projects",
  "job_queue",
  "job_runs",
  "approvals",
  "decisions",
  "artifacts",
  "audit_events",
  "schema_migrations"
];

export function kernelDbPath(root) {
  return path.join(root, ".sage-kernel", "kernel.db");
}

export function exportKernelData(options = {}) {
  const root = options.root || process.cwd();
  const schemaRoot = options.schemaRoot || root;
  const redacted = Boolean(options.redacted);
  const db = createSqliteAdapter({ root, schemaRoot });
  db.init();

  const tables = {};
  for (const table of KERNEL_TABLES) {
    const rows = db.query(`SELECT * FROM ${table};`);
    tables[table] = redacted ? rows.map(redactRow) : rows;
  }

  return {
    format: "sage-kernel.export.v1",
    exportedAt: new Date().toISOString(),
    redacted,
    tables
  };
}

export function importKernelData(options = {}) {
  const root = options.root || process.cwd();
  const schemaRoot = options.schemaRoot || root;
  const data = options.data || readJsonFile(options.file);
  if (data?.format !== "sage-kernel.export.v1") {
    throw new Error("Unsupported Sage Kernel export format");
  }

  const db = createSqliteAdapter({ root, schemaRoot });
  db.init();
  const statements = [];
  for (const table of [...KERNEL_TABLES].reverse()) {
    statements.push(`DELETE FROM ${table};`);
  }
  for (const table of KERNEL_TABLES) {
    for (const row of data.tables?.[table] || []) {
      const columns = Object.keys(row);
      if (!columns.length) continue;
      statements.push({
        sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        params: columns.map((column) => row[column])
      });
    }
  }
  db.executeBatch(statements);
  return {
    importedAt: new Date().toISOString(),
    tables: Object.fromEntries(KERNEL_TABLES.map((table) => [table, data.tables?.[table]?.length || 0]))
  };
}

export function backupSqliteDb(options = {}) {
  const root = options.root || process.cwd();
  const schemaRoot = options.schemaRoot || root;
  const db = createSqliteAdapter({ root, schemaRoot });
  db.init();
  db.execute("PRAGMA wal_checkpoint(FULL);");
  const source = kernelDbPath(root);
  const backupDir = options.backupDir || path.join(root, ".sage-kernel", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const destination = options.path || path.join(backupDir, `kernel-${timestampForFile()}.db`);
  fs.copyFileSync(source, destination);
  return {
    path: destination,
    bytes: fs.statSync(destination).size,
    createdAt: new Date().toISOString()
  };
}

export function restoreSqliteDbBackup(options = {}) {
  const root = options.root || process.cwd();
  const backupPath = options.backupPath;
  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error(`Backup file does not exist: ${backupPath || ""}`);
  }
  const destination = kernelDbPath(root);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(backupPath, destination);
  return {
    path: destination,
    bytes: fs.statSync(destination).size,
    restoredAt: new Date().toISOString()
  };
}

function readJsonFile(file) {
  if (!file) throw new Error("Import requires a JSON export file");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function redactRow(row) {
  return Object.fromEntries(
    Object.entries(redactSecrets(row)).map(([key, value]) => [key, redactJsonString(value)])
  );
}

function redactJsonString(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.stringify(redactSecrets(JSON.parse(value)));
  } catch {
    return value;
  }
}

function timestampForFile() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}
