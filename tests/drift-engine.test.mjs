import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  createDriftMap,
  createDriftProof,
  detectScopeCreep,
  formatDriftOutput,
  runSelfAudit
} from "../packages/drift/drift-engine.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");

function run(args, options = {}) {
  return spawnSync(args[0], args.slice(1), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
    ...options
  });
}

test("drift map captures scope, architecture, tools, docs, tests, and permissions", () => {
  const map = createDriftMap({ root });
  assert.equal(map.status, "passed");
  assert.equal(map.project.name, "sage-kernel");
  assert.equal(map.architecture.requiredDirectories.every((item) => item.exists), true);
  assert.equal(map.mcp.manifestTools > 40, true);
  assert.equal(map.mcp.manifestTools, map.mcp.dispatcherTools);
  assert.equal(map.docs.required.every((item) => item.exists), true);
  assert.equal(map.tests.files >= 20, true);
  assert.equal(map.permissions.safeActions.includes("review.quality_score"), true);
});

test("scope creep detector flags out-of-policy paths, denied patterns, and missing tests", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "sage-drift-scope-"));
  fs.mkdirSync(path.join(sandbox, "src"), { recursive: true });
  fs.mkdirSync(path.join(sandbox, "tmp"), { recursive: true });
  fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ name: "scope-fixture", scripts: { test: "node --test" } }));
  fs.writeFileSync(path.join(sandbox, "src", "index.js"), "export const ok = true;\n");
  fs.writeFileSync(path.join(sandbox, "tmp", "scratch.js"), "console.log('scratch');\n");

  const report = detectScopeCreep({
    root: sandbox,
    allowedScopes: ["src", "tests", "package.json"],
    deniedPatterns: ["tmp/**"]
  });
  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => /outside allowed scope/.test(finding.message)), true);
  assert.equal(report.findings.some((finding) => /denied scope pattern/.test(finding.message)), true);
  assert.equal(report.findings.some((finding) => /without matching test coverage/.test(finding.message)), true);

  const missingRoot = path.join(sandbox, "missing-root");
  const emptyReport = detectScopeCreep({ root: missingRoot });
  assert.equal(emptyReport.status, "passed");
  assert.deepEqual(emptyReport.inspectedFiles, []);
});

test("self-audit compares implementation against docs, contracts, scripts, and permissions", () => {
  const audit = runSelfAudit({ root });
  assert.equal(audit.status, "passed");
  assert.equal(audit.checks.some((check) => check.id === "mcp_manifest_dispatcher_parity"), true);
  assert.equal(audit.checks.some((check) => check.id === "mcp_docs_parity"), true);
  assert.equal(audit.checks.some((check) => check.id === "release_gate_drift"), true);
});

