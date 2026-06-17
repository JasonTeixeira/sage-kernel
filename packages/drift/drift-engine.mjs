import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REQUIRED_DIRS = [
  "apps/mcp-server",
  "apps/dashboard",
  "apps/worker",
  "packages/core",
  "packages/security",
  "packages/db",
  "packages/intelligence",
  "packages/review",
  "packages/drift",
  "tests",
  "docs",
  "agents",
  ".github/workflows"
];

const REQUIRED_DOCS = [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  "docs/MCP_SERVER.md",
  "docs/MCP_CLIENTS.md",
  "docs/ARCHITECTURE.md",
  "docs/SECURITY_MODEL.md"
];

const DEFAULT_ALLOWED_SCOPES = [
  ".github/**",
  "agents/**",
  "apps/**",
  "assets/**",
  "bin/**",
  "catalog/**",
  "docs/**",
  "examples/**",
  "packages/**",
  "scripts/**",
  "tests/**",
  ".env.example",
  "AGENTS.md",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "package.json",
  "package-lock.json"
];

const DEFAULT_DENIED_PATTERNS = [
  ".env",
  ".env.*",
  "**/.DS_Store",
  "**/*.pem",
  "**/*.key",
  "node_modules/**",
  ".sage-kernel/**",
  "coverage/**",
  "tmp/**"
];

const SOURCE_EXTENSIONS = new Set([".mjs", ".js", ".ts", ".tsx", ".jsx"]);

export function createDriftMap(options = {}) {
  const root = options.root || process.cwd();
  const pkg = readJson(path.join(root, "package.json"), {});
  const manifest = readJson(path.join(root, "apps/mcp-server/tools.json"), { tools: [] });
  const dispatcher = readText(path.join(root, "apps/mcp-server/src/kernel-tools.mjs"));
  const docsTools = readText(path.join(root, "docs/mcp-tools.md"));
  const guard = readText(path.join(root, "packages/security/guard.mjs"));
  const dashboardServer = readText(path.join(root, "apps/dashboard/server.mjs"));
  const manifestTools = (manifest.tools || []).map((tool) => tool.name).sort();
  const dispatcherTools = extractDispatcherTools(dispatcher);
  const safeActions = extractSetEntries(guard, "SAFE_ACTIONS").sort();
  const mutatingActions = extractSetEntries(guard, "MUTATING_ACTIONS").sort();
  const testFiles = listFiles(root)
    .filter((file) => /(^|\/)(tests?|__tests__)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file))
    .sort();
  const dashboardRoutes = extractDashboardRoutes(dashboardServer);
  const findings = [];

  if (manifestTools.length !== dispatcherTools.length) {
    findings.push(finding("high", "MCP manifest and dispatcher tool counts differ.", "apps/mcp-server/tools.json"));
  }
  for (const tool of manifestTools) {
    if (!dispatcherTools.includes(tool)) findings.push(finding("high", `MCP tool missing dispatcher case: ${tool}`, "apps/mcp-server/src/kernel-tools.mjs"));
    if (!docsTools.includes(tool)) findings.push(finding("medium", `MCP tool missing generated docs entry: ${tool}`, "docs/mcp-tools.md"));
  }
  for (const dir of REQUIRED_DIRS) {
    if (!fs.existsSync(path.join(root, dir))) findings.push(finding("medium", `Missing required architecture directory: ${dir}`, dir));
  }
  for (const doc of REQUIRED_DOCS) {
    if (!fs.existsSync(path.join(root, doc))) findings.push(finding("medium", `Missing required public document: ${doc}`, doc));
  }
  if (!pkg.scripts?.["test:coverage"]) findings.push(finding("high", "Missing test coverage script.", "package.json"));
  if (!pkg.scripts?.["drift:validate"]) findings.push(finding("high", "Missing drift validation script.", "package.json"));

  return {
    status: hasBlockingFindings(findings) ? "failed" : "passed",
    generatedAt: new Date().toISOString(),
    project: {
      name: pkg.name || path.basename(root),
      root,
      packageManager: detectPackageManager(root)
    },
    architecture: {
      requiredDirectories: REQUIRED_DIRS.map((dir) => ({ path: dir, exists: fs.existsSync(path.join(root, dir)) }))
    },
    mcp: {
      manifestTools: manifestTools.length,
      dispatcherTools: dispatcherTools.length,
      documentedTools: manifestTools.filter((tool) => docsTools.includes(tool)).length,
      tools: manifestTools
    },
    routes: {
      dashboardEndpoints: dashboardRoutes
    },
    docs: {
      required: REQUIRED_DOCS.map((doc) => ({ path: doc, exists: fs.existsSync(path.join(root, doc)) }))
    },
    tests: {
      files: testFiles.length,
      coverageScript: pkg.scripts?.["test:coverage"] || null,
      sample: testFiles.slice(0, 25)
    },
    permissions: {
      safeActions,
      mutatingActions
    },
    findings
  };
}

