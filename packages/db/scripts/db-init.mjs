import fs from "node:fs";
import path from "node:path";
import { dbPath, ensureKernelSchema, runSql } from "./db-lib.mjs";

const root = process.cwd();
const schema = fs.readFileSync(path.join(root, "packages/db/schema.sql"), "utf8");
runSql(root, schema);
ensureKernelSchema(root);
console.log(dbPath(root));
