import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogDir = path.join(root, "catalog");

const requiredFiles = [
  "repos.json",
  "modules.json",
  "templates.json",
  "integrations.json",
  "phases.json"
];

function readJson(file) {
  const absolute = path.join(catalogDir, file);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Missing catalog file: ${file}`);
  }

  return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

function assertUnique(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = item[key];
    if (!value) {
      throw new Error(`${label} entry missing required key: ${key}`);
    }
    if (seen.has(value)) {
      throw new Error(`${label} duplicate ${key}: ${value}`);
    }
    seen.add(value);
  }
}

function assertScore(item, key, label) {
  const value = item[key];
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`${label} has invalid ${key}: ${value}`);
  }
}

const repos = readJson("repos.json");
const modules = readJson("modules.json");
const templates = readJson("templates.json");
const integrations = readJson("integrations.json");
const phases = readJson("phases.json");
const qaProfilesPath = path.join(root, "packages", "qa", "profiles.json");
const qaProfiles = fs.existsSync(qaProfilesPath)
  ? JSON.parse(fs.readFileSync(qaProfilesPath, "utf8"))
  : { profiles: [] };

for (const file of requiredFiles) {
  readJson(file);
}

assertUnique(repos.repos, "name", "repo");
assertUnique(modules.modules, "id", "module");
assertUnique(templates.templates, "id", "template");
assertUnique(integrations.integrations, "id", "integration");
assertUnique(phases.phases, "id", "phase");
assertUnique(qaProfiles.profiles, "id", "qa profile");

const qaProfileIds = new Set(qaProfiles.profiles.map((profile) => profile.id));

for (const repo of repos.repos) {
  assertScore(repo, "score", `repo ${repo.name}`);
  if (!repo.role || !repo.target || !Array.isArray(repo.domains)) {
    throw new Error(`repo ${repo.name} is missing role, target, or domains`);
  }
}

for (const module of modules.modules) {
  assertScore(module, "scoreCurrent", `module ${module.id}`);
  assertScore(module, "scoreTarget", `module ${module.id}`);
  if (module.scoreTarget < module.scoreCurrent) {
    throw new Error(`module ${module.id} target score is lower than current score`);
  }
  if (!Array.isArray(module.responsibilities) || module.responsibilities.length === 0) {
    throw new Error(`module ${module.id} needs at least one responsibility`);
  }
}

for (const template of templates.templates) {
  if (!Array.isArray(template.coverage) || template.coverage.length === 0) {
    throw new Error(`template ${template.id} needs coverage`);
  }
  if (!template.qaProfile) {
    throw new Error(`template ${template.id} needs qaProfile`);
  }
  if (qaProfileIds.size > 0 && !qaProfileIds.has(template.qaProfile)) {
    throw new Error(`template ${template.id} references missing qaProfile: ${template.qaProfile}`);
  }
}

for (const integration of integrations.integrations) {
  if (!integration.category || !integration.boundary || !Array.isArray(integration.capabilities)) {
    throw new Error(`integration ${integration.id} is missing category, boundary, or capabilities`);
  }
}

console.log("Catalog validation passed.");
console.log(`Repos: ${repos.repos.length}`);
console.log(`Modules: ${modules.modules.length}`);
console.log(`Templates: ${templates.templates.length}`);
console.log(`Integrations: ${integrations.integrations.length}`);
console.log(`Phases: ${phases.phases.length}`);
console.log(`QA profiles: ${qaProfiles.profiles.length}`);
