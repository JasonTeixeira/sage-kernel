import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createReviewReport } from "./review-report.mjs";

const IGNORED_DIRS = new Set([".git", "node_modules", ".sage-kernel", "dist", "build", "coverage", "generated"]);

export function inspectRepository(options = {}) {
  const root = options.root || process.cwd();
  const projectRoot = resolveProjectRoot(root, options.projectPath || ".");
  const files = listFiles(projectRoot);
  const pkg = readJson(path.join(projectRoot, "package.json"), {});
  const scripts = Object.keys(pkg.scripts || {}).sort();
  const docs = importantDocs(projectRoot);
  const ci = files.filter((file) => file.startsWith(".github/workflows/") && file.endsWith(".yml")).sort();
  const tests = files.filter((file) => /(^|\/)(tests?|__tests__)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file));
  const sourceFiles = files.filter((file) => /\.(mjs|js|ts|tsx|jsx|json|md)$/.test(file));

  return {
    project: {
      name: pkg.name || path.basename(projectRoot),
      root: projectRoot,
      relativeRoot: path.relative(root, projectRoot) || ".",
      package: pkg.name ? { name: pkg.name, version: pkg.version || null, type: pkg.type || null } : null
    },
    counts: {
      files: files.length,
      sourceFiles: sourceFiles.length,
      tests: tests.length,
      docs: docs.length,
      ci: ci.length
    },
    scripts,
    docs,
    ci,
    tests: tests.slice(0, 50),
    surfaces: {
      mcp: exists(projectRoot, "apps/mcp-server/tools.json") || files.some((file) => file.includes("mcp")),
      dashboard: exists(projectRoot, "apps/dashboard/server.mjs") || files.some((file) => file.includes("dashboard")),
      worker: exists(projectRoot, "apps/worker/jobs.json") || files.some((file) => file.includes("worker")),
      database: exists(projectRoot, "packages/db/schema.sql") || files.some((file) => file.includes("migrations")),
      agents: exists(projectRoot, "agents/AGENTS.md"),
      review: exists(projectRoot, "packages/review/review-report.mjs"),
      security: exists(projectRoot, "SECURITY.md") || scripts.some((script) => script.includes("security")),
      release: exists(projectRoot, "CHANGELOG.md") || scripts.some((script) => script.includes("release"))
    },
    packageManager: detectPackageManager(projectRoot),
    findings: inspectionFindings({ projectRoot, scripts, docs, ci, tests, files })
  };
}

export function auditArchitecture(options = {}) {
  const inspection = options.inspection || inspectRepository(options);
  const findings = [];
  if (!inspection.project.package) findings.push(finding("medium", "Missing package.json metadata.", "package.json"));
  if (!inspection.surfaces.mcp) findings.push(finding("medium", "No MCP or tool-control surface detected.", "apps/mcp-server"));
  if (!inspection.surfaces.review) findings.push(finding("low", "No review engine surface detected.", "packages/review"));
  if (inspection.counts.sourceFiles > 0 && inspection.counts.tests === 0) findings.push(finding("high", "Source files exist without automated tests.", "tests/"));
  return category("architecture", 100 - penalty(findings), findings);
}

export function auditCleanCode(options = {}) {
  const inspection = options.inspection || inspectRepository(options);
  const findings = [];
  const files = listFiles(inspection.project.root);
  const largeFiles = files
    .filter((file) => /\.(mjs|js|ts|tsx|jsx)$/.test(file))
    .map((file) => ({ file, lines: lineCount(path.join(inspection.project.root, file)) }))
    .filter((item) => item.lines > 500)
    .slice(0, 5);
  for (const item of largeFiles) findings.push(finding("low", `Large source file has ${item.lines} lines.`, item.file));
  if (!inspection.scripts.includes("test")) findings.push(finding("high", "No test script is declared.", "package.json"));
  if (!inspection.scripts.some((script) => script.includes("validate"))) findings.push(finding("medium", "No validation script is declared.", "package.json"));
  return category("clean_code", 100 - penalty(findings), findings);
}

export function auditTests(options = {}) {
  const inspection = options.inspection || inspectRepository(options);
  const findings = [];
  if (!inspection.scripts.includes("test")) findings.push(finding("high", "Missing npm test script.", "package.json"));
  if (!inspection.scripts.includes("test:coverage")) findings.push(finding("high", "Missing coverage gate script.", "package.json"));
  if (inspection.counts.tests === 0) findings.push(finding("high", "No automated test files detected.", "tests/"));
  if (!inspection.scripts.some((script) => script.includes("e2e"))) findings.push(finding("medium", "No E2E test script detected.", "package.json"));
  return category("testing", 100 - penalty(findings), findings);
}

export function auditSecurity(options = {}) {
  const inspection = options.inspection || inspectRepository(options);
  const findings = [];
  if (!inspection.docs.includes("SECURITY.md")) findings.push(finding("high", "Missing SECURITY.md policy.", "SECURITY.md"));
  if (!inspection.scripts.some((script) => script.includes("security"))) findings.push(finding("high", "Missing security scan script.", "package.json"));
  if (!inspection.scripts.includes("audit") && !inspection.scripts.some((script) => script.includes("release"))) {
    findings.push(finding("medium", "No dependency audit or release gate script detected.", "package.json"));
  }
  return category("security", 100 - penalty(findings), findings);
}

