import fs from "node:fs";
import path from "node:path";

const IGNORED_DIRS = new Set([".git", "node_modules", ".sage-kernel", "dist", "build", "coverage", "generated", ".next"]);

export const SDLC_PROFILES = [
  {
    id: "web-app",
    title: "Web App",
    appliesTo: ["nextjs", "react", "vite"],
    requiredChecks: ["install", "lint", "typecheck", "unit", "e2e", "accessibility", "security", "release"],
    commands: ["npm test", "npm run test:coverage", "npm run dashboard:e2e"],
    evidence: ["route inventory", "browser proof", "mobile viewport proof", "security scan", "fresh install"]
  },
  {
    id: "mobile-app",
    title: "Mobile App",
    appliesTo: ["expo", "react-native", "swift"],
    requiredChecks: ["install", "unit", "device-smoke", "permissions", "offline-state", "release"],
    commands: ["npm test", "npm run test:coverage"],
    evidence: ["device/simulator smoke", "permission review", "mobile viewport proof", "release signing notes"]
  },
  {
    id: "backend-api",
    title: "Backend API",
    appliesTo: ["express", "fastapi", "django", "go-api", "rust-api"],
    requiredChecks: ["install", "unit", "integration", "contract", "database", "security", "load", "release"],
    commands: ["npm test", "npm run test:coverage"],
    evidence: ["API contract proof", "database migration proof", "auth boundary proof", "load test"]
  },
  {
    id: "mcp-server",
    title: "MCP Server",
    appliesTo: ["mcp"],
    requiredChecks: ["manifest", "contracts", "smoke", "permissions", "approval-boundary", "client-config", "release"],
    commands: ["npm run mcp:validate", "npm run mcp:contracts", "npm run mcp:smoke"],
    evidence: ["tool manifest", "contract snapshot", "MCP smoke", "real client proof"]
  },
  {
    id: "cli-tool",
    title: "CLI Tool",
    appliesTo: ["cli"],
    requiredChecks: ["install", "help-output", "command-matrix", "error-paths", "package", "release"],
    commands: ["npm test", "npm pack --dry-run"],
    evidence: ["binary proof", "help output", "invalid-input proof", "fresh install"]
  },
  {
    id: "library",
    title: "Library",
    appliesTo: ["library"],
    requiredChecks: ["unit", "types", "api-contract", "docs", "package", "release"],
    commands: ["npm test", "npm run test:coverage", "npm pack --dry-run"],
    evidence: ["public API docs", "type export proof", "package contents"]
  },
  {
    id: "data-pipeline",
    title: "Data Pipeline",
    appliesTo: ["data-pipeline"],
    requiredChecks: ["fixtures", "schema", "idempotency", "backfill", "observability", "security"],
    commands: ["npm test"],
    evidence: ["input/output fixtures", "schema validation", "idempotency proof", "retry proof"]
  },
  {
    id: "ai-agent-app",
    title: "AI Agent App",
    appliesTo: ["ai-agent"],
    requiredChecks: ["tool-boundaries", "evals", "memory-policy", "redaction", "approval-boundaries", "regression"],
    commands: ["npm run eval:run", "npm run security:scan", "npm test"],
    evidence: ["eval report", "tool permission matrix", "memory audit", "redaction proof"]
  },
  {
    id: "infrastructure",
    title: "Infrastructure",
    appliesTo: ["infra"],
    requiredChecks: ["plan", "policy", "secrets", "rollback", "drift", "cost"],
    commands: ["npm run infra:validate"],
    evidence: ["plan output", "secret boundary proof", "rollback runbook", "drift check"]
  },
  {
    id: "monorepo",
    title: "Monorepo",
    appliesTo: ["monorepo"],
    requiredChecks: ["workspace-install", "affected-tests", "package-boundaries", "ci-matrix", "release"],
    commands: ["npm test", "npm run test:coverage"],
    evidence: ["workspace graph", "affected package list", "CI matrix"]
  }
];

