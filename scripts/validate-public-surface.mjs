import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  "docs/INSTALL.md",
  "docs/USAGE.md",
  "docs/ARCHITECTURE.md",
  "docs/VISUAL_GUIDE.md",
  "docs/MCP_SERVER.md",
  "docs/MCP_CLIENTS.md",
  "docs/SECURITY_MODEL.md",
  "docs/RELEASE_PROCESS.md",
  "assets/sage-kernel-architecture.svg",
  "assets/sage-kernel-workflow.svg",
  ".github/workflows/ci.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/feature_request.md"
];

const requiredPackageFiles = [
  "apps/mcp-server",
  "apps/worker",
  "assets",
  "bin",
  "catalog",
  "docs",
  "packages",
  "scripts",
  ".env.example",
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md"
];

export function validatePublicSurface(options = {}) {
  const workspace = options.root || root;
  const failures = [];

  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(workspace, file))) failures.push(`Missing public file: ${file}`);
  }

  const pkg = readJson(path.join(workspace, "package.json"), failures, "package.json");
  if (pkg) {
    if (pkg.private !== undefined) failures.push("package.json must not set private for public release packaging");
    if (pkg.license !== "MIT") failures.push("package.json license must be MIT");
    if (!pkg.repository?.url) failures.push("package.json repository.url is required");
    if (!pkg.bin?.sage) failures.push("package.json must expose the sage binary");
    if (!Array.isArray(pkg.files)) {
      failures.push("package.json files allowlist is required");
    } else {
      for (const file of requiredPackageFiles) {
        if (!pkg.files.includes(file)) failures.push(`package.json files allowlist missing: ${file}`);
      }
    }
  }

  const markdownFiles = listFiles(workspace, [".md"], new Set(["node_modules", ".git", ".sage-kernel", "generated"]));
  for (const file of markdownFiles) {
    failures.push(...validateMarkdownLinks(workspace, file));
  }

  return {
    status: failures.length === 0 ? "passed" : "failed",
    checked: {
      requiredFiles: requiredFiles.length,
      requiredPackageFiles: requiredPackageFiles.length,
      markdownFiles: markdownFiles.length
    },
    failures
  };
}

export function validateMarkdownLinks(workspace, file) {
  const fullPath = path.join(workspace, file);
  const body = fs.readFileSync(fullPath, "utf8");
  const failures = [];
  const linkPattern = /!?\[[^\]]*]\(([^)]+)\)/g;
  let match;

  while ((match = linkPattern.exec(body))) {
    const rawTarget = match[1].trim();
    const target = rawTarget.replace(/^<|>$/g, "").split("#")[0].split("?")[0];
    if (!target || isExternalTarget(target)) continue;
    if (target.startsWith("/")) continue;
    const resolved = path.resolve(path.dirname(fullPath), decodeURIComponent(target));
    if (!resolved.startsWith(workspace)) {
      failures.push(`${file} links outside workspace: ${rawTarget}`);
      continue;
    }
    if (!fs.existsSync(resolved)) failures.push(`${file} links to missing file: ${rawTarget}`);
  }

  return failures;
}

function isExternalTarget(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#");
}

function listFiles(dir, extensions, ignoredDirs, base = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, extensions, ignoredDirs, base));
      continue;
    }
    if (extensions.includes(path.extname(entry.name))) files.push(path.relative(base, fullPath));
  }
  return files.sort();
}

function readJson(file, failures, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    failures.push(`Invalid ${label}: ${error.message}`);
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validatePublicSurface({ root });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "passed" ? 0 : 1);
}
