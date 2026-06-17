import fs from "node:fs";
import { createSqliteAdapter } from "../adapter.mjs";
import { dbPath } from "./db-lib.mjs";

const root = process.cwd();
if (!fs.existsSync(dbPath(root))) {
  console.log(JSON.stringify({ initialized: false }, null, 2));
  process.exit(0);
}

const tables = ["projects", "job_queue", "job_runs", "approvals", "decisions", "artifacts", "audit_events", "schema_migrations"];
const summary = { initialized: true, path: dbPath(root), tables: {} };
const db = createSqliteAdapter({ root });
for (const table of tables) {
  const count = db.scalar(`SELECT COUNT(*) FROM ${table};`);
  summary.tables[table] = Number(count);
}
console.log(JSON.stringify(summary, null, 2));