export function detectProjectProfile(options = {}) {
  const baseRoot = options.root || process.cwd();
  const projectRoot = resolveProjectRoot(baseRoot, options.projectPath || ".");
  const files = listFiles(projectRoot);
  const fileSet = new Set(files);
  const pkg = readJson(path.join(projectRoot, "package.json"), null);
  const deps = packageDeps(pkg);
  const scripts = Object.keys(pkg?.scripts || {}).sort();
  const languages = detectLanguages(files, fileSet);
  const frameworks = detectFrameworks({ projectRoot, files, fileSet, deps, scripts });
  const projectTypes = detectProjectTypes({ projectRoot, files, fileSet, deps, scripts, languages, frameworks, pkg });
  const profile = chooseProfile(projectTypes, frameworks);

  return {
    project: {
      name: pkg?.name || path.basename(projectRoot),
      root: projectRoot,
      relativeRoot: path.relative(baseRoot, projectRoot) || ".",
      package: pkg ? { name: pkg.name || null, version: pkg.version || null, type: pkg.type || null } : null
    },
    profile,
    secondaryProfiles: secondaryProfiles(projectTypes, profile.id),
    confidence: confidenceScore({ files, pkg, frameworks, projectTypes }),
    packageManager: detectPackageManager(fileSet),
    languages,
    frameworks,
    projectTypes,
    scripts,
    ci: files.filter((file) => file.startsWith(".github/workflows/") || file.startsWith(".gitlab-ci")),
    docs: ["README.md", "LICENSE", "SECURITY.md", "CONTRIBUTING.md", "CHANGELOG.md"].filter((file) => fileSet.has(file)),
    tests: files.filter((file) => isTestFile(file)).slice(0, 100),
    databases: detectDatabases({ files, fileSet, deps }),
    deployment: detectDeployment({ fileSet }),
    evidence: detectionEvidence({ fileSet, pkg, deps, frameworks, projectTypes, scripts }),
    warnings: detectionWarnings({ pkg, files, projectTypes })
  };
}

export function generateDefinitionOfDone(input = {}, options = {}) {
  const risk = normalizeRisk(input.risk || "medium");
  const objective = input.objective || "Complete the requested engineering task.";
  const detected = input.projectPath ? detectProjectProfile({ root: options.root || process.cwd(), projectPath: input.projectPath }) : null;
  const profile = findProfile(input.profile || detected?.profile.id || "library");
  const riskChecks = risk === "high" || risk === "critical"
    ? ["rollback plan", "security review", "release proof", "observability proof"]
    : risk === "medium"
      ? ["focused regression tests", "diff review", "docs update check"]
      : ["focused tests", "diff review"];
  return {
    objective,
    risk,
    profile: profile.id,
    title: profile.title,
    project: detected?.project || null,
    acceptanceCriteria: [
      "Implementation is scoped to the stated objective.",
      "Changed behavior is covered by automated tests.",
      "Failure and invalid-input paths are handled deliberately.",
      "Relevant docs or runbooks are updated.",
      "Final answer includes proof commands and remaining gaps."
    ],
    requiredChecks: [...new Set([...profile.requiredChecks, ...riskChecks])],
    recommendedCommands: profile.commands,
    evidenceRequired: profile.evidence,
    rollback: {
      required: risk === "high" || risk === "critical",
      expectation: "Describe how to revert or disable the change if verification fails."
    },
    stopConditions: [
      "Tests fail for an unknown reason.",
      "A required secret or external credential is missing.",
      "The change requires destructive production action without approval.",
      "The implementation drifts outside the stated objective."
    ]
  };
}

export function validateSdlcProfiles(profiles = SDLC_PROFILES) {
  const failures = [];
  const ids = new Set();
  for (const profile of profiles) {
    if (!profile.id) failures.push("profile missing id");
    if (ids.has(profile.id)) failures.push(`duplicate profile id: ${profile.id}`);
    ids.add(profile.id);
    for (const key of ["title", "appliesTo", "requiredChecks", "commands", "evidence"]) {
      if (profile[key] === undefined) failures.push(`${profile.id || "unknown"} missing ${key}`);
    }
    for (const key of ["appliesTo", "requiredChecks", "commands", "evidence"]) {
      if (!Array.isArray(profile[key]) || profile[key].length === 0) failures.push(`${profile.id} ${key} must be a non-empty array`);
    }
  }
  return {
    status: failures.length === 0 ? "passed" : "failed",
    profileCount: profiles.length,
    failures
  };
}

