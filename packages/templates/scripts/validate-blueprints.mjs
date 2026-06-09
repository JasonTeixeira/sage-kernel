import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const templates = ["next-saas-app", "next-ai-app", "fastapi-service", "worker-service", "expo-mobile-app"];
const required = [
  ".github/workflows/ci.yml",
  ".sage/project-plan.json",
  "Dockerfile",
  "docs/architecture.md",
  "docs/runbook.md",
  "src/env.example.mjs",
  "tests/health.test.mjs"
];

const out = fs.mkdtempSync(path.join(os.tmpdir(), "sage-blueprint-validate-"));
const failures = [];

for (const template of templates) {
  const name = `Validate ${template}`;
  const result = spawnSync(
    "node",
    ["packages/templates/scripts/template-scaffold-v2.mjs", "--template", template, "--name", name, "--out", out],
    { cwd: root, encoding: "utf8" }
  );
  if (result.status !== 0) {
    failures.push(`${template}: scaffold failed: ${result.stderr || result.stdout}`);
    continue;
  }
  const dir = path.join(out, name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
  for (const file of required) {
    if (!fs.existsSync(path.join(dir, file))) failures.push(`${template}: missing ${file}`);
  }
  const planPath = path.join(dir, ".sage/project-plan.json");
  if (fs.existsSync(planPath)) {
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    for (const key of ["docker", "ci", "envValidation", "healthCheck", "runbook"]) {
      if (!plan.productionReadiness?.[key]) failures.push(`${template}: productionReadiness.${key} not true`);
    }
  }
}

if (failures.length) {
  console.error(`Blueprint validation failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("Blueprint validation passed.");
console.log(`Templates: ${templates.length}`);
