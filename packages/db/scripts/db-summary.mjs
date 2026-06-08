import fs from "node:fs";
import { dbPath, runSql } from "./db-lib.mjs";

const root = process.cwd();
if (!fs.existsSync(dbPath(root))) {
  console.log(JSON.stringify({ initialized: false }, null, 2));
  process.exit(0);
}

const tables = ["projects", "job_queue", "job_runs", "approvals", "decisions", "artifacts"];
const summary = { initialized: true, path: dbPath(root), tables: {} };
for (const table of tables) {
  const count = runSql(root, `SELECT COUNT(*) FROM ${table};`);
  summary.tables[table] = Number(count);
}
console.log(JSON.stringify(summary, null, 2));