export function proveProfiles(options = {}) {
  const root = options.root || process.cwd();
  const fixtures = [
    {
      name: "next-web",
      files: {
        "package.json": JSON.stringify({ name: "next-web", dependencies: { next: "latest", react: "latest" }, scripts: { test: "node --test", build: "next build" } }),
        "next.config.js": "module.exports = {}\n",
        "tests/app.test.js": "test('ok', () => {})\n"
      },
      expected: "web-app"
    },
    {
      name: "fastapi-service",
      files: {
        "pyproject.toml": "[project]\ndependencies = ['fastapi']\n",
        "app/main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
        "tests/test_app.py": "def test_ok(): assert True\n"
      },
      expected: "backend-api"
    },
    {
      name: "mcp-tool",
      files: {
        "package.json": JSON.stringify({ name: "mcp-tool", dependencies: { "@modelcontextprotocol/sdk": "latest" }, scripts: { "mcp:smoke": "node smoke.mjs" } }),
        "apps/mcp-server/tools.json": JSON.stringify({ tools: [] })
      },
      expected: "mcp-server"
    }
  ];
  const temp = fs.mkdtempSync(path.join(realTmp(), "sage-profiles-proof-"));
  const results = [];
  for (const fixture of fixtures) {
    const fixtureRoot = path.join(temp, fixture.name);
    for (const [relativePath, content] of Object.entries(fixture.files)) {
      const target = path.join(fixtureRoot, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    const detected = detectProjectProfile({ root: temp, projectPath: fixture.name });
    results.push({
      fixture: fixture.name,
      expected: fixture.expected,
      actual: detected.profile.id,
      status: detected.profile.id === fixture.expected ? "passed" : "failed"
    });
  }
  return {
    status: results.every((result) => result.status === "passed") ? "passed" : "failed",
    root,
    fixtureRoot: temp,
    results
  };
}

export function proveProfilePaths(input = {}, options = {}) {
  const root = options.root || process.cwd();
  const rawPaths = [
    ...(Array.isArray(input.paths) ? input.paths : []),
    ...(process.env.SAGE_PROFILE_PROOF_PATHS || "")
      .split(path.delimiter)
      .map((item) => item.trim())
      .filter(Boolean)
  ];
  const uniquePaths = [...new Set(rawPaths)];
  const results = uniquePaths.map((projectPath) => {
    try {
      const detected = detectProjectProfile({ root, projectPath });
      return {
        projectPath,
        status: "passed",
        profile: detected.profile.id,
        confidence: detected.confidence,
        projectTypes: detected.projectTypes,
        warnings: detected.warnings
      };
    } catch (error) {
      return {
        projectPath,
        status: "failed",
        error: error.message
      };
    }
  });
  const fixtureProof = proveProfiles({ root });
  return {
    status: results.every((result) => result.status === "passed") && fixtureProof.status === "passed" ? "passed" : "failed",
    mode: uniquePaths.length > 0 ? "explicit-paths" : "fixtures-only",
    root,
    fixtureProof,
    results,
    note: uniquePaths.length > 0
      ? "Explicit real project paths were inspected."
      : "No SAGE_PROFILE_PROOF_PATHS or paths input provided; deterministic fixture proof was used."
  };
}

export function formatProfileOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  if (value.profile?.id) {
    return `Profile ${value.profile.id}: ${value.project.name}\nFrameworks: ${value.frameworks.join(", ") || "none"}\nTypes: ${value.projectTypes.join(", ") || "unknown"}\nConfidence: ${value.confidence}\n`;
  }
  if (value.acceptanceCriteria) {
    return `Definition of Done: ${value.title} (${value.risk})\n${value.requiredChecks.map((item) => `- ${item}`).join("\n")}\n`;
  }
  return `${JSON.stringify(value, null, 2)}\n`;
}

function detectFrameworks({ projectRoot, files, fileSet, deps, scripts }) {
  const frameworks = new Set();
  if (hasDep(deps, "next") || hasAny(fileSet, ["next.config.js", "next.config.mjs", "next.config.ts"])) frameworks.add("nextjs");
  if (hasDep(deps, "react")) frameworks.add("react");
  if (hasDep(deps, "vite") || files.some((file) => /^vite\.config\.[cm]?[jt]s$/.test(file))) frameworks.add("vite");
  if (hasDep(deps, "express")) frameworks.add("express");
  if (hasDep(deps, "@modelcontextprotocol/sdk") || fileSet.has("apps/mcp-server/tools.json") || scripts.some((script) => script.startsWith("mcp:"))) frameworks.add("mcp");
  if (hasDep(deps, "expo") || fileSet.has("app.json")) frameworks.add("expo");
  if (hasDep(deps, "react-native")) frameworks.add("react-native");
  if (pythonText(projectRoot).includes("fastapi")) frameworks.add("fastapi");
  if (pythonText(projectRoot).includes("django")) frameworks.add("django");
  if (fileSet.has("go.mod")) frameworks.add("go");
  if (fileSet.has("Cargo.toml")) frameworks.add("rust");
  if (fileSet.has("Package.swift")) frameworks.add("swift");
  return [...frameworks].sort();
}

function detectProjectTypes({ files, fileSet, deps, scripts, languages, frameworks, pkg }) {
  const types = new Set();
  if (frameworks.some((item) => ["nextjs", "react", "vite"].includes(item))) types.add("web-app");
  if (frameworks.some((item) => ["expo", "react-native", "swift"].includes(item)) || fileSet.has("ios") || fileSet.has("android")) types.add("mobile-app");
  if (frameworks.some((item) => ["express", "fastapi", "django"].includes(item)) || fileSet.has("go.mod") || fileSet.has("Cargo.toml")) types.add("backend-api");
  if (frameworks.includes("mcp")) types.add("mcp-server");
  if (pkg?.bin || files.some((file) => file.startsWith("bin/"))) types.add("cli-tool");
  if (pkg?.exports || fileSet.has("src/index.ts") || fileSet.has("src/index.js")) types.add("library");
  if (files.some((file) => /(^|\/)(pipelines?|etl|datasets?|notebooks?)\//.test(file))) types.add("data-pipeline");
  if (hasDep(deps, "openai") || hasDep(deps, "@anthropic-ai/sdk") || files.some((file) => /agents?|prompts?|evals?/.test(file))) types.add("ai-agent-app");
  if (files.some((file) => /^(infra|terraform|k8s|helm|docker-compose)/.test(file)) || hasAny(fileSet, ["Dockerfile", "docker-compose.yml"])) types.add("infrastructure");
  if (pkg?.workspaces || fileSet.has("pnpm-workspace.yaml") || fileSet.has("turbo.json") || fileSet.has("nx.json")) types.add("monorepo");
  if (types.size === 0 && languages.length > 0) types.add("library");
  return [...types].sort();
}

function chooseProfile(projectTypes, frameworks) {
  const order = ["mcp-server", "mobile-app", "web-app", "backend-api", "ai-agent-app", "infrastructure", "monorepo", "cli-tool", "data-pipeline", "library"];
  const id = order.find((candidate) => projectTypes.includes(candidate)) || (frameworks.includes("mcp") ? "mcp-server" : "library");
  return findProfile(id);
}

function secondaryProfiles(projectTypes, primaryId) {
  return projectTypes.filter((id) => id !== primaryId).map((id) => findProfile(id));
}

function findProfile(id) {
  const profile = SDLC_PROFILES.find((item) => item.id === id);
  if (!profile) throw new Error(`Unknown SDLC profile: ${id}`);
  return profile;
}

function confidenceScore({ files, pkg, frameworks, projectTypes }) {
  let score = 35;
  if (pkg) score += 15;
  if (frameworks.length > 0) score += 20;
  if (projectTypes.length > 0) score += 15;
  if (files.some((file) => isTestFile(file))) score += 10;
  if (files.some((file) => file === "README.md")) score += 5;
  return Math.min(100, score);
}

function detectLanguages(files, fileSet) {
  const languages = new Set();
  if (files.some((file) => /\.(mjs|cjs|js|jsx)$/.test(file))) languages.add("javascript");
  if (files.some((file) => /\.(ts|tsx)$/.test(file))) languages.add("typescript");
  if (files.some((file) => /\.py$/.test(file)) || fileSet.has("pyproject.toml")) languages.add("python");
  if (files.some((file) => /\.go$/.test(file)) || fileSet.has("go.mod")) languages.add("go");
  if (files.some((file) => /\.rs$/.test(file)) || fileSet.has("Cargo.toml")) languages.add("rust");
  if (files.some((file) => /\.swift$/.test(file)) || fileSet.has("Package.swift")) languages.add("swift");
  return [...languages].sort();
}

function detectDatabases({ files, fileSet, deps }) {
  const databases = new Set();
  if (hasDep(deps, "pg") || hasDep(deps, "postgres") || files.some((file) => /postgres|pg|schema\.sql/.test(file))) databases.add("postgres");
  if (hasDep(deps, "sqlite") || hasDep(deps, "better-sqlite3") || files.some((file) => /sqlite|schema\.sql/.test(file))) databases.add("sqlite");
  if (hasDep(deps, "mysql2") || hasDep(deps, "mysql")) databases.add("mysql");
  if (hasDep(deps, "prisma") || fileSet.has("prisma/schema.prisma")) databases.add("prisma");
  if (hasDep(deps, "drizzle-orm")) databases.add("drizzle");
  return [...databases].sort();
}

function detectDeployment({ fileSet }) {
  return {
    docker: hasAny(fileSet, ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"]),
    vercel: fileSet.has("vercel.json"),
    netlify: fileSet.has("netlify.toml"),
    fly: fileSet.has("fly.toml"),
    githubActions: [...fileSet].some((file) => file.startsWith(".github/workflows/"))
  };
}

function detectionEvidence({ fileSet, pkg, deps, frameworks, projectTypes, scripts }) {
  const evidence = [];
  if (pkg) evidence.push("package.json");
  for (const framework of frameworks) evidence.push(`framework:${framework}`);
  for (const type of projectTypes) evidence.push(`type:${type}`);
  for (const script of scripts) evidence.push(`script:${script}`);
  for (const file of ["pyproject.toml", "go.mod", "Cargo.toml", "Package.swift", "apps/mcp-server/tools.json", "Dockerfile"]) {
    if (fileSet.has(file)) evidence.push(file);
  }
  if (deps.size > 0) evidence.push(`dependencies:${deps.size}`);
  return evidence;
}

function detectionWarnings({ pkg, files, projectTypes }) {
  const warnings = [];
  if (!pkg && files.length === 0) warnings.push("No files found at project root.");
  if (!pkg && files.length > 0) warnings.push("No package.json found; detection is based on files only.");
  if (projectTypes.length === 0) warnings.push("No specific project type detected.");
  if (!files.some((file) => isTestFile(file))) warnings.push("No automated tests detected.");
  return warnings;
}

function resolveProjectRoot(root, projectPath) {
  const resolved = realPath(path.resolve(root, projectPath));
  const allowed = [root, ...allowedRoots()].map((item) => realPath(path.resolve(item)));
  if (!allowed.some((item) => resolved === item || resolved.startsWith(`${item}${path.sep}`))) {
    throw new Error(`Project path is outside allowed profile roots: ${allowed.join(", ")}`);
  }
  return resolved;
}

function allowedRoots() {
  return (process.env.SAGE_PROFILE_ALLOWED_ROOTS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full, base));
    } else {
      files.push(path.relative(base, full));
    }
  }
  return files.sort();
}

function packageDeps(pkg) {
  return new Set(Object.keys({ ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}), ...(pkg?.peerDependencies || {}) }));
}

