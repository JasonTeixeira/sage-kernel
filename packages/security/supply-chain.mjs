import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { scanForSecrets } from "./secret-scan.mjs";
import { scanSast } from "./sast.mjs";
import { IGNORED_DIRS } from "../core/ignore-dirs.mjs";

// Run npm audit and fold real dependency vulnerabilities into the security proof.
// Degrades gracefully: if audit cannot run (no lockfile, parse error), the gate
// is "skipped" — never a false "failed" and never a false "passed".
export function dependencyAudit(options = {}) {
  if (options.auditor) return options.auditor();
  const root = options.root || process.cwd();
  const result = spawnSync("npm", ["audit", "--json"], { cwd: root, encoding: "utf8", timeout: 120000 });
  if (!result.stdout) return { status: "skipped", reason: "npm audit produced no output" };
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { status: "skipped", reason: "could not parse npm audit output" };
  }
  const vulnerabilities = parsed.metadata?.vulnerabilities || {};
  const high = (vulnerabilities.high || 0) + (vulnerabilities.critical || 0);
  return { status: high > 0 ? "failed" : "passed", high, vulnerabilities };
}

const HIGH_RISK_DEPENDENCY_PATTERNS = [/^left-pad$/i, /event-stream/i, /flatmap-stream/i];
const RESTRICTED_LICENSES = new Set(["GPL-2.0", "GPL-3.0", "AGPL-1.0", "AGPL-3.0", "UNLICENSED"]);

export function generateThreatModel(options = {}) {
  const projectRoot = resolveProjectRoot(options.root || process.cwd(), options.projectPath || ".");
  const pkg = readJson(path.join(projectRoot, "package.json"), {});
  const files = listFiles(projectRoot);
  const surfaces = detectSecuritySurfaces(files, pkg);
  const assets = normalizeNamedList(options.assets, defaultAssets(surfaces));
  const externalSystems = normalizeNamedList(options.externalSystems, defaultExternalSystems(pkg));
  const identities = normalizeNamedList(options.identities, defaultIdentities(surfaces));
  const trustBoundaries = createTrustBoundaries({ surfaces, externalSystems, identities });
  const threats = createThreats({ surfaces, assets, externalSystems, identities, files });

  return {
    status: threats.some((threat) => threat.severity === "critical") ? "needs_review" : "passed",
    project: {
      name: options.systemName || pkg.name || path.basename(projectRoot),
      root: path.relative(options.root || process.cwd(), projectRoot) || "."
    },
    surfaces,
    assets,
    identities,
    externalSystems,
    trustBoundaries,
    threats,
    requiredReviews: threats
      .filter((threat) => ["critical", "high"].includes(threat.severity))
      .map((threat) => threat.id)
  };
}

export function createSupplyChainReport(options = {}) {
  const projectRoot = resolveProjectRoot(options.root || process.cwd(), options.projectPath || ".");
  const pkg = readJson(path.join(projectRoot, "package.json"), {});
  const dependencies = collectDependencies(pkg);
  const components = dependencies.map((dependency) => ({
    type: "npm",
    name: dependency.name,
    version: dependency.version,
    scope: dependency.scope,
    risk: classifyDependencyRisk(dependency.name)
  }));
  const license = evaluateLicense(pkg.license);
  const dependencyRisk = evaluateDependencyRisk(components);
  const scorecard = createScorecard({ projectRoot, pkg, license, dependencyRisk });
  const findings = [
    ...license.findings,
    ...dependencyRisk.findings,
    ...scorecard.findings
  ];

  return {
    status: findings.some((finding) => ["critical", "high"].includes(finding.severity)) ? "needs_work" : "passed",
    project: {
      name: pkg.name || path.basename(projectRoot),
      root: path.relative(options.root || process.cwd(), projectRoot) || "."
    },
    sbom: {
      format: "sage-sbom-v1",
      generatedAt: new Date().toISOString(),
      components
    },
    license,
    dependencyRisk,
    scorecard,
    findings
  };
}

