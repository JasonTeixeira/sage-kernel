import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createSqliteAdapter } from "../packages/db/adapter.mjs";
import { createApprovalLedger } from "../packages/security/approvals.mjs";
import { callToolCli } from "../apps/mcp-server/scripts/call-tool.mjs";
import { __kernelToolsTestInternals, callKernelTool, toMcpTextContent } from "../apps/mcp-server/src/kernel-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");

function tempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-tools-"));
  for (const item of ["catalog", "packages/qa", "packages/infra", "packages/db", "packages/intelligence/adapters", "packages/intelligence/runbooks", "apps/worker", "apps/mcp-server", "agents/profiles"]) {
    fs.mkdirSync(path.join(dir, item), { recursive: true });
  }
  for (const file of [
    "package.json",
    "catalog/phases.json",
    "catalog/repos.json",
    "catalog/modules.json",
    "catalog/templates.json",
    "catalog/integrations.json",
    "packages/qa/profiles.json",
    "packages/infra/env-contract.json",
    "packages/infra/deploy-targets.json",
    "packages/infra/readiness-checks.json",
	    "packages/db/schema.sql",
	    "packages/intelligence/adapters/optional-adapters.json",
    "packages/intelligence/runbooks/release-readiness.json",
	    "apps/worker/jobs.json",
    "apps/mcp-server/tools.json",
    "agents/AGENTS.md",
    "agents/manifest.json",
    "agents/profiles/web.md",
    "agents/profiles/mobile.md",
    "agents/profiles/backend.md",
    "agents/profiles/mcp.md",
    "agents/profiles/security.md",
    "agents/profiles/release.md"
  ]) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  }
  return dir;
}

