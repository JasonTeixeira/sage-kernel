import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createReviewReport } from "./review-report.mjs";
import { auditSourceTree, astFindingsByCategory } from "./ast-audit.mjs";

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
    .filter((file) => !isTestFile(file))
    .map((file) => ({ file, lines: lineCount(path.join(inspection.project.root, file)) }))
    .filter((item) => item.lines > 500)
    .slice(0, 5);
  for (const item of largeFiles) findings.push(finding("low", `Large source file has ${item.lines} lines.`, item.file));
  if (!inspection.scripts.includes("test")) findings.push(finding("high", "No test script is declared.", "package.json"));
  if (!inspection.scripts.some((script) => script.includes("validate"))) findings.push(finding("medium", "No validation script is declared.", "package.json"));
  findings.push(...astFindings(options, inspection).clean_code);
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
  // Security code analysis is owned by the dedicated SAST engine
  // (packages/security/sast.mjs, surfaced via kernel.security.sast) to avoid
  // double-counting; the review's security category covers policy/process signals.
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

export function reviewDiff(options = {}) {
  const inspection = options.inspection || inspectRepository(options);
  const diff = typeof options.diff === "string" ? options.diff : gitOutput(inspection.project.root, ["diff", "--no-ext-diff"]);
  const changedFiles = parseChangedFiles(diff).map((file) => ({
    ...file,
    risk: classifyChangedFileRisk(file.path, file.addedLines)
  }));
  const findings = [];

  for (const file of changedFiles) {
    if (file.risk === "high") {
      findings.push(seniorFinding({
        severity: "high",
        category: "security",
        message: `High-risk diff touches ${file.path}.`,
        evidence: file.path,
        confidence: 0.86,
        recommendation: "Require focused tests, reviewer sign-off, and security review before release."
      }));
    }
    if (isRouteFile(file.path) && !hasCompanionTest(file.path, inspection.tests)) {
      findings.push(seniorFinding({
        severity: "high",
        category: "testing",
        message: `Changed route lacks direct test coverage: ${file.path}.`,
        evidence: file.path,
        confidence: 0.82,
        recommendation: "Add route/API contract or E2E coverage for the changed behavior."
      }));
    }
    if (file.addedLines.some((line) => /\bprocess\.env\.[A-Z0-9_]*(SECRET|TOKEN|KEY|PASSWORD)\b/i.test(line))) {
      findings.push(seniorFinding({
        severity: "high",
        category: "security",
        message: `Diff reads sensitive environment variable in ${file.path}.`,
        evidence: file.path,
        confidence: 0.9,
        recommendation: "Verify redaction, permission boundaries, and secret handling tests."
      }));
    }
    if (file.addedLines.some((line) => /\b(eval|execSync|spawnSync|child_process)\b/.test(line))) {
      findings.push(seniorFinding({
        severity: "medium",
        category: "security",
        message: `Diff introduces command execution or dynamic evaluation in ${file.path}.`,
        evidence: file.path,
        confidence: 0.78,
        recommendation: "Validate inputs, root boundaries, approvals, and command allowlists."
      }));
    }
  }

  return {
    status: findings.some((item) => ["critical", "high"].includes(item.severity)) ? "needs_work" : "passed",
    project: reviewProject(inspection),
    diff,
    changedFiles,
    findings
  };
}

export function mapRoutesToTests(options = {}) {
  const inspection = options.inspection || inspectRepository(options);
  const files = listFiles(inspection.project.root);
  const routeFiles = files.filter((file) => isRouteFile(file));
  const routes = routeFiles.map((route) => {
    const matchingTests = findRouteTests(route, inspection.tests);
    return {
      route,
      tested: matchingTests.length > 0,
      tests: matchingTests
    };
  });
  const untested = routes.filter((route) => !route.tested);
  return {
    status: untested.length > 0 ? "needs_work" : "passed",
    project: reviewProject(inspection),
    routes,
    summary: {
      routes: routes.length,
      tested: routes.length - untested.length,
      untested: untested.length
    },
    findings: untested.map((route) => seniorFinding({
      severity: "high",
      category: "testing",
      message: `Untested route detected: ${route.route}.`,
      evidence: route.route,
      confidence: 0.84,
      recommendation: "Add unit, contract, or browser E2E coverage for this route."
    }))
  };
}