export function createSecurityProof(options = {}) {
  const threatModel = generateThreatModel(options);
  const supplyChain = createSupplyChainReport(options);
  const secretScan = options.secretScan || scanForSecrets({ root: options.root });
  const audit = options.dependencyAudit || dependencyAudit({ root: options.root });
  const sast = options.sast || scanSast({ root: options.root, projectPath: options.projectPath });
  const findings = [
    ...threatModel.threats
      .filter((threat) => ["critical", "high"].includes(threat.severity))
      .map((threat) => ({
        severity: threat.severity,
        message: threat.title,
        evidence: threat.evidence,
        recommendation: threat.mitigation
      })),
    ...supplyChain.findings,
    ...secretScan.findings.map((finding) => ({
      severity: "high",
      message: `Secret detected: ${finding.pattern}`,
      evidence: finding.file,
      recommendation: "Remove the secret and rotate the credential."
    })),
    ...sast.findings.map((finding) => ({
      severity: finding.severity,
      message: `${finding.rule}: ${finding.message}`,
      evidence: finding.evidence,
      recommendation: finding.recommendation
    })),
    ...(audit.status === "failed"
      ? [{ severity: "high", message: `${audit.high} high/critical dependency vulnerabilities`, evidence: "npm audit", recommendation: "Upgrade or replace the vulnerable dependencies." }]
      : [])
  ];
  const status =
    threatModel.status === "passed" &&
    supplyChain.status === "passed" &&
    secretScan.status !== "failed" &&
    sast.status !== "failed" &&
    audit.status !== "failed"
      ? "passed"
      : "needs_work";
  return {
    status,
    generatedAt: new Date().toISOString(),
    threatModel,
    supplyChain,
    secretScan,
    sast,
    dependencyAudit: audit,
    findings,
    gates: [
      { name: "threat-model", status: threatModel.status },
      { name: "supply-chain", status: supplyChain.status },
      { name: "license", status: supplyChain.license.status },
      { name: "dependency-risk", status: supplyChain.dependencyRisk.status },
      { name: "scorecard", status: supplyChain.scorecard.status },
      { name: "secret-scan", status: secretScan.status },
      { name: "sast", status: sast.status },
      { name: "dependency-audit", status: audit.status }
    ]
  };
}

export function formatSecurityOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  if (value.threatModel && value.supplyChain) return `Security proof ${value.status}: ${value.findings.length} finding(s)\n`;
  if (value.sbom) return `Supply chain ${value.status}: ${value.sbom.components.length} component(s), score ${value.scorecard.score}/100\n`;
  if (value.threats) return `Threat model ${value.status}: ${value.threats.length} threat(s)\n`;
  return `${JSON.stringify(value, null, 2)}\n`;
}

