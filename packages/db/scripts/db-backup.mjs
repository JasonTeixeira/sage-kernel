import fs from "node:fs";
import path from "node:path";
import { backupSqliteDb } from "../persistence.mjs";

const root = process.cwd();
const outArg = process.argv.slice(2).find((arg) => arg.startsWith("--out="));
const outputPath = outArg ? path.resolve(root, outArg.slice("--out=".length)) : undefined;
if (outputPath) fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const result = backupSqliteDb({ root, path: outputPath });
console.log(JSON.stringify(result, null, 2));
