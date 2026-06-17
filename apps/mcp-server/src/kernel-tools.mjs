import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureKernelSchema, sqlJson, sqlString, runSql } from "../../../packages/db/scripts/db-lib.mjs";
import { assertToolAllowed, listApprovals, requestApproval } from "../../../packages/security/guard.mjs";
import { createSqliteAdapter } from "../../../packages/db/adapter.mjs";
import { createApprovalLedger } from "../../../packages/security/approvals.mjs";
import { dashboardSnapshot } from "../../dashboard/server.mjs";
import {
  createDriftMap,
  createDriftProof,
  detectScopeCreep,
  runSelfAudit
} from "../../../packages/drift/drift-engine.mjs";
import {
  createAgentsDoctorReport,
  installGlobalAgentPack,
  listAgentProfiles,
  validateAgentPack
} from "../../../packages/agents/agent-pack.mjs";
import { listAdapters } from "../../../packages/intelligence/adapters.mjs";
import { createSemanticCode } from "../../../packages/intelligence/semantic-code.mjs";
import { createAdr, createDailyPlan, executeRunbookStep, listRunbooks } from "../../../packages/intelligence/runbooks.mjs";
import {
  auditArchitecture,
  auditCleanCode,
  auditSecurity,
  auditTests,
  createReleaseProof,
  createReviewScore,
  inspectRepository
} from "../../../packages/review/review-engine.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const knownKernelToolNames = new Set(
  JSON.parse(fs.readFileSync(path.join(sourceRoot, "apps/mcp-server/tools.json"), "utf8")).tools.map((tool) => tool.name)
);

import {
  deployPrepare,
  getQaProfile,
  infraPlan,
  inspectRepo,
  listRuns,
  qaPlan,
  qaRun,
  readJson,
  runNode,
  searchCatalog,
  warehouseSearch,
  workflowAuditRepo,
  workflowCreateApp,
  workflowDailySummary,
  workflowExplainFailures,
  workflowPendingApprovals,
  workflowReleaseReadiness,
  workflowRunFullQa,
  workflowStressDashboard
} from "./kernel-tool-helpers.mjs";

