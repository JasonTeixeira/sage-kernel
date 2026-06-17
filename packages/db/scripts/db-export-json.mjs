import fs from "node:fs";
import path from "node:path";
import { exportKernelData } from "../persistence.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const redacted = args.includes("--redacted");
const outArg = args.find((arg) => arg.startsWith("--out="));
const output = JSON.stringify(exportKernelData({ root, redacted }), null, 2);

if (outArg) {
  const outputPath = path.resolve(root, outArg.slice("--out=".length));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${output}\n`);
  console.log(JSON.stringify({ path: outputPath, redacted }, null, 2));
} else {
  console.log(output);
}
