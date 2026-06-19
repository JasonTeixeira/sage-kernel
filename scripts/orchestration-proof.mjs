import { fileURLToPath } from "node:url";
import { createDurableOrchestrationProof } from "../packages/orchestration/durable-proof.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createDurableOrchestrationProof({ root: process.cwd() });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
