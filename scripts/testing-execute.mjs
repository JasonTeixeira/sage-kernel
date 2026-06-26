import { createTestingLabProof } from "../packages/testing/testing-lab.mjs";

// Run the testing proof with real execution of the impacted tests. Unlike the
// plan-only default, this gates on the actual test result.
//
// Usage: node scripts/testing-execute.mjs [--project <path>]

const args = process.argv.slice(2);
const arg = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
};

const proof = createTestingLabProof({ root: process.cwd(), projectPath: arg("project") || ".", execute: true });
console.log(JSON.stringify({ status: proof.status, executed: proof.executed, execution: proof.execution }, null, 2));

if (proof.status === "failed") {
  console.error("Testing execution failed.");
  process.exit(1);
}
console.log(`Testing proof ${proof.status} (execution: ${proof.execution.status}).`);
