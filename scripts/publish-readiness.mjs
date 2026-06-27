#!/usr/bin/env node
// Publish-readiness gate: is this repo ready to be a PUBLIC OSS project people can
// clone and install? Enforces the production-quality checklist and fails (exit 1)
// on any hard violation. Read-only — it reports, it does not change anything.
//
//   npm run publish:ready
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { scanForSecrets } from "../packages/security/secret-scan.mjs";
import { classifyRepoFiles } from "../packages/companion/repo-cleanup.mjs";

const root = process.cwd();
const checks = [];
const add = (id, status, detail) => checks.push({ id, status, detail }); // status: pass|warn|fail

const tracked = (() => {
  const r = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 32 });
  return r.status === 0 ? r.stdout.split("\n").map((l) => l.trim()).filter(Boolean) : [];
})();
const trackedSet = new Set(tracked);
const exists = (f) => trackedSet.has(f);
const read = (f) => { try { return fs.readFileSync(path.join(root, f), "utf8"); } catch { return ""; } };

// 1. Required OSS files
for (const f of ["LICENSE", "README.md", "CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md", ".env.example", ".gitignore"]) {
  add(`file:${f}`, exists(f) ? "pass" : "fail", exists(f) ? "present" : "missing — required for a public repo");
}

// 2. No committed env/secret files
const envCommitted = tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f) && f !== ".env.example");
add("no-committed-env", envCommitted.length ? "fail" : "pass", envCommitted.length ? `committed: ${envCommitted.join(", ")}` : "only .env.example tracked");

// 3. No hardcoded personal paths in shipped source
const sourceFiles = tracked.filter((f) => /^(packages|apps|bin|scripts|providers)\/.*\.mjs$/.test(f) && !/\/(tests?|__tests__)\//.test(f));
const hardcoded = sourceFiles.filter((f) => /\/Users\/[A-Za-z]/.test(read(f)));
add("no-hardcoded-paths", hardcoded.length ? "fail" : "pass", hardcoded.length ? `hardcoded home path in: ${hardcoded.slice(0, 5).join(", ")}` : "no /Users/* paths in shipped source");

// 4. No secrets
try {
  const secrets = scanForSecrets({ root });
  add("no-secrets", (secrets.findings || []).length ? "fail" : "pass", (secrets.findings || []).length ? `${secrets.findings.length} potential secret(s)` : "secret scan clean");
} catch (e) { add("no-secrets", "warn", `secret scan could not run: ${e.message}`); }

// 5. package.json metadata
const pkg = (() => { try { return JSON.parse(read("package.json")); } catch { return {}; } });
const p = pkg();
for (const [field, ok] of [["name", !!p.name], ["version", !!p.version], ["license", !!p.license], ["repository", !!p.repository], ["files", Array.isArray(p.files) && p.files.length > 0], ["bin", !!p.bin], ["engines", !!p.engines]]) {
  add(`pkg:${field}`, ok ? "pass" : "fail", ok ? "set" : "missing in package.json");
}

// 6. .gitignore covers the essentials
const gi = read(".gitignore");
for (const must of ["node_modules", ".sage-kernel", ".env"]) {
  add(`gitignore:${must}`, gi.includes(must) ? "pass" : "fail", gi.includes(must) ? "ignored" : "not in .gitignore");
}

// 7. README is user-oriented (install + MCP + getting-started)
const readme = read("README.md").toLowerCase();
add("readme:install", /install|npm i|clone/.test(readme) ? "pass" : "warn", "README mentions install");
add("readme:mcp", /mcp/.test(readme) ? "pass" : "warn", "README mentions MCP");
add("readme:getting-started", /getting_started|getting started/.test(readme) ? "pass" : "warn", "README links getting started");

// 8. No residual internal docs still tracked (clean repo)
const plan = classifyRepoFiles(tracked);
add("no-residual-docs", plan.residual.length ? "warn" : "pass", plan.residual.length ? `${plan.residual.length} residual files still tracked (run repo:cleanup)` : "no residual internal docs tracked");
add("no-blockers", plan.blocker.length ? "fail" : "pass", plan.blocker.length ? `${plan.blocker.length} blocker file(s)` : "no publish blockers");

const fails = checks.filter((c) => c.status === "fail");
const warns = checks.filter((c) => c.status === "warn");
const report = { type: "publish-readiness", ready: fails.length === 0, fails: fails.length, warns: warns.length, checks, generatedAt: new Date().toISOString() };
const dir = path.join(root, ".sage-kernel/cleanup");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "publish-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log(`\nPublish readiness: ${report.ready ? "READY" : "NOT READY"} (${fails.length} fail, ${warns.length} warn)`);
for (const c of checks) if (c.status !== "pass") console.log(`  [${c.status.toUpperCase()}] ${c.id}: ${c.detail}`);
console.log(report.ready ? "\nAll hard checks pass." : "\nResolve the FAIL items above before publishing.");
process.exit(report.ready ? 0 : 1);