export async function callKernelTool(root, toolName, input = {}) {
  if (!knownKernelToolNames.has(toolName)) throw new Error(`Unknown tool: ${toolName}`);
  assertToolAllowed(root, toolName.replace("kernel.", ""), input);
  switch (toolName) {
    case "kernel.phase.status":
      return readJson(root, "catalog/phases.json").phases;

    case "kernel.catalog.search":
      if (!input.query) throw new Error("kernel.catalog.search requires input.query");
      return searchCatalog(root, input.query, input.limit ?? 20);

    case "kernel.template.list":
      return readJson(root, "catalog/templates.json").templates;

    case "kernel.project.plan": {
      if (!input.template) throw new Error("kernel.project.plan requires input.template");
      const { template, profile } = getQaProfile(root, input.template);
      return {
        name: input.name ?? null,
        template,
        qaProfile: profile,
        infraPlan: infraPlan(root, input.template, input.target ?? "vercel")
      };
    }

    case "kernel.project.scaffold": {
      if (!input.template || !input.name) {
        throw new Error("kernel.project.scaffold requires input.template and input.name");
      }
      const args = ["--template", input.template, "--name", input.name];
      if (input.out) args.push("--out", input.out);
      return {
        output: runNode(root, "packages/templates/scripts/template-scaffold-v2.mjs", args)
      };
    }

    case "kernel.warehouse.summary":
      return JSON.parse(runNode(root, "packages/ai-warehouse/scripts/warehouse-summary.mjs"));

    case "kernel.warehouse.search":
      if (!input.query) throw new Error("kernel.warehouse.search requires input.query");
      return warehouseSearch(root, input.query, input.limit ?? 10, input.verdict ?? null);

    case "kernel.qa.profile":
      if (!input.template) throw new Error("kernel.qa.profile requires input.template");
      return getQaProfile(root, input.template);

    case "kernel.qa.plan":
      if (!input.template) throw new Error("kernel.qa.plan requires input.template");
      return qaPlan(root, input.template, input.mode ?? "standard");

    case "kernel.qa.run":
      return qaRun(root, input.projectPath ?? root, input.mode ?? "fast");

    case "kernel.repo.inspect":
      if (!input.repo) throw new Error("kernel.repo.inspect requires input.repo");
      return inspectRepo(root, input.repo);

    case "kernel.infra.plan":
      if (!input.template) throw new Error("kernel.infra.plan requires input.template");
      return infraPlan(root, input.template, input.target ?? "vercel");

    case "kernel.deploy.prepare":
      if (!input.template) throw new Error("kernel.deploy.prepare requires input.template");
      return deployPrepare(root, input.template, input.target ?? "vercel");

    case "kernel.jobs.list":
      return readJson(root, "apps/worker/jobs.json").jobs;

    case "kernel.jobs.run": {
      if (!input.job) throw new Error("kernel.jobs.run requires input.job");
      const output = runNode(root, "apps/worker/scripts/jobs-run.mjs", [input.job]);
      return JSON.parse(output);
    }

    case "kernel.jobs.runs":
      return listRuns(root, input.limit ?? 20);

    case "kernel.jobs.enqueue": {
      if (!input.job) throw new Error("kernel.jobs.enqueue requires input.job");
      ensureKernelSchema(root);
      const id = cryptoRandomId();
      const now = new Date().toISOString();
      const nextRunAt = input.delayMs ? new Date(Date.now() + Number(input.delayMs)).toISOString() : null;
      runSql(root, `INSERT INTO job_queue (id, job_id, payload_json, created_at, next_run_at) VALUES (${sqlString(id)}, ${sqlString(input.job)}, ${sqlJson(input.payload || {})}, ${sqlString(now)}, ${nextRunAt ? sqlString(nextRunAt) : "NULL"});`);
      return { id, job: input.job, status: "queued", nextRunAt };
    }

    case "kernel.worker.tick": {
      const output = runNode(root, "apps/worker/scripts/worker-daemon.mjs", ["--once"]);
      return { status: "ticked", output };
    }

    case "kernel.approvals.request":
      if (!input.action || !input.reason) throw new Error("kernel.approvals.request requires input.action and input.reason");
      return requestApproval(root, input.action, input.reason, input.payload || {});

    case "kernel.approvals.list":
      return listApprovals(root, input.status ?? null);

    case "kernel.approvals.approve": {
      if (!input.id) throw new Error("kernel.approvals.approve requires input.id");
      const db = createSqliteAdapter({ root });
      db.init();
      return createApprovalLedger({ db }).approve({ id: input.id, decidedBy: input.decidedBy || "local-user" });
    }

    case "kernel.dashboard.snapshot":
      return dashboardSnapshot({ root });

    case "kernel.semantic.index_project":
      return createSemanticCode({ root }).indexProject(input);

    case "kernel.semantic.search_symbol":
      return createSemanticCode({ root }).searchSymbol(input);

    case "kernel.semantic.find_references":
      return createSemanticCode({ root }).findReferences(input);

    case "kernel.semantic.summarize_module":
      return createSemanticCode({ root }).summarizeModule(input);

    case "kernel.adapters.list":
      return listAdapters({ root });

    case "kernel.runbooks.list":
      return { runbooks: listRunbooks({ root }) };

    case "kernel.runbooks.plan_day":
      return createDailyPlan({ root, objective: input.objective });

    case "kernel.runbooks.generate_adr":
      return createAdr(input, { root });

    case "kernel.runbooks.execute_step":
      return executeRunbookStep(input, { root });

    case "kernel.dogfood.prod": {
      const output = runNode(root, "scripts/dogfood-production-audit.mjs", input.repos || []);
      return JSON.parse(output);
    }

    case "kernel.workflow.audit_repo":
      return workflowAuditRepo(root, input);

    case "kernel.workflow.run_full_qa":
      return workflowRunFullQa(root, input);

    case "kernel.workflow.explain_failures":
      return workflowExplainFailures(root, input);

    case "kernel.workflow.create_app":
      return workflowCreateApp(root, input);

    case "kernel.workflow.release_readiness":
      return workflowReleaseReadiness(root, input);

    case "kernel.workflow.pending_approvals":
      return workflowPendingApprovals(root, input);

    case "kernel.workflow.stress_dashboard":
      return workflowStressDashboard(root, input);

    case "kernel.workflow.daily_summary":
      return workflowDailySummary(root);

    case "kernel.agents.list":
      return listAgentProfiles({ root });

    case "kernel.agents.validate":
      return validateAgentPack({ root });

    case "kernel.agents.doctor":
      return createAgentsDoctorReport({ root, home: input.home });

    case "kernel.agents.install_global":
      return installGlobalAgentPack({ root, home: input.home, force: input.force });

    case "kernel.review.inspect_repo":
      return inspectRepository({ root, projectPath: input.projectPath || "." });

    case "kernel.review.architecture_audit":
      return auditArchitecture({ root, projectPath: input.projectPath || "." });

    case "kernel.review.clean_code_audit":
      return auditCleanCode({ root, projectPath: input.projectPath || "." });

    case "kernel.review.test_audit":
      return auditTests({ root, projectPath: input.projectPath || "." });

    case "kernel.review.security_audit":
      return auditSecurity({ root, projectPath: input.projectPath || "." });

    case "kernel.review.quality_score":
      return createReviewScore({ root, projectPath: input.projectPath || "." });

    case "kernel.review.release_proof":
      return createReleaseProof({ root, projectPath: input.projectPath || "." });

    case "kernel.drift.map":
      return createDriftMap({ root });

    case "kernel.drift.scope":
      return detectScopeCreep({ root });

    case "kernel.drift.self_audit":
      return runSelfAudit({ root });

    case "kernel.drift.proof":
      return createDriftProof({ root });

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

function cryptoRandomId() {
  return `job_${crypto.randomUUID()}`;
}

export function toMcpTextContent(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

export const __kernelToolsTestInternals = {
  knownKernelToolNames
};
