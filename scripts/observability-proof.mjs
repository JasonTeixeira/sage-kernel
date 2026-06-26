import { fileURLToPath } from "node:url";
import { createObservabilityProof } from "../packages/observability/proof.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await createObservabilityProof({ root: process.cwd(), otlpEndpoint: process.env.SAGE_OTLP_ENDPOINT });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