test("MCP dispatcher covers catalog, template, QA, infra, deploy, dashboard, and format helpers", async () => {
  const sandbox = tempRoot();

  assert.equal((await callKernelTool(sandbox, "kernel.phase.status", {})).length, 8);
  assert.equal((await callKernelTool(sandbox, "kernel.template.list", {})).length > 0, true);
  assert.equal((await callKernelTool(sandbox, "kernel.catalog.search", { query: "qa", limit: 2 })).length <= 2, true);

  const qaProfile = await callKernelTool(sandbox, "kernel.qa.profile", { template: "next-saas-app" });
  assert.equal(qaProfile.template.id, "next-saas-app");
  const qaPlan = await callKernelTool(sandbox, "kernel.qa.plan", { template: "next-saas-app", mode: "deep" });
  assert.equal(qaPlan.mode, "deep");
  assert.equal(qaPlan.runners.length >= qaProfile.profile.fast.length, true);

  const infra = await callKernelTool(sandbox, "kernel.infra.plan", { template: "next-saas-app", target: "vercel" });
  assert.equal(infra.template, "next-saas-app");
  const deploy = await callKernelTool(sandbox, "kernel.deploy.prepare", { template: "next-saas-app", target: "vercel" });
  assert.equal(deploy.status, "prepared");

  const dashboard = await callKernelTool(sandbox, "kernel.dashboard.snapshot", {});
  assert.equal(dashboard.version, "0.3.0");

  const semanticIndex = await callKernelTool(sandbox, "kernel.semantic.index_project", { projectPath: ".", limit: 100 });
  assert.equal(semanticIndex.totals.files > 0, true);
  const semanticSearch = await callKernelTool(sandbox, "kernel.semantic.search_symbol", { query: "version", limit: 5 });
  assert.equal(semanticSearch.results.length > 0, true);
  const semanticSummary = await callKernelTool(sandbox, "kernel.semantic.summarize_module", { file: "package.json" });
  assert.equal(semanticSummary.language, "json");
  const semanticReferences = await callKernelTool(sandbox, "kernel.semantic.find_references", { query: "version", limit: 5 });
  assert.equal(semanticReferences.results.length > 0, true);
  const adapters = await callKernelTool(sandbox, "kernel.adapters.list", {});
  assert.equal(adapters.adapters.some((adapter) => adapter.id === "adapter_semantic_local"), true);
  assert.equal(adapters.summary.total, 3);
  const agentProfiles = await callKernelTool(sandbox, "kernel.agents.list", {});
  assert.equal(agentProfiles.profiles.length, 6);
  const agentValidation = await callKernelTool(sandbox, "kernel.agents.validate", {});
  assert.equal(agentValidation.status, "passed");
  const agentDoctor = await callKernelTool(sandbox, "kernel.agents.doctor", { home: fs.mkdtempSync(path.join(os.tmpdir(), "sage-agent-doctor-")) });
  assert.equal(agentDoctor.status, "failed");
  const runbooks = await callKernelTool(sandbox, "kernel.runbooks.list", {});
  assert.equal(runbooks.runbooks.length > 0, true);
  const dayPlan = await callKernelTool(sandbox, "kernel.runbooks.plan_day", { objective: "test cockpit" });
  assert.equal(dayPlan.objective, "test cockpit");
  assert.equal(dayPlan.steps.length > 0, true);
  const adr = await callKernelTool(sandbox, "kernel.runbooks.generate_adr", { title: "Test ADR", decision: "Use safe tools." });
  assert.match(adr.markdown, /# ADR: Test ADR/);
  const runbookPayload = {
    runbook: "runbook_daily_release_readiness",
    step: "inspect_state",
    dryRun: true
  };
  await assert.rejects(() => callKernelTool(sandbox, "kernel.runbooks.execute_step", runbookPayload), /requires approval/);
  const runbookDb = createSqliteAdapter({ root: sandbox, schemaRoot: root });
  runbookDb.init();
  const runbookLedger = createApprovalLedger({ db: runbookDb, signer: "test-signer" });
  const runbookApproval = runbookLedger.request({
    action: "runbooks.execute_step",
    reason: "execute dry-run runbook step through MCP",
    payload: runbookPayload
  });
  runbookLedger.approve({ id: runbookApproval.id, decidedBy: "tester" });
  const execution = await callKernelTool(sandbox, "kernel.runbooks.execute_step", {
    ...runbookPayload,
    approvalId: runbookApproval.id
  });
  assert.equal(execution.status, "planned");

  const content = toMcpTextContent({ ok: true });
  assert.equal(content.content[0].type, "text");
  assert.match(content.content[0].text, /"ok": true/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.unknown", {}), /Unknown tool/);
  const db = createSqliteAdapter({ root: sandbox, schemaRoot: root });
  db.init();
  const ledger = createApprovalLedger({ db, signer: "test-signer" });
  const approval = ledger.request({ action: "fake_manifest_only", reason: "cover dispatcher default", payload: {} });
  ledger.approve({ id: approval.id, decidedBy: "tester" });
  __kernelToolsTestInternals.knownKernelToolNames.add("kernel.fake_manifest_only");
  try {
    await assert.rejects(() => callKernelTool(sandbox, "kernel.fake_manifest_only", { approvalId: approval.id }), /Unknown tool/);
  } finally {
    __kernelToolsTestInternals.knownKernelToolNames.delete("kernel.fake_manifest_only");
  }
});

test("MCP dispatcher validates required input and unknown catalog references", async () => {
  const sandbox = tempRoot();

  await assert.rejects(() => callKernelTool(sandbox, "kernel.catalog.search", {}), /requires input.query/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.project.plan", {}), /requires input.template/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.project.plan", { template: "missing" }), /Unknown template/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.qa.profile", {}), /requires input.template/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.infra.plan", {}), /requires input.template/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.deploy.prepare", {}), /requires input.template/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.repo.inspect", {}), /requires input.repo/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.jobs.run", {}), /requires input.job/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.jobs.enqueue", {}), /requires input.job/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.approvals.request", {}), /requires input.action and input.reason/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.approvals.approve", {}), /requires input.id/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.semantic.search_symbol", {}), /requires input.query/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.semantic.find_references", {}), /requires input.query/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.semantic.summarize_module", {}), /requires input.file/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.semantic.index_project", { projectPath: ".." }), /outside the semantic project root/);
});

test("MCP dispatcher handles optional source roots and warehouse configuration", async () => {
  const sandbox = tempRoot();

  await assert.rejects(() => callKernelTool(sandbox, "kernel.repo.inspect", { repo: "nexural-platform-kits" }), /source root is not configured/);
  await assert.rejects(() => callKernelTool(sandbox, "kernel.warehouse.search", { query: "agent" }), /AI Warehouse source root is not configured/);

  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-source-"));
  const repoDir = path.join(sourceRoot, "nexural-platform-kits");
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, "package.json"), JSON.stringify({ name: "nexural-platform-kits" }));
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Source Repo\n");
  process.env.SAGE_KERNEL_SOURCE_ROOT = sourceRoot;
  try {
    const repo = await callKernelTool(sandbox, "kernel.repo.inspect", { repo: "nexural-platform-kits" });
    assert.equal(repo.exists, true);
    assert.equal(repo.package.name, "nexural-platform-kits");
    assert.match(repo.readmePreview, /Source Repo/);
  } finally {
    delete process.env.SAGE_KERNEL_SOURCE_ROOT;
  }

  const warehouseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-warehouse-"));
  fs.writeFileSync(
    path.join(warehouseRoot, "index.json"),
    JSON.stringify({ tools: [{ slug: "agent", name: "Agent Tool", category: "agents", verdict: "use", maturity: "stable", tags: ["agent"], summary: "Agent helper" }] })
  );
  process.env.AI_WAREHOUSE_ROOT = warehouseRoot;
  try {
    const results = await callKernelTool(sandbox, "kernel.warehouse.search", { query: "agent", verdict: "use" });
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "Agent Tool");
    const summary = await callKernelTool(sandbox, "kernel.warehouse.summary", {});
    assert.equal(summary.count, 1);
    assert.equal(summary.verdicts.use, 1);
  } finally {
    delete process.env.AI_WAREHOUSE_ROOT;
  }

  const missingWarehouseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-warehouse-missing-"));
  process.env.AI_WAREHOUSE_ROOT = missingWarehouseRoot;
  try {
    await assert.rejects(
      () => callKernelTool(sandbox, "kernel.warehouse.search", { query: "agent" }),
      /AI Warehouse index not found/
    );
  } finally {
    delete process.env.AI_WAREHOUSE_ROOT;
  }
});