test("drift engine reports stale contracts, docs, permissions, scripts, and missing files", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "sage-drift-stale-"));
  for (const dir of ["apps/mcp-server/src", "apps/mcp-server/contracts", "packages/security", "scripts"]) {
    fs.mkdirSync(path.join(sandbox, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({
    name: "stale-drift",
    scripts: {
      test: "node --test"
    }
  }));
  fs.writeFileSync(path.join(sandbox, "apps/mcp-server/tools.json"), JSON.stringify({
    tools: [
      { name: "kernel.safe.missing_guard", risk: "safe" },
      { name: "kernel.danger.safe_listed", risk: "mutating", approvalRequired: true }
    ]
  }));
  fs.writeFileSync(path.join(sandbox, "apps/mcp-server/src/kernel-tools.mjs"), 'case "kernel.extra.dispatcher":\n');
  fs.writeFileSync(path.join(sandbox, "apps/mcp-server/contracts/tools.snapshot.json"), JSON.stringify({
    tools: [{ name: "kernel.contract.only" }]
  }));
  fs.writeFileSync(path.join(sandbox, "packages/security/guard.mjs"), 'const SAFE_ACTIONS = new Set(["danger.safe_listed"]);\nconst MUTATING_ACTIONS = new Set([]);\n');
  fs.writeFileSync(path.join(sandbox, "scripts/release-check.mjs"), "const checks = [];\n");

  const map = createDriftMap({ root: sandbox });
  assert.equal(map.status, "failed");
  assert.equal(map.project.packageManager, "unknown");
  assert.equal(map.findings.some((finding) => /counts differ/.test(finding.message)), true);
  assert.equal(map.findings.some((finding) => /Missing test coverage script/.test(finding.message)), true);
  assert.equal(map.findings.some((finding) => /Missing drift validation script/.test(finding.message)), true);

  const audit = runSelfAudit({ root: sandbox });
  assert.equal(audit.status, "failed");
  assert.equal(audit.findings.some((finding) => /missing: kernel.safe.missing_guard/.test(finding.message)), true);
  assert.equal(audit.findings.some((finding) => /extra: kernel.extra.dispatcher/.test(finding.message)), true);
  assert.equal(audit.findings.some((finding) => /Generated MCP docs missing tool/.test(finding.message)), true);
  assert.equal(audit.findings.some((finding) => /missing SAFE_ACTIONS entry/.test(finding.message)), true);
  assert.equal(audit.findings.some((finding) => /incorrectly safe-listed/.test(finding.message)), true);
  assert.equal(audit.findings.some((finding) => /Missing drift script/.test(finding.message)), true);
  assert.equal(audit.findings.some((finding) => /Release check does not include drift:validate/.test(finding.message)), true);

  const proof = createDriftProof({ root: sandbox, changedFiles: ["apps/mcp-server/tools.json"] });
  assert.equal(proof.status, "failed");
  assert.match(formatDriftOutput(proof), /- MCP manifest and dispatcher tool counts differ/);
  assert.match(formatDriftOutput(map), /Drift failed/);
  assert.match(formatDriftOutput({ ok: true }, { json: true }), /"ok": true/);

  const malformed = fs.mkdtempSync(path.join(os.tmpdir(), "sage-drift-malformed-"));
  fs.writeFileSync(path.join(malformed, "package.json"), "{");
  const malformedMap = createDriftMap({ root: malformed });
  assert.equal(malformedMap.status, "failed");
  assert.equal(malformedMap.project.name, path.basename(malformed));
  assert.equal(malformedMap.project.packageManager, "unknown");
  assert.equal(malformedMap.mcp.manifestTools, 0);
  assert.equal(runSelfAudit({ root: malformed }).status, "failed");
});

test("drift CLI and MCP tools expose map, scope, self-audit, and proof flows", async () => {
  const map = run(["node", "bin/sage.mjs", "drift", "map", "--json"]);
  assert.equal(map.status, 0, map.stderr || map.stdout);
  assert.equal(JSON.parse(map.stdout).status, "passed");

  const scope = run(["node", "bin/sage.mjs", "drift", "scope", "--json"]);
  assert.equal(scope.status, 0, scope.stderr || scope.stdout);
  assert.equal(JSON.parse(scope.stdout).status, "passed");

  const audit = run(["node", "bin/sage.mjs", "drift", "audit", "--json"]);
  assert.equal(audit.status, 0, audit.stderr || audit.stdout);
  assert.equal(JSON.parse(audit.stdout).status, "passed");

  const proof = run(["node", "bin/sage.mjs", "drift", "prove", "--json"]);
  assert.equal(proof.status, 0, proof.stderr || proof.stdout);
  assert.equal(JSON.parse(proof.stdout).status, "passed");

  assert.match(formatDriftOutput(createDriftProof({ root })), /^Drift proof passed/);
  assert.match(formatDriftOutput({ ok: true }), /"ok": true/);

  assert.equal((await callKernelTool(root, "kernel.drift.map", {})).status, "passed");
  assert.equal((await callKernelTool(root, "kernel.drift.scope", {})).status, "passed");
  assert.equal((await callKernelTool(root, "kernel.drift.self_audit", {})).status, "passed");
  assert.equal((await callKernelTool(root, "kernel.drift.proof", {})).status, "passed");
});
