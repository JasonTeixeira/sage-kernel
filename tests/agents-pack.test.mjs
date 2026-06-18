import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  createAgentsDoctorReport,
  __agentPackTestInternals,
  formatAgentsText,
  getAgentPack,
  installGlobalAgentPack,
  listAgentProfiles,
  validateAgentPack
} from "../packages/agents/agent-pack.mjs";
import {
  createAgentScorecard,
  evaluateAgentRuntime,
  listAgentRoles,
  reviewWithCouncil,
  runAgentTask,
  validateAgentRuntime
} from "../packages/agents/runtime.mjs";
import { kernelResources } from "../apps/mcp-server/src/kernel-resources.mjs";
import { createKernelRuntime } from "../packages/core/runtime.mjs";

const root = path.resolve(import.meta.dirname, "..");

function run(args, options = {}) {
  return spawnSync(args[0], args.slice(1), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
    ...options
  });
}

test("agent pack validates a senior engineering SDLC profile set", () => {
  const pack = getAgentPack({ root });
  const report = validateAgentPack({ root });

  assert.equal(report.status, "passed");
  assert.equal(pack.version, 1);
  assert.equal(pack.canonical.id, "sage-global-agents");
  assert.deepEqual(
    pack.profiles.map((profile) => profile.id).sort(),
    ["backend", "mcp", "mobile", "release", "security", "web"]
  );
  assert.equal(pack.checks.mustHaveRules.includes("evidence-before-claim"), true);
  assert.equal(pack.checks.mustHaveRules.includes("approval-before-risk"), true);
  assert.equal(pack.checks.requiredProfiles.includes("mobile"), true);
  assert.equal(pack.files.some((file) => file.relativePath === "agents/AGENTS.md"), true);
  assert.equal(report.coverage.globalAgentFile, true);
  assert.equal(report.coverage.profileCount, 6);
});

test("agent installer writes global files with backups, manifest, and doctor proof", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sage-agents-home-"));
  fs.writeFileSync(path.join(home, "AGENTS.md"), "# Existing agent rules\n");

  const install = installGlobalAgentPack({ root, home, force: true });
  assert.equal(install.status, "installed");
  assert.equal(install.target, path.join(home, "AGENTS.md"));
  assert.equal(fs.existsSync(path.join(home, "AGENTS.md")), true);
  assert.equal(fs.readFileSync(path.join(home, "AGENTS.md"), "utf8").includes("Sage Global Agent Operating System"), true);
  assert.equal(fs.existsSync(path.join(home, ".sage-kernel", "agents", "manifest.json")), true);
  assert.equal(install.backups.length, 1);
  assert.equal(fs.existsSync(install.backups[0]), true);

  const doctor = createAgentsDoctorReport({ root, home });
  assert.equal(doctor.status, "passed");
  assert.equal(doctor.checks.globalFile.status, "passed");
  assert.equal(doctor.checks.manifest.status, "passed");
  assert.equal(doctor.checks.profiles.status, "passed");

  const reinstall = installGlobalAgentPack({ root, home, force: false });
  assert.equal(reinstall.status, "installed");
  assert.deepEqual(reinstall.backups, []);
});

test("agent CLI supports validate, list, install, and doctor without touching real home", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sage-agents-cli-home-"));

  const validate = run(["node", "bin/sage.mjs", "agents", "validate", "--json"], {
    env: { ...process.env, SAGE_AGENT_HOME: home }
  });
  assert.equal(validate.status, 0, validate.stderr || validate.stdout);
  assert.equal(JSON.parse(validate.stdout).status, "passed");

  const list = run(["node", "bin/sage.mjs", "agents", "list", "--json"], {
    env: { ...process.env, SAGE_AGENT_HOME: home }
  });
  assert.equal(list.status, 0, list.stderr || list.stdout);
  const listed = JSON.parse(list.stdout);
  assert.equal(listed.profiles.length, 6);
  assert.equal(listed.profiles.some((profile) => profile.id === "web"), true);

  const install = run(["node", "bin/sage.mjs", "agents", "install", "--force", "--json"], {
    env: { ...process.env, SAGE_AGENT_HOME: home }
  });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  assert.equal(JSON.parse(install.stdout).status, "installed");

  const doctor = run(["node", "bin/sage.mjs", "agents", "doctor", "--json"], {
    env: { ...process.env, SAGE_AGENT_HOME: home }
  });
  assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
  assert.equal(JSON.parse(doctor.stdout).status, "passed");
});

test("agent MCP install is approval-gated and writes only to the selected home", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sage-agents-mcp-home-"));
  const runtime = createKernelRuntime({ root });
  await runtime.loadBuiltInTools();

  await assert.rejects(
    () => runtime.call("kernel.agents.install_global", { home, force: true }),
    /requires approval/i
  );

  const payload = { home, force: true };
  const approval = runtime.approvalLedger().request({
    action: "kernel.agents.install_global",
    reason: "install global agent pack in test home",
    payload
  });
  runtime.approvalLedger().approve({ id: approval.id, decidedBy: "agents-pack-test" });

  const installed = await runtime.call("kernel.agents.install_global", {
    ...payload,
    approvalId: approval.id
  });
  assert.equal(installed.status, "installed");
  assert.equal(installed.target, path.join(home, "AGENTS.md"));
  assert.equal(fs.existsSync(path.join(home, ".sage-kernel", "agents", "manifest.json")), true);
});

