import { fileURLToPath } from "node:url";
import { createBenchmarkCorpusProof } from "../packages/benchmark/corpus-proof.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createBenchmarkCorpusProof({
    root: process.cwd(),
    compare: process.argv.includes("--compare"),
    failOnRegression: process.argv.includes("--fail-on-regression")
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