export function detectScopeCreep(options = {}) {
  const root = options.root || process.cwd();
  const allowedScopes = options.allowedScopes || DEFAULT_ALLOWED_SCOPES;
  const deniedPatterns = options.deniedPatterns || DEFAULT_DENIED_PATTERNS;
  const changed = options.changedFiles || changedFiles(root);
  const files = changed.length > 0 ? changed : listFiles(root);
  const testFiles = files.filter((file) => isTestFile(file));
  const findings = [];

  for (const file of files) {
    if (isGeneratedOrIgnored(file)) continue;
    if (!matchesAny(file, allowedScopes)) {
      findings.push(finding("high", `File is outside allowed scope: ${file}`, file));
    }
    if (matchesAny(file, deniedPatterns)) {
      findings.push(finding("critical", `File matches denied scope pattern: ${file}`, file));
    }
  }

  const productionChanges = files.filter((file) => isProductionSource(file));
  if (productionChanges.length > 0 && testFiles.length === 0 && !fs.existsSync(path.join(root, "tests"))) {
    findings.push(finding(
      "high",
      "Production source changed without matching test coverage in this scope.",
      productionChanges.slice(0, 5).join(", ")
    ));
  }

  return {
    status: hasBlockingFindings(findings) ? "failed" : "passed",
    generatedAt: new Date().toISOString(),
    allowedScopes,
    deniedPatterns,
    inspectedFiles: files.sort(),
    findings
  };
}

export function runSelfAudit(options = {}) {
  const root = options.root || process.cwd();
  const manifest = readJson(path.join(root, "apps/mcp-server/tools.json"), { tools: [] });
  const manifestTools = (manifest.tools || []).map((tool) => tool.name).sort();
  const dispatcherTools = extractDispatcherTools(readText(path.join(root, "apps/mcp-server/src/kernel-tools.mjs")));
  const docsTools = readText(path.join(root, "docs/mcp-tools.md"));
  const contracts = readJson(path.join(root, "apps/mcp-server/contracts/tools.snapshot.json"), { tools: [] });
  const contractTools = (contracts.tools || []).map((tool) => tool.name).sort();
  const guard = readText(path.join(root, "packages/security/guard.mjs"));
  const safeActions = extractSetEntries(guard, "SAFE_ACTIONS");
  const mutatingActions = extractSetEntries(guard, "MUTATING_ACTIONS");
  const pkg = readJson(path.join(root, "package.json"), {});
  const releaseCheck = readText(path.join(root, "scripts/release-check.mjs"));
  const checks = [
    parityCheck("mcp_manifest_dispatcher_parity", manifestTools, dispatcherTools, "MCP manifest tools match dispatcher cases."),
    parityCheck("mcp_contracts_parity", manifestTools, contractTools, "MCP manifest tools match generated contract snapshot."),
    docsCheck("mcp_docs_parity", manifestTools, docsTools),
    permissionCheck("mcp_permission_parity", manifest.tools || [], safeActions, mutatingActions),
    scriptCheck("package_drift_scripts", pkg.scripts || {}),
    releaseCheckIncludes("release_gate_drift", releaseCheck)
  ];
  const findings = checks.flatMap((check) => check.findings);
  return {
    status: hasBlockingFindings(findings) ? "failed" : "passed",
    generatedAt: new Date().toISOString(),
    checks,
    findings
  };
}

export function createDriftProof(options = {}) {
  const map = createDriftMap(options);
  const scope = detectScopeCreep(options);
  const audit = runSelfAudit(options);
  const findings = [...map.findings, ...scope.findings, ...audit.findings];
  return {
    status: hasBlockingFindings(findings) ? "failed" : "passed",
    generatedAt: new Date().toISOString(),
    map,
    scope,
    audit,
    findings,
    remaining: findings.map((item) => item.message)
  };
}