test("MCP resources expose the global agent pack read-only", () => {
  const globalResource = kernelResources.find((resource) => resource.uri === "sage://agents/global");
  const profilesResource = kernelResources.find((resource) => resource.uri === "sage://agents/profiles");
  const checksResource = kernelResources.find((resource) => resource.uri === "sage://agents/checks");

  assert.equal(globalResource.mimeType, "text/markdown");
  assert.match(globalResource.read(root), /Sage Global Agent Operating System/);

  const profiles = profilesResource.read(root);
  assert.equal(profiles.profiles.length, 6);
  assert.equal(profiles.profiles.some((profile) => profile.id === "security"), true);

  const checks = checksResource.read(root);
  assert.equal(checks.status, "passed");
  assert.equal(checks.coverage.profileCount, 6);
});

test("agent pack reports malformed source packs and protects existing global files", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "sage-agents-invalid-"));
  copyDir(path.join(root, "agents"), path.join(sandbox, "agents"));

  fs.writeFileSync(path.join(sandbox, "agents/AGENTS.md"), "# Wrong File\n");
  let report = validateAgentPack({ root: sandbox });
  assert.equal(report.status, "failed");
  assert.match(report.failures.join("\n"), /must identify/);

  assert.throws(
    () => installGlobalAgentPack({ root: sandbox, home: fs.mkdtempSync(path.join(os.tmpdir(), "sage-agent-home-invalid-")) }),
    /Agent pack validation failed/
  );

  fs.rmSync(path.join(sandbox, "agents/manifest.json"));
  report = validateAgentPack({ root: sandbox });
  assert.equal(report.status, "failed");
  assert.equal(report.coverage.globalAgentFile, false);
  assert.match(report.failures.join("\n"), /manifest\.json/);

  copyDir(path.join(root, "agents"), path.join(sandbox, "agents"));
  const manifestPath = path.join(sandbox, "agents/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = 2;
  manifest.id = "wrong-id";
  manifest.profiles = manifest.profiles.filter((item) => !item.endsWith("mobile.md"));
  manifest.mustHaveRules = ["missing-rule"];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.writeFileSync(path.join(sandbox, "agents/profiles/web.md"), "# Web\n\nRequired Checks\n");
  report = validateAgentPack({ root: sandbox });
  assert.match(report.failures.join("\n"), /version must be 1/);
  assert.match(report.failures.join("\n"), /id must be sage-global-agents/);
  assert.match(report.failures.join("\n"), /Missing required agent profile: mobile/);
  assert.match(report.failures.join("\n"), /missing required rule: missing-rule/);
  assert.match(report.failures.join("\n"), /web\.md missing Review Questions section/);

  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sage-agents-no-force-"));
  fs.writeFileSync(path.join(home, "AGENTS.md"), "# Existing different policy\n");
  assert.throws(
    () => installGlobalAgentPack({ root, home }),
    /already exists/
  );
  assert.equal(fs.existsSync(path.join(home, ".sage-kernel", "agents")), true);
});

test("agent text formatting covers profile, doctor, json, fallback, and env home branches", () => {
  const profiles = getAgentPack({ root }).profiles.map((profile) => ({
    id: profile.id,
    title: profile.text.split("\n")[0].slice(2)
  }));
  assert.match(formatAgentsText({ profiles }), /web\tWeb App Agent Profile/);
  assert.match(formatAgentsText({ status: "passed", checks: { sourcePack: { status: "passed" } } }), /sourcePack: passed/);
  assert.match(formatAgentsText({ ok: true }, { json: true }), /"ok": true/);
  assert.match(formatAgentsText({ ok: true }), /"ok": true/);
  assert.match(formatAgentsText({ profiles: [{ id: "empty", title: "Untitled" }] }), /empty\tUntitled/);

  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sage-agents-env-home-"));
  process.env.SAGE_AGENT_HOME = home;
  try {
    const install = installGlobalAgentPack({ root, force: true });
    assert.equal(install.home, home);
    const doctor = createAgentsDoctorReport({ root });
    assert.equal(doctor.home, home);
    assert.equal(doctor.status, "passed");
  } finally {
    delete process.env.SAGE_AGENT_HOME;
  }
});