test("MCP dispatcher covers repo, QA, scaffold, and workflow edge branches", async () => {
  const sandbox = tempRoot();

  await assert.rejects(
    () => callKernelTool(sandbox, "kernel.repo.inspect", { repo: "not-in-catalog" }),
    /Unknown catalog repo/
  );
  await assert.rejects(
    () => callKernelTool(sandbox, "kernel.qa.run", { projectPath: "/tmp/outside-sage-kernel", mode: "fast" }),
    /Refusing to run QA outside allowed roots/
  );
  await assert.rejects(
    () => callKernelTool(sandbox, "kernel.workflow.create_app", { template: "worker-service" }),
    /requires input.template and input.name/
  );
  await assert.rejects(
    () => callKernelTool(sandbox, "kernel.unknown", {}),
    /Unknown tool/
  );
  process.env.SAGE_KERNEL_READ_ONLY = "1";
  try {
    await assert.rejects(
      () => callKernelTool(sandbox, "kernel.jobs.enqueue", { job: "repo-health" }),
      /Read-only mode blocks/
    );
  } finally {
    delete process.env.SAGE_KERNEL_READ_ONLY;
  }

  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-source-missing-runtime-"));
  const repoDir = path.join(sourceRoot, "nexural-platform-kits");
  fs.mkdirSync(repoDir, { recursive: true });
  process.env.SAGE_KERNEL_SOURCE_ROOT = sourceRoot;
  try {
    const repo = await callKernelTool(sandbox, "kernel.repo.inspect", { repo: "nexural-platform-kits" });
    assert.equal(repo.exists, true);
    assert.equal(repo.package, null);
    assert.equal(repo.hasPyproject, false);
    assert.equal(repo.readmePreview, null);
  } finally {
    delete process.env.SAGE_KERNEL_SOURCE_ROOT;
  }

  const scaffold = await callKernelTool(sandbox, "kernel.project.scaffold", {
    template: "node-api-service",
    name: "Matrix API"
  });
  assert.match(scaffold.output, /Scaffolded matrix-api/);

  const approval = await callKernelTool(sandbox, "kernel.approvals.request", {
    action: "kernel.deploy.prepare",
    reason: "release warning path"
  });
  assert.equal(approval.status, "pending");
  const pending = await callKernelTool(sandbox, "kernel.workflow.pending_approvals", {});
  assert.equal(pending.count > 0, true);
  assert.match(pending.nextActions[0], /Review each approval/);
  const release = await callKernelTool(sandbox, "kernel.workflow.release_readiness", {});
  assert.equal(release.checks.find((check) => check.name === "pending-approvals").status, "warning");

});

