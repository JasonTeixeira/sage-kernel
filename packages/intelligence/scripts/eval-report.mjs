import { readLatestEvalReport } from "./eval-runner.mjs";

/* node:coverage ignore next 4 */
const report = readLatestEvalReport();
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "failed" ? 1 : 0);

