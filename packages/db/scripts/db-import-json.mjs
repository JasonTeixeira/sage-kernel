import path from "node:path";
import { importKernelData } from "../persistence.mjs";

const root = process.cwd();
const [file] = process.argv.slice(2);
if (!file) {
  console.error("Usage: npm run db:import -- <export.json>");
  process.exit(1);
}

const result = importKernelData({ root, file: path.resolve(root, file) });
console.log(JSON.stringify(result, null, 2));