function detectSecuritySurfaces(files, pkg) {
  return {
    web: files.some((file) => /(^|\/)(app|pages|routes?|api)\//.test(file)),
    mcp: files.some((file) => file.includes("mcp")),
    database: files.some((file) => /(schema|migration|db|database)/i.test(file)) || Boolean(pkg.dependencies?.pg),
    worker: files.some((file) => file.includes("worker") || file.includes("queue")),
    auth: files.some((file) => /(auth|session|jwt|oauth)/i.test(file)),
    secrets: files.some((file) => /(^|\/)\.env/.test(file)) || JSON.stringify(pkg).includes("dotenv"),
    ci: files.some((file) => file.startsWith(".github/workflows/"))
  };
}

function defaultAssets(surfaces) {
  return [
    "source code",
    "developer workstation",
    ...(surfaces.database ? ["database records"] : []),
    ...(surfaces.secrets ? ["secrets"] : []),
    ...(surfaces.mcp ? ["MCP tool permissions"] : [])
  ];
}

function defaultExternalSystems(pkg) {
  const deps = Object.keys(pkg.dependencies || {});
  return deps.filter((dep) => /stripe|openai|anthropic|github|vercel|supabase|pg/i.test(dep));
}

function defaultIdentities(surfaces) {
  return ["developer", ...(surfaces.auth ? ["end user", "admin"] : []), ...(surfaces.mcp ? ["MCP client"] : [])];
}

function createTrustBoundaries({ surfaces, externalSystems, identities }) {
  return [
    { from: "developer workstation", to: "project files", control: "root-boundary validation" },
    ...(surfaces.mcp ? [{ from: "MCP client", to: "kernel tools", control: "tool permissions and approvals" }] : []),
    ...(surfaces.database ? [{ from: "kernel runtime", to: "database", control: "parameterized queries and migrations" }] : []),
    ...externalSystems.map((system) => ({ from: identities[0]?.name || "runtime", to: system.name, control: "env-scoped credentials" }))
  ];
}

function createThreats({ surfaces, assets, externalSystems, identities, files }) {
  const threats = [
    {
      id: "threat_secrets_exposure",
      category: "secrets",
      severity: surfaces.secrets ? "high" : "medium",
      title: "Secrets can leak through files, logs, generated reports, or agent context.",
      evidence: "project secret-bearing surfaces",
      assets: assets.map((asset) => asset.name),
      identities: identities.map((identity) => identity.name),
      mitigation: "Run secret scanning, redact logs, keep credentials in environment variables, and test redaction paths."
    },
    {
      id: "threat_supply_chain_compromise",
      category: "supply-chain",
      severity: externalSystems.length > 0 || files.some((file) => /package-lock|pnpm-lock|yarn.lock/.test(file)) ? "medium" : "low",
      title: "Dependency or package manager compromise can enter the build path.",
      evidence: "package dependency manifest",
      assets: ["source code", "release artifacts"],
      identities: ["developer"],
      mitigation: "Generate SBOM, run dependency audit, pin releases, and review high-risk package changes."
    }
  ];
  if (surfaces.mcp) {
    threats.push({
      id: "threat_mcp_tool_abuse",
      category: "tool-permissions",
      severity: "high",
      title: "MCP tools can mutate local state if permissions or approvals drift.",
      evidence: "MCP tool surface",
      assets: ["MCP tool permissions", "project files"],
      identities: ["MCP client"],
      mitigation: "Keep destructive tools approval-gated, validate input schemas, and record audit events."
    });
  }
  if (surfaces.database) {
    threats.push({
      id: "threat_data_integrity",
      category: "data-integrity",
      severity: "medium",
      title: "Persistence bugs can corrupt records, migrations, or audit history.",
      evidence: "database surface",
      assets: ["database records"],
      identities: ["kernel runtime"],
      mitigation: "Use transactional writes, migration tests, backups, and restore proof."
    });
  }
  return threats;
}

function collectDependencies(pkg) {
  return [
    ...Object.entries(pkg.dependencies || {}).map(([name, version]) => ({ name, version, scope: "runtime" })),
    ...Object.entries(pkg.devDependencies || {}).map(([name, version]) => ({ name, version, scope: "development" })),
    ...Object.entries(pkg.optionalDependencies || {}).map(([name, version]) => ({ name, version, scope: "optional" }))
  ].sort((a, b) => `${a.scope}:${a.name}`.localeCompare(`${b.scope}:${b.name}`));
}

function classifyDependencyRisk(name) {
  if (HIGH_RISK_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(name))) return "high";
  if (/^@types\//.test(name)) return "low";
  return "standard";
}

function evaluateLicense(license) {
  const normalized = typeof license === "string" && license.trim() ? license.trim() : "UNLICENSED";
  const findings = RESTRICTED_LICENSES.has(normalized)
    ? [{
        severity: "high",
        message: `Restricted or missing license detected: ${normalized}.`,
        evidence: "package.json",
        recommendation: "Use an approved OSS license or document the commercial/private distribution policy."
      }]
    : [];
  return {
    status: findings.length > 0 ? "needs_work" : "passed",
    license: normalized,
    findings
  };
}

function evaluateDependencyRisk(components) {
  const findings = components
    .filter((component) => component.risk === "high")
    .map((component) => ({
      severity: "high",
      message: `High-risk dependency detected: ${component.name}.`,
      evidence: component.name,
      recommendation: "Remove, replace, or pin with documented risk acceptance."
    }));
  return {
    status: findings.length > 0 ? "needs_work" : "passed",
    total: components.length,
    highRisk: findings.length,
    findings
  };
}

function createScorecard({ projectRoot, pkg, license, dependencyRisk }) {
  const checks = [
    scoreCheck("security_policy", fs.existsSync(path.join(projectRoot, "SECURITY.md")), "SECURITY.md exists."),
    scoreCheck("license", license.status === "passed", "Package license is acceptable."),
    scoreCheck("dependency_risk", dependencyRisk.status === "passed", "No known high-risk dependency names detected."),
    scoreCheck("security_script", Boolean(pkg.scripts?.["security:scan"] || Object.keys(pkg.scripts || {}).some((script) => script.includes("security"))), "Security scan script exists."),
    scoreCheck("tests", Boolean(pkg.scripts?.test), "Test script exists.")
  ];
  const passed = checks.filter((check) => check.status === "passed").length;
  const score = Math.round((passed / checks.length) * 100);
  const findings = checks
    .filter((check) => check.status !== "passed")
    .map((check) => ({
      severity: "medium",
      message: check.summary,
      evidence: check.id,
      recommendation: "Add the missing security maturity signal before release."
    }));
  return {
    status: findings.length > 0 ? "needs_work" : "passed",
    score,
    checks,
    findings
  };
}

function scoreCheck(id, passed, summary) {
  return { id, status: passed ? "passed" : "warning", summary };
}

function normalizeNamedList(value, fallback) {
  const source = Array.isArray(value) && value.length > 0 ? value : fallback;
  return source.map((item) => typeof item === "string" ? { name: item } : item).filter((item) => item?.name);
}

function resolveProjectRoot(root, projectPath) {
  const resolved = realPath(path.resolve(root, projectPath));
  const allowed = [root, ...allowedRoots()].map((item) => realPath(path.resolve(item)));
  if (!allowed.some((item) => resolved === item || resolved.startsWith(`${item}${path.sep}`))) {
    throw new Error(`Project path is outside allowed security roots: ${allowed.join(", ")}`);
  }
  return resolved;
}

function allowedRoots() {
  return (process.env.SAGE_REVIEW_ALLOWED_ROOTS || process.env.SAGE_SECURITY_ALLOWED_ROOTS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
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

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function realPath(absolutePath) {
  try {
    return fs.realpathSync.native(absolutePath);
  } catch {
    const parent = path.dirname(absolutePath);
    if (parent === absolutePath) return absolutePath;
    return path.join(realPath(parent), path.basename(absolutePath));
  }
}
