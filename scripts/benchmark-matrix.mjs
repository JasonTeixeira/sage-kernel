import { fileURLToPath } from "node:url";
import { createBenchmarkMatrixReport } from "../packages/benchmark/benchmark-matrix.mjs";

export function parseBenchmarkMatrixArgs(argv = process.argv.slice(2)) {
  return {
    paths: argv.filter((arg) => !arg.startsWith("--")),
    risk: valueFor(argv, "--risk") || "high",
    save: argv.includes("--save"),
    compare: argv.includes("--compare"),
    failOnRegression: argv.includes("--fail-on-regression")
  };
}

function valueFor(argv, name) {
  return argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1] || null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createBenchmarkMatrixReport({ root: process.cwd(), ...parseBenchmarkMatrixArgs() });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