export function formatDriftOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  if (value.map && value.scope && value.audit) {
    const remaining = value.remaining.length ? `\n${value.remaining.map((item) => `- ${item}`).join("\n")}` : "";
    return `Drift proof ${value.status}${remaining}\n`;
  }
  if (value.findings) {
    const remaining = value.findings.length ? `\n${value.findings.map((item) => `- ${item.message}`).join("\n")}` : "";
    return `Drift ${value.status}${remaining}\n`;
  }
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parityCheck(id, expected, actual, summary) {
  const missing = expected.filter((item) => !actual.includes(item));
  const extra = actual.filter((item) => !expected.includes(item));
  const findings = [
    ...missing.map((item) => finding("high", `${id} missing: ${item}`, item)),
    ...extra.map((item) => finding("medium", `${id} extra: ${item}`, item))
  ];
  return { id, status: findings.length === 0 ? "passed" : "failed", summary, findings };
}

function docsCheck(id, tools, docs) {
  const findings = tools
    .filter((tool) => !docs.includes(tool))
    .map((tool) => finding("medium", `Generated MCP docs missing tool: ${tool}`, "docs/mcp-tools.md"));
  return { id, status: findings.length === 0 ? "passed" : "failed", summary: "Generated MCP docs cover every tool.", findings };
}

function permissionCheck(id, tools, safeActions, mutatingActions) {
  const findings = [];
  for (const tool of tools) {
    const action = tool.name.replace(/^kernel\./, "");
    if (tool.risk === "safe" && !safeActions.includes(action)) {
      findings.push(finding("high", `Safe MCP tool missing SAFE_ACTIONS entry: ${action}`, "packages/security/guard.mjs"));
    }
    if (tool.approvalRequired && safeActions.includes(action)) {
      findings.push(finding("critical", `Approval-required MCP tool is incorrectly safe-listed: ${action}`, "packages/security/guard.mjs"));
    }
    if ((tool.sideEffects || tool.approvalRequired) && !safeActions.includes(action) && !mutatingActions.includes(action)) {
      continue;
    }
  }
  return { id, status: findings.length === 0 ? "passed" : "failed", summary: "MCP tool risk metadata agrees with permission guard sets.", findings };
}

function scriptCheck(id, scripts) {
  const required = ["drift:map", "drift:scope", "drift:audit", "drift:prove", "drift:validate"];
  const findings = required
    .filter((script) => !scripts[script])
    .map((script) => finding("high", `Missing drift script: ${script}`, "package.json"));
  return { id, status: findings.length === 0 ? "passed" : "failed", summary: "Package scripts expose drift proof paths.", findings };
}

function releaseCheckIncludes(id, releaseCheck) {
  const findings = releaseCheck.includes("drift:validate")
    ? []
    : [finding("high", "Release check does not include drift:validate.", "scripts/release-check.mjs")];
  return { id, status: findings.length === 0 ? "passed" : "failed", summary: "Release gate executes drift validation.", findings };
}

function extractDispatcherTools(source) {
  return [...source.matchAll(/case\s+"(kernel\.[^"]+)"/g)].map((match) => match[1]).sort();
}

function extractSetEntries(source, setName) {
  const match = source.match(new RegExp(`const\\s+${setName}\\s*=\\s*new\\s+Set\\(\\[([\\s\\S]*?)\\]\\)`));
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractDashboardRoutes(source) {
  return [...new Set([...source.matchAll(/pathname\s*={2,3}\s*"([^"]+)"/g)].map((match) => match[1]))].sort();
}

function changedFiles(root) {
  const result = spawnSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.slice(3).trim().split(" -> ").pop())
    .filter(Boolean);
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", "node_modules", ".sage-kernel", "coverage", "generated"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full, base));
    } else {
      files.push(path.relative(base, full));
    }
  }
  return files.sort();
}

function isGeneratedOrIgnored(file) {
  return file.startsWith("node_modules/") || file.startsWith(".sage-kernel/") || file.startsWith("coverage/");
}

function isTestFile(file) {
  return /(^|\/)(tests?|__tests__)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

function isProductionSource(file) {
  return SOURCE_EXTENSIONS.has(path.extname(file)) && !isTestFile(file) && !file.startsWith("scripts/");
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => matchesPattern(file, pattern));
}

function matchesPattern(file, pattern) {
  if (pattern.endsWith("/**")) return file === pattern.slice(0, -3) || file.startsWith(pattern.slice(0, -2));
  if (pattern.startsWith("**/*")) return file.endsWith(pattern.slice(4));
  if (pattern.startsWith("**/")) return file.includes(pattern.slice(3));
  return file === pattern || file.startsWith(`${pattern}/`);
}

function detectPackageManager(root) {
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(root, "package-lock.json"))) return "npm";
  return "unknown";
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function finding(severity, message, evidence) {
  return { severity, message, evidence };
}

function hasBlockingFindings(findings) {
  return findings.some((item) => ["high", "critical"].includes(item.severity));
}