export function auditRelease(options = {}) {
  const inspection = options.inspection || inspectRepository(options);
  const findings = [];
  if (!inspection.docs.includes("README.md")) findings.push(finding("high", "Missing README.md.", "README.md"));
  if (!inspection.docs.includes("CHANGELOG.md")) findings.push(finding("medium", "Missing CHANGELOG.md.", "CHANGELOG.md"));
  if (!inspection.scripts.some((script) => script.includes("release"))) findings.push(finding("high", "Missing release validation script.", "package.json"));
  if (inspection.ci.length === 0) findings.push(finding("high", "Missing CI workflow.", ".github/workflows"));
  return category("release", 100 - penalty(findings), findings);
}

export function createReviewScore(options = {}) {
  const inspection = inspectRepository(options);
  const categories = [
    auditArchitecture({ inspection }),
    auditCleanCode({ inspection }),
    auditTests({ inspection }),
    auditSecurity({ inspection }),
    auditRelease({ inspection })
  ];
  const evidence = reviewEvidence(inspection, false);
  const remaining = categories.flatMap((item) => item.findings.map((finding) => finding.message));
  const report = createReviewReport({
    id: "review_local_score",
    project: reviewProject(inspection),
    objective: options.objective || "Score project engineering quality.",
    categories,
    evidence,
    remaining
  });
  return { inspection, report };
}

export function createReleaseProof(options = {}) {
  const result = createReviewScore({ ...options, objective: options.objective || "Prove release readiness." });
  const evidence = [
    ...result.report.evidence,
    ...["npm test", "npm run test:coverage", "npm run release:check"].map((command) => ({
      kind: "command",
      ref: command,
      status: result.inspection.scripts.includes(command.replace("npm run ", "")) || command === "npm test" ? "passed" : "warning",
      summary: "Command is part of the expected release proof path."
    }))
  ];
  const report = createReviewReport({
    ...result.report,
    id: "review_release_proof",
    objective: "Prove release readiness.",
    evidence
  });
  return { status: report.status, inspection: result.inspection, report };
}

export function formatReviewOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  if (value.report) {
    return `Review ${value.report.status}: ${value.report.score}/100\n${value.report.remaining.map((item) => `- ${item}`).join("\n")}\n`;
  }
  if (value.project) return `Project ${value.project.name}: ${value.counts.files} files, ${value.counts.tests} tests\n`;
  return `${JSON.stringify(value, null, 2)}\n`;
}

function reviewProject(inspection) {
  return {
    name: inspection.project.name,
    root: inspection.project.relativeRoot || ".",
    branch: gitOutput(inspection.project.root, ["branch", "--show-current"]) || undefined,
    commit: gitOutput(inspection.project.root, ["rev-parse", "--short", "HEAD"]) || undefined
  };
}

function reviewEvidence(inspection, release) {
  const refs = [
    ["command", "npm test", inspection.scripts.includes("test") ? "passed" : "warning"],
    ["command", "npm run test:coverage", inspection.scripts.includes("test:coverage") ? "passed" : "warning"],
    ["command", "npm run security:scan", inspection.scripts.includes("security:scan") ? "passed" : "warning"]
  ];
  if (release) refs.push(["command", "npm run release:check", inspection.scripts.includes("release:check") ? "passed" : "warning"]);
  return refs.map(([kind, ref, status]) => ({ kind, ref, status, summary: "Declared project command availability." }));
}

function inspectionFindings({ scripts, docs, ci, tests }) {
  const findings = [];
  if (!scripts.includes("test")) findings.push(finding("high", "Missing test script.", "package.json"));
  if (!scripts.includes("test:coverage")) findings.push(finding("high", "Missing coverage gate.", "package.json"));
  if (!docs.includes("README.md")) findings.push(finding("high", "Missing README.", "README.md"));
  if (!docs.includes("SECURITY.md")) findings.push(finding("high", "Missing security policy.", "SECURITY.md"));
  if (ci.length === 0) findings.push(finding("medium", "Missing CI workflow.", ".github/workflows"));
  if (tests.length === 0) findings.push(finding("high", "Missing automated tests.", "tests/"));
  return findings;
}

function resolveProjectRoot(root, projectPath) {
  const resolved = realPath(path.resolve(root, projectPath));
  const allowed = [root, ...allowedRoots()].map((item) => realPath(path.resolve(item)));
  if (!allowed.some((item) => resolved === item || resolved.startsWith(`${item}${path.sep}`))) {
    throw new Error(`Project path is outside allowed review roots: ${allowed.join(", ")}`);
  }
  return resolved;
}

function allowedRoots() {
  return (process.env.SAGE_REVIEW_ALLOWED_ROOTS || "")
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

function importantDocs(projectRoot) {
  return ["README.md", "LICENSE", "SECURITY.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "CHANGELOG.md"]
    .filter((file) => exists(projectRoot, file));
}

function detectPackageManager(projectRoot) {
  if (exists(projectRoot, "pnpm-lock.yaml")) return "pnpm";
  if (exists(projectRoot, "yarn.lock")) return "yarn";
  if (exists(projectRoot, "bun.lockb")) return "bun";
  if (exists(projectRoot, "package-lock.json")) return "npm";
  return "unknown";
}

function category(id, score, findings) {
  return { id, score: Math.max(0, Math.min(100, Math.round(score))), findings };
}

function finding(severity, message, evidence, recommendation = undefined) {
  return { severity, message, evidence, ...(recommendation ? { recommendation } : {}) };
}

function penalty(findings) {
  const weights = { info: 1, low: 4, medium: 8, high: 15, critical: 30 };
  return findings.reduce((sum, item) => sum + weights[item.severity], 0);
}

function exists(projectRoot, relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function lineCount(file) {
  try {
    return fs.readFileSync(file, "utf8").split("\n").length;
  } catch {
    return 0;
  }
}

function realPath(absolutePath) {
  try {
    return fs.realpathSync.native(absolutePath);
  } catch {
    return absolutePath;
  }
}

function gitOutput(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}
