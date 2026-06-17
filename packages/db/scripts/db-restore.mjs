import path from "node:path";
import { restoreSqliteDbBackup } from "../persistence.mjs";

const root = process.cwd();
const [backupPath] = process.argv.slice(2);
if (!backupPath) {
  console.error("Usage: npm run db:restore -- <backup.db>");
  process.exit(1);
}

const result = restoreSqliteDbBackup({ root, backupPath: path.resolve(root, backupPath) });
console.log(JSON.stringify(result, null, 2));
