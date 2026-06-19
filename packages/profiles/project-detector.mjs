import fs from "node:fs";
import path from "node:path";
import { createProfileProofFixtures } from "./profile-fixtures.mjs";

const IGNORED_DIRS = new Set([".git", "node_modules", ".sage-kernel", "dist", "build", "coverage", "generated", ".next"]);
const CODE_FILE_PATTERN = /\.(mjs|cjs|js|jsx|ts|tsx|py|go|rs|swift|sql)$/;

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
    id: "saas-app",
    title: "SaaS App",
    appliesTo: ["nextjs", "auth", "billing", "tenant"],
    requiredChecks: ["install", "auth", "tenant-isolation", "billing", "unit", "e2e", "security", "release"],
    commands: ["npm test", "npm run test:coverage", "npm run security:scan"],
    evidence: ["auth boundary proof", "tenant isolation proof", "billing/webhook proof", "browser proof", "fresh install"]
  },
  {
    id: "admin-dashboard",
    title: "Admin Dashboard",
    appliesTo: ["dashboard", "admin", "privileged-actions"],
    requiredChecks: ["install", "auth", "authorization", "audit-log", "e2e", "accessibility", "security"],
    commands: ["npm test", "npm run test:coverage"],
    evidence: ["permission-denied proof", "audit log proof", "admin action review", "browser proof"]
  },
  {
    id: "browser-extension",
    title: "Browser Extension",
    appliesTo: ["extension", "manifest"],
    requiredChecks: ["manifest", "permissions", "unit", "e2e", "security", "package"],
    commands: ["npm test", "npm run test:coverage", "npm pack --dry-run"],
    evidence: ["manifest permission review", "content-script proof", "extension package proof"]
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
    id: "worker-service",
    title: "Worker Service",
    appliesTo: ["worker", "queue", "cron"],
    requiredChecks: ["install", "unit", "idempotency", "retry", "dead-letter", "observability", "stress"],
    commands: ["npm test", "npm run stress:queue -- --count=10000"],
    evidence: ["retry proof", "dead-letter proof", "idempotency proof", "queue stress proof"]
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
    id: "data-warehouse-dbt",
    title: "Data Warehouse / dbt",
    appliesTo: ["dbt", "warehouse", "analytics"],
    requiredChecks: ["schema", "lineage", "freshness", "idempotency", "backfill", "data-quality"],
    commands: ["npm test"],
    evidence: ["lineage proof", "freshness proof", "data quality report", "backfill replay proof"]
  },
  {
    id: "trading-system",
    title: "Trading System",
    appliesTo: ["trading", "market-data", "signals"],
    requiredChecks: ["data-integrity", "clock-skew", "replay", "risk-controls", "latency", "audit"],
    commands: ["npm test", "npm run test:coverage"],
    evidence: ["market data replay", "risk guard proof", "latency budget", "decision audit trail"]
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
    id: "ai-app",
    title: "AI App",
    appliesTo: ["ai", "llm", "prompt"],
    requiredChecks: ["evals", "prompt-injection", "pii-redaction", "latency", "cost", "regression"],
    commands: ["npm run eval:run", "npm run security:scan", "npm test"],
    evidence: ["eval report", "prompt-injection proof", "PII redaction proof", "cost/latency budget"]
  },
  {
    id: "llm-agent-platform",
    title: "LLM Agent Platform",
    appliesTo: ["agents", "tools", "memory", "orchestration"],
    requiredChecks: ["tool-boundaries", "approval-boundaries", "memory-policy", "redteam", "evals", "audit"],
    commands: ["npm run agents:eval", "npm run security:e2e", "npm test"],
    evidence: ["tool abuse proof", "memory poisoning proof", "agent eval report", "approval ledger"]
  },
  {
    id: "payments-system",
    title: "Payments System",
    appliesTo: ["stripe", "billing", "webhooks"],
    requiredChecks: ["webhook-signature", "idempotency", "replay", "auth", "audit", "live-mode-boundary"],
    commands: ["npm test", "npm run security:scan"],
    evidence: ["webhook signature proof", "duplicate delivery proof", "out-of-order proof", "test/live separation"]
  },
  {
    id: "healthcare-app",
    title: "Healthcare App",
    appliesTo: ["healthcare", "phi", "hipaa"],
    requiredChecks: ["phi-boundary", "access-control", "audit-log", "encryption", "retention", "security"],
    commands: ["npm test", "npm run security:scan"],
    evidence: ["PHI data-flow proof", "access audit proof", "retention policy", "security review"]
  },
  {
    id: "fintech-app",
    title: "Fintech App",
    appliesTo: ["fintech", "money", "kyc", "payments"],
    requiredChecks: ["money-movement-boundary", "audit-log", "idempotency", "auth", "risk-controls", "security"],
    commands: ["npm test", "npm run security:scan"],
    evidence: ["money movement audit", "risk control proof", "idempotency proof", "auth boundary proof"]
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
  const profileDecision = explainProfileDecision({ profile, projectTypes, frameworks, files, deps, scripts });

  return {
    project: {
      name: pkg?.name || path.basename(projectRoot),
      root: projectRoot,
      relativeRoot: path.relative(baseRoot, projectRoot) || ".",
      package: pkg ? { name: pkg.name || null, version: pkg.version || null, type: pkg.type || null } : null
    },
    profile,
    secondaryProfiles: secondaryProfiles(projectTypes, profile.id),
    confidence: confidenceScore({ files, pkg, frameworks, projectTypes, profileDecision }),
    profileDecision,
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
  const fixtures = createProfileProofFixtures();
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
  if (hasAnyFile(files, /(app|pages|src)\/(api\/)?(billing|subscription|stripe|checkout|tenant|auth)/) || hasDep(deps, "stripe") || hasDep(deps, "next-auth")) types.add("saas-app");
  if (hasAnyFile(files, /(^|\/)(admin|dashboard|operator|backoffice)\//) || scripts.some((script) => script.includes("dashboard"))) types.add("admin-dashboard");
  if (fileSet.has("manifest.json") || hasAnyFile(files, /(^|\/)(background|content-script|extension)\.[cm]?[jt]s$/)) types.add("browser-extension");
  if (frameworks.some((item) => ["expo", "react-native", "swift"].includes(item)) || fileSet.has("ios") || fileSet.has("android")) types.add("mobile-app");
  if (frameworks.some((item) => ["express", "fastapi", "django"].includes(item)) || fileSet.has("go.mod") || fileSet.has("Cargo.toml")) types.add("backend-api");
  if (hasAnyFile(files, /(^|\/)(workers?|queues?|cron|jobs?)\//) || scripts.some((script) => /worker|queue|jobs?/.test(script))) types.add("worker-service");
  if (frameworks.includes("mcp")) types.add("mcp-server");
  if (pkg?.bin || files.some((file) => file.startsWith("bin/"))) types.add("cli-tool");
  if (pkg?.exports || fileSet.has("src/index.ts") || fileSet.has("src/index.js")) types.add("library");
  if (files.some((file) => /(^|\/)(pipelines?|etl|datasets?|notebooks?)\//.test(file))) types.add("data-pipeline");
  if (fileSet.has("dbt_project.yml") || hasAnyFile(files, /(^|\/)(models|macros|snapshots)\/.*\.sql$/)) types.add("data-warehouse-dbt");
  if (hasCodeFile(files, /(^|\/)(trading|market-data|signals?|positions?|risk-engine|risk\/|orders\/)/)) types.add("trading-system");
  const hasAgentSurface = hasAnyFile(files, /(^|\/)(agents?|evals?)\//) || scripts.some((script) => /(^|:)(agents?|eval)(:|$)/.test(script));
  const hasAiSurface = hasDep(deps, "ai") || hasDep(deps, "openai") || hasDep(deps, "@anthropic-ai/sdk") || hasAnyFile(files, /prompts?|llm|completion|chat/);
  const hasAgentPlatformSurface = hasAnyFile(files, /(^|\/)(memory|tools|orchestration|council)\//);
  if (hasAgentSurface) types.add("ai-agent-app");
  if (hasAiSurface) types.add("ai-app");
  if (hasAgentSurface && hasAgentPlatformSurface && (types.has("ai-agent-app") || frameworks.includes("mcp"))) types.add("llm-agent-platform");
  if (hasDep(deps, "stripe") || hasCodeFile(files, /(^|\/)(stripe|checkout|webhooks?|billing)\//)) types.add("payments-system");
  if (hasCodeFile(files, /(^|\/)(healthcare|hipaa|phi|patient|medical)\//) || hasCodeFile(files, /(^|\/)src\/(patient|phi|medical)\//)) types.add("healthcare-app");
  if (hasCodeFile(files, /(^|\/)(fintech|kyc|ledger|wallet|banking)\//) || hasCodeFile(files, /(^|\/)src\/(ledger|wallet|kyc|money)\//)) types.add("fintech-app");
  if (files.some((file) => /^(infra|terraform|k8s|helm|docker-compose)/.test(file)) || hasAny(fileSet, ["Dockerfile", "docker-compose.yml"])) types.add("infrastructure");
  if (pkg?.workspaces || fileSet.has("pnpm-workspace.yaml") || fileSet.has("turbo.json") || fileSet.has("nx.json")) types.add("monorepo");
  if (types.size === 0 && languages.length > 0) types.add("library");
  return [...types].sort();
}

function chooseProfile(projectTypes, frameworks) {
  const id = PROFILE_PRIORITY.find((candidate) => projectTypes.includes(candidate)) || (frameworks.includes("mcp") ? "mcp-server" : "library");
  return findProfile(id);
}

const PROFILE_PRIORITY = [
    "payments-system",
    "healthcare-app",
    "fintech-app",
    "trading-system",
    "mcp-server",
    "llm-agent-platform",
    "mobile-app",
    "saas-app",
    "admin-dashboard",
    "browser-extension",
    "worker-service",
    "web-app",
    "backend-api",
    "ai-agent-app",
    "ai-app",
    "data-warehouse-dbt",
    "infrastructure",
    "monorepo",
    "cli-tool",
    "data-pipeline",
    "library"
];

function secondaryProfiles(projectTypes, primaryId) {
  return projectTypes.filter((id) => id !== primaryId).map((id) => findProfile(id));
}

function findProfile(id) {
  const profile = SDLC_PROFILES.find((item) => item.id === id);
  if (!profile) throw new Error(`Unknown SDLC profile: ${id}`);
  return profile;
}

function confidenceScore({ files, pkg, frameworks, projectTypes, profileDecision }) {
  let score = 35;
  if (pkg) score += 15;
  if (frameworks.length > 0) score += 20;
  if (projectTypes.length > 0) score += 15;
  if (files.some((file) => isTestFile(file))) score += 10;
  if (files.some((file) => file === "README.md")) score += 5;
  if (profileDecision?.ambiguous) score -= 10;
  if (profileDecision?.candidates?.[0]?.score < 60) score -= 10;
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
  for (const [name, script] of Object.entries(pkg?.scripts || {})) {
    if (/(rm\s+-rf|mkfs|diskutil\s+erase|dd\s+if=|shutdown|reboot)/i.test(String(script))) {
      warnings.push(`Potentially destructive package script detected: ${name}`);
    }
  }
  return warnings;
}

function explainProfileDecision({ profile, projectTypes, frameworks, files, deps, scripts }) {
  const candidates = [...new Set([...projectTypes, frameworks.includes("mcp") ? "mcp-server" : null, "library"].filter(Boolean))]
    .map((id) => ({
      id,
      score: profileEvidenceScore(id, { projectTypes, frameworks, files, deps, scripts }),
      priority: PROFILE_PRIORITY.indexOf(id) === -1 ? PROFILE_PRIORITY.length : PROFILE_PRIORITY.indexOf(id),
      reasons: profileReasons(id, { projectTypes, frameworks, files, deps, scripts })
    }))
    .sort((left, right) => right.score - left.score || left.priority - right.priority);
  const winner = candidates.find((candidate) => candidate.id === profile.id) || candidates[0] || { id: profile.id, score: 0, reasons: [] };
  const close = candidates.filter((candidate) => candidate.id !== winner.id && Math.abs(candidate.score - winner.score) <= 10);
  return {
    winner: winner.id,
    reason: winner.reasons.join("; ") || "Selected by fallback priority.",
    ambiguous: close.length > 0,
    closeCandidates: close.map((candidate) => candidate.id),
    candidates: candidates.slice(0, 8)
  };
}

function profileEvidenceScore(id, context) {
  let score = context.projectTypes.includes(id) ? 55 : 10;
  const reasons = profileReasons(id, context);
  score += Math.min(35, reasons.length * 10);
  if (id === "mcp-server" && context.frameworks.includes("mcp")) score += 15;
  if (id === "library" && context.projectTypes.length === 0) score += 20;
  return Math.min(100, score);
}

function profileReasons(id, { projectTypes, frameworks, files, deps, scripts }) {
  const reasons = [];
  if (projectTypes.includes(id)) reasons.push(`detected project type ${id}`);
  if (id === "mcp-server" && frameworks.includes("mcp")) reasons.push("MCP SDK/tool manifest/script detected");
  if (id === "web-app" && frameworks.some((item) => ["nextjs", "react", "vite"].includes(item))) reasons.push(`web framework: ${frameworks.join(", ")}`);
  if (id === "payments-system" && deps.has("stripe")) reasons.push("Stripe dependency detected");
  if (id === "cli-tool" && files.some((file) => file.startsWith("bin/"))) reasons.push("bin entrypoint detected");
  if (id === "worker-service" && scripts.some((script) => /worker|queue|jobs?/.test(script))) reasons.push("worker/queue script detected");
  if (id === "data-warehouse-dbt" && files.some((file) => file === "dbt_project.yml")) reasons.push("dbt_project.yml detected");
  if (id === "library" && projectTypes.length === 0) reasons.push("fallback for untyped code/documentation repository");
  return reasons;
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

function hasAnyFile(files, pattern) {
  return files.some((file) => pattern.test(file));
}

function hasCodeFile(files, pattern) {
  return files.some((file) => CODE_FILE_PATTERN.test(file) && pattern.test(file));
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
