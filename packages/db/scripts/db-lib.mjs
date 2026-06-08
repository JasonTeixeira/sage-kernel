import path from "node:path";
import { createSqliteAdapter } from "../adapter.mjs";

export function dbPath(root) {
  return path.join(root, ".sage-kernel", "kernel.db");
}

export function runSql(root, sql) {
  return createSqliteAdapter({ root }).execute(sql);
}

export function ensureKernelSchema(root) {
  createSqliteAdapter({ root }).init();
}

export function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

export function sqlJson(value) {
  return sqlString(JSON.stringify(value ?? {}));
}
