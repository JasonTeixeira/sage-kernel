import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaPath = path.join(root, "packages/db/postgres.schema.sql");

if (!fs.existsSync(schemaPath)) {
  console.error(`Missing Postgres schema: ${schemaPath}`);
  process.exit(1);
}

console.log(fs.readFileSync(schemaPath, "utf8").trim());