test("agent doctor and listing cover missing install and no-heading profile branches", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "sage-agents-no-heading-"));
  copyDir(path.join(root, "agents"), path.join(sandbox, "agents"));
  const manifestPath = path.join(sandbox, "agents/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  fs.writeFileSync(path.join(sandbox, manifest.profiles[0]), "Required Checks\n\nReview Questions\n");

  const listed = listAgentProfiles({ root: sandbox });
  assert.equal(listed.profiles[0].title, "Untitled");

  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sage-agents-missing-install-"));
  const doctor = createAgentsDoctorReport({ root, home });
  assert.equal(doctor.status, "failed");
  assert.equal(doctor.checks.globalFile.status, "failed");
  assert.equal(doctor.checks.manifest.status, "failed");
  assert.equal(doctor.checks.profiles.status, "failed");
  assert.match(formatAgentsText(doctor), /Agent pack failed/);
});

test("agent pure internals cover home, headings, checks, hash, and timestamp branches", () => {
  const explicitHome = fs.mkdtempSync(path.join(os.tmpdir(), "sage-agents-explicit-home-"));
  assert.equal(__agentPackTestInternals.resolveAgentHome(explicitHome), explicitHome);
  assert.equal(__agentPackTestInternals.firstHeading("# Title\nBody"), "Title");
  assert.equal(__agentPackTestInternals.firstHeading("No heading"), "Untitled");
  assert.deepEqual(__agentPackTestInternals.check(true, ["unused"]), { status: "passed", failures: [] });
  assert.deepEqual(__agentPackTestInternals.check(false, ["missing"]), { status: "failed", failures: ["missing"] });
  assert.equal(__agentPackTestInternals.hash("abc").length, 64);
  assert.doesNotMatch(__agentPackTestInternals.timestamp(), /[:.]/);
});

test("agent runtime validates roles, runs bounded agents, and produces scorecards", () => {
  const validation = validateAgentRuntime({ root });
  assert.equal(validation.status, "passed");
  assert.equal(validation.roles.length >= 6, true);

  const roles = listAgentRoles({ root });
  assert.equal(roles.roles.some((role) => role.id === "architect"), true);
  assert.equal(roles.roles.some((role) => role.id === "security-engineer"), true);

  const task = runAgentTask({
    role: "reviewer",
    objective: "Review current project quality.",
    projectPath: "."
  }, { root });
  assert.equal(task.status, "passed");
  assert.equal(task.agent.id, "reviewer");
  assert.equal(task.permissions.allowedTools.includes("kernel.review.quality_score"), true);
  assert.equal(task.evidence.some((item) => item.kind === "review-report"), true);

  const scorecard = createAgentScorecard(task);
  assert.equal(scorecard.agent, "reviewer");
  assert.equal(scorecard.status, "passed");
  assert.equal(scorecard.metrics.policyCompliance, 100);
  assert.equal(scorecard.metrics.evidenceQuality >= 80, true);
});

test("agent council reviews merge findings, rank severity, and expose CLI/MCP proof", async () => {
  const council = reviewWithCouncil({
    objective: "Council review for release readiness.",
    projectPath: ".",
    roles: ["architect", "reviewer", "test-engineer", "security-engineer", "release-engineer"]
  }, { root });
  assert.equal(["pass", "pass-with-notes", "needs-work", "blocked"].includes(council.decision), true);
  assert.equal(council.council, "engineering-review");
  assert.equal(council.agents.length, 5);
  assert.equal(council.scorecards.length, 5);
  assert.equal(
    council.findings.every((finding, index, all) => index === 0 || severityRank(finding.severity) <= severityRank(all[index - 1].severity)),
    true
  );

  const agentCli = run(["node", "bin/sage.mjs", "agent", "run", "reviewer", ".", "--json"]);
  assert.equal(agentCli.status, 0, agentCli.stderr || agentCli.stdout);
  assert.equal(JSON.parse(agentCli.stdout).agent.id, "reviewer");

  const councilCli = run(["node", "bin/sage.mjs", "council", "review", ".", "--json"]);
  assert.equal(councilCli.status, 0, councilCli.stderr || councilCli.stdout);
  assert.equal(JSON.parse(councilCli.stdout).council, "engineering-review");

  const runtime = createKernelRuntime({ root });
  await runtime.loadBuiltInTools();
  const mcpAgent = await runtime.call("kernel.agent.run", { role: "reviewer", projectPath: ".", objective: "MCP review" });
  assert.equal(mcpAgent.agent.id, "reviewer");
  const mcpCouncil = await runtime.call("kernel.council.review", { projectPath: ".", roles: ["architect", "reviewer"] });
  assert.equal(mcpCouncil.agents.length, 2);
});

test("agent runtime rejects unknown roles and validates deterministic evals", () => {
  assert.throws(
    () => runAgentTask({ role: "unknown", objective: "bad" }, { root }),
    /Unknown agent role/
  );
  assert.throws(
    () => reviewWithCouncil({ roles: [] }, { root }),
    /requires at least one role/
  );
  const evalReport = evaluateAgentRuntime({ root });
  assert.equal(evalReport.status, "passed");
  assert.equal(evalReport.evals.every((item) => item.status === "passed"), true);
});

function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function severityRank(severity) {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[severity] ?? 0;
}
