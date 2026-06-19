import { fileURLToPath } from "node:url";
import { createObservabilityProof } from "../packages/observability/proof.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createObservabilityProof({ root: process.cwd() });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
