import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

function argValue(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

const templateId = argValue("template");
const targetId = argValue("target") || "vercel";
const out = argValue("out");

if (!templateId) {
  console.error("Usage: npm run infra:plan -- --template <template-id> [--target vercel|docker|supabase|aws-starter|cloudflare] [--out file.json]");
  process.exit(1);
}

const root = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

const templates = readJson("catalog/templates.json").templates;
const qaProfiles = readJson("packages/qa/profiles.json").profiles;
const envContract = readJson("packages/infra/env-contract.json");
const deployTargets = readJson("packages/infra/deploy-targets.json").targets;
const readinessChecks = readJson("packages/infra/readiness-checks.json").checks;

const template = templates.find((item) => item.id === templateId);
if (!template) throw new Error(`Unknown template: ${templateId}`);

const target = deployTargets.find((item) => item.id === targetId);
if (!target) throw new Error(`Unknown deploy target: ${targetId}`);

const qaProfile = qaProfiles.find((item) => item.id === template.qaProfile);
if (!qaProfile) throw new Error(`Missing QA profile for template ${templateId}: ${template.qaProfile}`);

const requiredEnv = envContract.commonVariables.filter((variable) => {
  if (variable.required) return true;
  if (!Array.isArray(variable.requiredFor)) return false;
  return variable.requiredFor.some((capability) => template.coverage.includes(capability));
});

const applicableChecks = readinessChecks.filter((check) => {
  if (check.required) return true;
  if (Array.isArray(check.requiredFor) && check.requiredFor.includes(target.id)) return true;
  if (Array.isArray(check.requiredForCapabilities)) {
    return check.requiredForCapabilities.some((capability) => template.coverage.includes(capability));
  }
  return false;
});

const dockerTemplate =
  template.defaultStack.includes("FastAPI") || template.defaultStack.includes("Python")
    ? "packages/infra/templates/docker/python-fastapi.Dockerfile"
    : "packages/infra/templates/docker/node.Dockerfile";

const plan = {
  version: 1,
  template: template.id,
  target: target.id,
  strategy: target.strategy,
  defaultStack: template.defaultStack,
  coverage: template.coverage,
  services: target.services,
  requiredEnvironment: requiredEnv,
  qaGate: {
    profile: qaProfile.id,
    fast: qaProfile.fast,
    standard: qaProfile.standard,
    hardBlockers: qaProfile.hardBlockers
  },
  readinessChecks: applicableChecks,
  templates: {
    dockerfile: dockerTemplate,
    githubActions: "packages/infra/templates/github-actions/quality-gate.yml",
    rollbackRunbook: "packages/infra/templates/runbooks/rollback.md"
  },
  rollback: target.rollback,
  approvalRequiredFor: target.approvalRequiredFor,
  boundaries: [
    "plan-only: no resources are provisioned",
    "secrets must be injected by environment provider",
    "production changes require explicit approval"
  ]
};

const output = JSON.stringify(plan, null, 2);

if (out) {
  const outPath = path.resolve(root, out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${output}\n`);
  console.log(outPath);
} else {
  console.log(output);
}
