import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readJson(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing file: ${relativePath}`);
  }
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function assertUnique(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = item[key];
    if (!value) throw new Error(`${label} missing ${key}`);
    if (seen.has(value)) throw new Error(`${label} duplicate ${key}: ${value}`);
    seen.add(value);
  }
}

const templates = readJson("catalog/templates.json").templates;
const envContract = readJson("packages/infra/env-contract.json");
const deployTargets = readJson("packages/infra/deploy-targets.json");
const readinessChecks = readJson("packages/infra/readiness-checks.json");

assertUnique(deployTargets.targets, "id", "deploy target");
assertUnique(readinessChecks.checks, "id", "readiness check");
assertUnique(envContract.rules, "id", "env rule");

const templateIds = new Set(templates.map((template) => template.id));
for (const target of deployTargets.targets) {
  for (const templateId of target.bestFor) {
    if (!templateIds.has(templateId) && templateId !== "api-service") {
      throw new Error(`deploy target ${target.id} references unknown template: ${templateId}`);
    }
  }
  if (!target.rollback) {
    throw new Error(`deploy target ${target.id} needs rollback guidance`);
  }
}

const requiredTemplateFiles = [
  "packages/infra/templates/docker/node.Dockerfile",
  "packages/infra/templates/docker/python-fastapi.Dockerfile",
  "packages/infra/templates/github-actions/quality-gate.yml",
  "packages/infra/templates/runbooks/rollback.md"
];

for (const file of requiredTemplateFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    throw new Error(`Missing infra template: ${file}`);
  }
}

console.log("Infra validation passed.");
console.log(`Deploy targets: ${deployTargets.targets.length}`);
console.log(`Readiness checks: ${readinessChecks.checks.length}`);
console.log(`Environment rules: ${envContract.rules.length}`);
console.log(`Common env vars: ${envContract.commonVariables.length}`);