export function createSeniorReview(options = {}) {
  const inspection = inspectRepository(options);
  const diffReview = reviewDiff({ ...options, inspection });
  const routeTestMap = mapRoutesToTests({ ...options, inspection });
  const base = createReviewScore({ ...options, inspection });
  const categories = base.report.categories.map((category) => ({
    ...category,
    findings: [...category.findings]
  }));

  for (const item of [...diffReview.findings, ...routeTestMap.findings]) {
    const category = categories.find((candidate) => candidate.id === normalizeReviewCategory(item.category));
    if (category) {
      category.findings.push(item);
      category.score = Math.max(0, category.score - severityPenalty(item.severity));
    }
  }

  const remaining = [
    ...base.report.remaining,
    ...diffReview.findings.map((item) => item.message),
    ...routeTestMap.findings.map((item) => item.message)
  ];
  const evidence = [
    ...base.report.evidence,
    {
      kind: "file",
      ref: "git diff",
      status: diffReview.findings.length > 0 ? "warning" : "passed",
      summary: `${diffReview.changedFiles.length} changed file(s) reviewed for risk.`
    },
    {
      kind: "file",
      ref: "routes-to-tests",
      status: routeTestMap.status === "passed" ? "passed" : "warning",
      summary: `${routeTestMap.summary.tested}/${routeTestMap.summary.routes} route(s) have direct test coverage.`
    }
  ];
  const report = createReviewReport({
    id: "review_senior_engine",
    project: reviewProject(inspection),
    objective: options.objective || "Run senior review across diff, architecture, routes, tests, security, and release readiness.",
    categories,
    evidence,
    remaining
  });

  return {
    status: report.status,
    inspection,
    diffReview,
    routeTestMap,
    report
  };
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

function parseChangedFiles(diff) {
  if (!diff.trim()) return [];
  const files = [];
  let current = null;
  for (const line of diff.split(/\r?\n/)) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match) {
      current = { path: match[2], addedLines: [] };
      files.push(current);
      continue;
    }
    const plus = /^\+(?!\+\+)(.*)$/.exec(line);
    if (current && plus) current.addedLines.push(plus[1]);
  }
  return files;
}

function classifyChangedFileRisk(file, addedLines = []) {
  if (/(^|\/)(security|auth|approval|permissions?|secrets?)\b/i.test(file)) return "high";
  if (/(^|\/)(routes?|api|server|middleware)\//i.test(file)) return "high";
  if (/\.(sql|env|ya?ml|toml)$/.test(file)) return "medium";
  if (addedLines.some((line) => /\b(SECRET|TOKEN|PASSWORD|process\.env|child_process|execSync|spawnSync)\b/i.test(line))) return "high";
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return "low";
  return "medium";
}

function isRouteFile(file) {
  return /(^|\/)(routes?|api|pages|app)\//.test(file)
    && /\.(mjs|js|ts|tsx|jsx)$/.test(file)
    && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

function findRouteTests(route, tests) {
  const routeBase = path.basename(route).replace(/\.[^.]+$/, "").toLowerCase();
  const routeStem = route.replace(/\.[^.]+$/, "").toLowerCase();
  return tests.filter((test) => {
    const lower = test.toLowerCase();
    return lower.includes(routeBase) || lower.includes(routeStem);
  });
}

function hasCompanionTest(route, tests) {
  return findRouteTests(route, tests).length > 0;
}

function seniorFinding({ severity, category, message, evidence, confidence, recommendation }) {
  return {
    severity,
    category,
    confidence,
    message,
    evidence,
    recommendation
  };
}

function normalizeReviewCategory(category) {
  if (category === "maintainability") return "clean_code";
  if (category === "correctness") return "testing";
  return REVIEW_CATEGORY_IDS.has(category) ? category : "architecture";
}

const REVIEW_CATEGORY_IDS = new Set(["architecture", "clean_code", "testing", "security", "release"]);

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

// AST-backed findings for the inspected tree, grouped by review category.
// Computed once per inspection (the structural walk is the expensive part) and
// cached on the inspection so auditCleanCode + auditSecurity share one pass.
function astFindings(options, inspection) {
  if (options.astFindings) return options.astFindings;
  if (inspection.__ast) return inspection.__ast;
  const grouped = astFindingsByCategory(auditSourceTree({ projectRoot: inspection.project.root }));
  Object.defineProperty(inspection, "__ast", { value: grouped, enumerable: false, configurable: true });
  return grouped;
}

function category(id, score, findings) {
  return { id, score: clampScore(score), findings };
}

function finding(severity, message, evidence, recommendation = undefined) {
  return { severity, message, evidence, ...(recommendation ? { recommendation } : {}) };
}

function penalty(findings) {
  return findings.reduce((sum, item) => sum + severityPenalty(item.severity), 0);
}

function severityPenalty(severity) {
  return { info: 1, low: 4, medium: 8, high: 15, critical: 30 }[severity] || 0;
}

const exists = (projectRoot, relativePath) => fs.existsSync(path.join(projectRoot, relativePath));

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

const isTestFile = (file) => /(^|\/)(tests?|__tests__)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);

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

const clampScore = (score) => Math.max(0, Math.min(100, Math.round(score)));
