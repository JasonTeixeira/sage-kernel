import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredTests = [
  "tests/core-runtime.test.mjs",
  "tests/db-adapter.test.mjs",
  "tests/job-queue.test.mjs",
  "tests/security-kernel.test.mjs",
  "tests/mcp-integration.test.mjs",
  "tests/scaffold-integration.test.mjs",
  "tests/cli-flows.test.mjs"
];

const failures = [];

for (const file of requiredTests) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    failures.push(`Missing required test file: ${file}`);
    continue;
  }
  const body = fs.readFileSync(fullPath, "utf8");
  if (!body.includes("test(")) failures.push(`No test blocks found in ${file}`);
  if (!body.includes("assert.")) failures.push(`No assertions found in ${file}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const script of ["test", "test:coverage", "qa:gate"]) {
  if (!pkg.scripts?.[script]) failures.push(`Missing package script: ${script}`);
}

if (failures.length) {
  console.error(`QA gate failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("QA gate passed.");
