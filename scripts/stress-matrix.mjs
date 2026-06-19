import { fileURLToPath } from "node:url";
import { createFullStressMatrix } from "../packages/testing/stress-matrix.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await createFullStressMatrix({
    root: process.cwd(),
    releaseScale: process.argv.includes("--release")
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