function hasDep(deps, name) {
  return deps.has(name);
}

function hasAny(set, values) {
  return values.some((value) => set.has(value));
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function pythonText(projectRoot) {
  const chunks = [];
  for (const file of ["pyproject.toml", "requirements.txt", "Pipfile"]) {
    const target = path.join(projectRoot, file);
    if (fs.existsSync(target)) chunks.push(fs.readFileSync(target, "utf8").toLowerCase());
  }
  return chunks.join("\n");
}

function detectPackageManager(fileSet) {
  if (fileSet.has("pnpm-lock.yaml")) return "pnpm";
  if (fileSet.has("yarn.lock")) return "yarn";
  if (fileSet.has("bun.lockb")) return "bun";
  if (fileSet.has("package-lock.json")) return "npm";
  if (fileSet.has("package.json")) return "npm";
  return "unknown";
}

function isTestFile(file) {
  return /(^|\/)(tests?|__tests__)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /test_.*\.py$/.test(file);
}

function realPath(absolutePath) {
  try {
    return fs.realpathSync.native(absolutePath);
  } catch {
    return absolutePath;
  }
}

function realTmp() {
  return fs.realpathSync.native(process.env.TMPDIR || "/tmp");
}

function normalizeRisk(risk) {
  return ["low", "medium", "high", "critical"].includes(risk) ? risk : "medium";
}
