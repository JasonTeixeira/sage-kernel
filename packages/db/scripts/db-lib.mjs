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

export function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

export function sqlJson(value) {
  return sqlString(JSON.stringify(value ?? {}));
}