test("MCP dispatcher covers jobs, approvals, run listing, and dogfood report branches", async () => {
  const sandbox = tempRoot();
  fs.mkdirSync(path.join(sandbox, ".sage-kernel/runs"), { recursive: true });
  fs.writeFileSync(
    path.join(sandbox, ".sage-kernel/runs/2026-01-01T00-00-00-000Z-test.json"),
    JSON.stringify({ runId: "run_1", jobId: "repo-health", status: "passed", durationMs: 3, finishedAt: "2026-01-01T00:00:00.000Z" })
  );

  assert.equal((await callKernelTool(sandbox, "kernel.jobs.list", {})).length > 0, true);
  assert.equal((await callKernelTool(sandbox, "kernel.jobs.runs", { limit: 1 }))[0].runId, "run_1");

  const approval = await callKernelTool(sandbox, "kernel.approvals.request", {
    action: "kernel.test",
    reason: "matrix",
    payload: { ok: true }
  });
  assert.equal(approval.status, "pending");
  const approvals = await callKernelTool(sandbox, "kernel.approvals.list", { status: "pending" });
  assert.equal(approvals.some((item) => item.id === approval.id), true);
  const approved = await callKernelTool(sandbox, "kernel.approvals.approve", { id: approval.id, decidedBy: "matrix" });
  assert.equal(approved.status, "approved");

  const queued = await callKernelTool(sandbox, "kernel.jobs.enqueue", { job: "repo-health", payload: { ok: true }, delayMs: 1 });
  assert.match(queued.id, /^job_/);
  assert.equal(queued.status, "queued");
  assert.notEqual(queued.nextRunAt, null);

  const dogfood = await callKernelTool(sandbox, "kernel.dogfood.prod", { repos: ["commerce-command-os"] });
  assert.equal(dogfood.configured, false);
  assert.equal(dogfood.results[0].configured, false);

  fs.mkdirSync(path.join(sandbox, "apps/worker/scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(sandbox, "apps/worker/scripts/worker-daemon.mjs"),
    "console.error('worker tick failed'); process.exit(7);\n"
  );
  await assert.rejects(
    () => callKernelTool(sandbox, "kernel.worker.tick", {}),
    /worker tick failed/
  );
});

test("MCP dispatcher exposes daily workflow tools for app-building operations", async () => {
  const sandbox = tempRoot();

  const audit = await callKernelTool(sandbox, "kernel.workflow.audit_repo", { projectPath: ".", mode: "fast" });
  assert.equal(audit.workflow, "audit_repo");
  assert.equal(audit.qa.status, "passed");
  assert.equal(audit.nextActions.length > 0, true);

  const fullQa = await callKernelTool(sandbox, "kernel.workflow.run_full_qa", { projectPath: ".", mode: "standard" });
  assert.equal(fullQa.workflow, "run_full_qa");
  assert.equal(fullQa.qa.mode, "standard");

  const explained = await callKernelTool(sandbox, "kernel.workflow.explain_failures", {
    report: {
      status: "failed",
      checks: [
        { name: "npm:test", status: "failed", result: { command: "npm test", stderr: "unit failed" } },
        { name: "file:README.md", status: "passed" }
      ]
    }
  });
  assert.equal(explained.status, "failed");
  assert.equal(explained.failures.length, 1);
  assert.match(explained.failures[0].recommendation, /npm:test/);

  const created = await callKernelTool(sandbox, "kernel.workflow.create_app", {
    template: "worker-service",
    name: "Daily Worker",
    out: ".sage-kernel/generated"
  });
  assert.equal(created.workflow, "create_app");
  assert.equal(created.plan.template.id, "worker-service");
  assert.match(created.scaffold.output, /Scaffolded daily-worker/);

  const release = await callKernelTool(sandbox, "kernel.workflow.release_readiness", { template: "worker-service", target: "docker" });
  assert.equal(release.workflow, "release_readiness");
  assert.equal(release.status, "ready");
  assert.equal(release.checks.length > 0, true);

  const pending = await callKernelTool(sandbox, "kernel.workflow.pending_approvals", {});
  assert.equal(pending.workflow, "pending_approvals");
  assert.equal(Array.isArray(pending.approvals), true);

  const stress = await callKernelTool(sandbox, "kernel.workflow.stress_dashboard", {
    url: "http://127.0.0.1:1",
    count: 1,
    concurrency: 1
  });
  assert.equal(stress.workflow, "stress_dashboard");
  assert.equal(stress.report.status, "failed");

  const daily = await callKernelTool(sandbox, "kernel.workflow.daily_summary", {});
  assert.equal(daily.workflow, "daily_summary");
  assert.equal(daily.status, "ready");
  assert.equal(typeof daily.dashboard.summary, "string");
});

test("MCP call CLI wrapper validates input and invokes a runtime", async () => {
  const usage = await callToolCli([]);
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /Usage/);

  const invalid = await callToolCli(["kernel.catalog.search", "not-json"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Tool input must be JSON/);

  const calls = [];
  const runtime = {
    async loadBuiltInTools() {
      calls.push("load");
    },
    async call(name, input) {
      calls.push({ name, input });
      return { ok: true, name, input };
    }
  };
  const result = await callToolCli(["kernel.catalog.search", "{\"query\":\"qa\"}"], { runtime });
  assert.equal(result.status, 0);
  assert.deepEqual(calls, ["load", { name: "kernel.catalog.search", input: { query: "qa" } }]);
  assert.equal(JSON.parse(result.stdout).ok, true);
});
