import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function dbPath(root) {
  return path.join(root, ".sage-kernel", "kernel.db");
}

export function runSql(root, sql) {
  fs.mkdirSync(path.join(root, ".sage-kernel"), { recursive: true });
  const result = spawnSync("sqlite3", [dbPath(root)], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "sqlite3 failed");
  }
  return result.stdout.trim();
}

export function ensureKernelSchema(root) {
  runSql(root, `.read packages/db/schema.sql`);
  const columns = new Set(
    runSql(root, `.mode json
PRAGMA table_info(job_queue);`)
      .split("\n")
      .join("\n")
      ? JSON.parse(runSql(root, `.mode json
PRAGMA table_info(job_queue);`)).map((column) => column.name)
      : []
  );
  const migrations = [
    ["next_run_at", "ALTER TABLE job_queue ADD COLUMN next_run_at TEXT;"],
    ["locked_at", "ALTER TABLE job_queue ADD COLUMN locked_at TEXT;"],
    ["locked_by", "ALTER TABLE job_queue ADD COLUMN locked_by TEXT;"]
  ];
  for (const [column, sql] of migrations) {
    if (!columns.has(column)) runSql(root, sql);
  }
}

export function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

export function sqlJson(value) {
  return sqlString(JSON.stringify(value ?? {}));
}
