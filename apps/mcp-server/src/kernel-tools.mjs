import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeKernelError, classifyErrorKind } from "../../../packages/core/kernel-error.mjs";
import { ensureKernelSchema, sqlJson, sqlString, runSql } from "../../../packages/db/scripts/db-lib.mjs";
import { assertToolAllowed, listApprovals, requestApproval } from "../../../packages/security/guard.mjs";
import { recordProof, getProof, listProofs, verifyProof, verifyLedger } from "../../../packages/proof/ledger.mjs";
import { buildProofGraph, validateProofGraph, queryGraph, writeGraph, readGraph } from "../../../packages/proof/graph.mjs";
import { verifyReport } from "../../../packages/proof/claim-firewall.mjs";
import { createTaskContract, validateTaskContract } from "../../../packages/contracts/task-contract.mjs";
import { classifyDiff, classifyRepoDiff } from "../../../packages/risk/diff-classifier.mjs";
import { mapTestImpact } from "../../../packages/testing/impact-map.mjs";
import { runOperate } from "../../../packages/operate/operate.mjs";
import { runMutationTesting } from "../../../packages/testing/mutation.mjs";
import { routeTask } from "../../../packages/agents/router.mjs";
import { computeHallucinationRate } from "../../../packages/proof/hallucination.mjs";
import { recordProfileOverride, profileLearningStats } from "../../../packages/profiles/profile-learning.mjs";
import { listLoops } from "../../../packages/loops/registry.mjs";
import { selectLoop, recordLoopOverride } from "../../../packages/loops/selector.mjs";
import { runLoop } from "../../../packages/loops/run-loop.mjs";
import { analyzeDeadCode } from "../../../packages/refactor/dead-code.mjs";
import { explainPolicy } from "../../../packages/policy/engine.mjs";
import { redact } from "../../../packages/security/dlp.mjs";
import { supervisorStatus } from "../../../packages/operate/daemon.mjs";
import { diagnoseFailure } from "../../../packages/operate/diagnose.mjs";
import { createAutonomousRepairer, isAgentConfigured } from "../../../packages/agents/executor.mjs";
import { selectAgent } from "../../../packages/agents/router.mjs";
import { runModelRubric } from "../../../packages/evals/model-rubric.mjs";
import { groundClaimsAgainstRepo } from "../../../packages/evals/grounding.mjs";
import { outcomeStats, recommendLoop } from "../../../packages/learning/outcomes.mjs";
import { recallFix } from "../../../packages/learning/knowledge.mjs";
import { adversariallyVerify } from "../../../packages/agents/verify.mjs";
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
import {
  evaluateAgentRuntime,
  listAgentRoles,
  reviewWithCouncil,
  runAgentTask,
  validateAgentRuntime
} from "../../../packages/agents/runtime.mjs";
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
  createSeniorReview,
  inspectRepository,
  mapRoutesToTests,
  reviewDiff
} from "../../../packages/review/review-engine.mjs";
import {
  createSecurityProof,
  createSupplyChainReport,
  generateThreatModel
} from "../../../packages/security/supply-chain.mjs";
import { scanSast } from "../../../packages/security/sast.mjs";
import { scanPolyglot } from "../../../packages/security/polyglot-sast.mjs";
import { gatherCockpitSnapshot } from "../../../packages/cockpit/cockpit.mjs";
import { runChaosMatrix } from "../../../packages/orchestration/chaos.mjs";
import { scanSastIncremental } from "../../../packages/perf/incremental-sast.mjs";
import { checkIncrementalGain } from "../../../packages/perf/budget.mjs";
import { runtimeGateForTarget } from "../../../packages/runtime/gate.mjs";
import { runAutonomyHarness } from "../../../packages/autonomy/harness.mjs";
import { synthesizePrd } from "../../../packages/intake/prd.mjs";
import { deriveArchitecture } from "../../../packages/intake/design.mjs";
import { runIntake } from "../../../packages/intake/contract.mjs";
import { generate } from "../../../packages/generation/engine.mjs";
import { proveGenerated } from "../../../packages/generation/gate.mjs";
import { scanInterprocedural } from "../../../packages/security/dataflow.mjs";
import { deployVerifyRollback } from "../../../packages/deploy/pipeline.mjs";
import { createLocalProvider } from "../../../packages/deploy/providers/local.mjs";
import { runSdlcE2e } from "../../../packages/sdlc/e2e.mjs";
import { checkProofGate } from "../../../packages/enforcement/proof-gate.mjs";
import { generateClientContracts, contractHash } from "../../../packages/companion/operating-contract.mjs";
import { driveGoal } from "../../../packages/companion/drive-goal.mjs";
import {
  createPerformanceBudget,
  createPlaywrightTemplate,
  createTestingLabProof,
  generateTestStrategy
} from "../../../packages/testing/testing-lab.mjs";
import {
  approveLearningUpdate,
  createKnowledgeGraph,
  enforceMemoryPolicy,
  proposeLearningUpdate
} from "../../../packages/intelligence/knowledge-graph.mjs";
import {
  detectProjectProfile,
  generateDefinitionOfDone
} from "../../../packages/profiles/project-detector.mjs";
import {
  createClosedLoopWorkflow,
  proveClosedLoopWorkflows,
  validateClosedLoopWorkflows
} from "../../../packages/workflows/closed-loop.mjs";
import {
  compareEvidence,
  createAgentSafetyRedteam,
  createBenchmarkMatrix,
  createFullCyclePlan,
  createLoopScore,
  createProfileGapReport,
  generatePostmortem,
  listEvidence
} from "./sdlc-tools.mjs";
import {
  createDefaultWorkflowDefinition,
  runWorkflow,
  validateWorkflowDefinition
} from "../../../packages/workflows/engine.mjs";
import { createWorkflowEngineFixture } from "../../../packages/workflows/test-fixtures/workflow-engine-proof.mjs";

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

// Build the autonomous repairer that turns operate/loops from "detect" into
// "fix". Self-gated: only active when an agent is configured (SAGE_AGENT_COMMAND);
// otherwise undefined, so the loop honestly reports failures instead of faking a
// repair. The repairer diagnoses each failing gate from its stdout/stderr (so the
// fix is aimed at the real file:line) and routes to the right agent.
export function buildRepairer(root) {
  if (!isAgentConfigured()) return undefined;
  return createAutonomousRepairer({
    root,
    diagnose: ({ failing }) => diagnoseFailure({ root, command: failing?.detail, stdout: failing?.stdout, stderr: failing?.stderr }),
    route: (diagnosis) => selectAgent({ gate: diagnosis?.category || "unknown", riskLevel: "medium" }).agent
  });
}

export async function callKernelTool(root, toolName, input = {}) {
  if (!knownKernelToolNames.has(toolName)) throw new Error(`Unknown tool: ${toolName}`);
  // Boundary validation (fixes silent-wrong-answer class): refuse to run against a
  // missing/invalid target instead of falling back to cwd and confidently auditing
  // the wrong project. A provided-but-nonexistent projectPath/targetRoot is an
  // honest error, not a "passed" scorecard of an empty/nonexistent repo.
  if (root === null || root === undefined || String(root).trim() === "" || !(typeof root === "string")) {
    throw new Error(`kernel tool target root is required (got ${root === "" ? "empty string" : typeof root}); pass the absolute path of the project to analyze`);
  }
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`target root does not exist or is not a directory: ${root}`);
  }
  for (const key of ["projectPath", "targetRoot"]) {
    if (input[key] && typeof input[key] === "string") {
      const resolved = path.isAbsolute(input[key]) ? input[key] : path.resolve(root, input[key]);
      if (!fs.existsSync(resolved)) throw new Error(`${key} does not exist: ${input[key]} (resolved ${resolved})`);
    }
  }
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

    case "kernel.profile.detect":
      return detectProjectProfile({ root, projectPath: input.projectPath ?? "." });

    case "kernel.profile.gaps":
      return createProfileGapReport(root, input);

    case "kernel.done.generate":
      return generateDefinitionOfDone({
        projectPath: input.projectPath ?? ".",
        profile: input.profile,
        objective: input.objective,
        risk: input.risk
      }, { root });

    case "kernel.loop.plan":
      return createClosedLoopWorkflow({
        projectPath: input.projectPath ?? ".",
        mode: input.mode === "dry-run" ? "dry-run" : "plan",
        objective: input.objective,
        risk: input.risk
      }, { root });

    case "kernel.loop.run":
      return createClosedLoopWorkflow({
        projectPath: input.projectPath ?? ".",
        mode: "run",
        objective: input.objective,
        risk: input.risk
      }, { root });

    case "kernel.loop.validate":
      return validateClosedLoopWorkflows({ root });

    case "kernel.loop.prove":
      return proveClosedLoopWorkflows({ root });

    case "kernel.loop.score":
      return createLoopScore(root, input);

    case "kernel.loop.full_cycle":
      return createFullCyclePlan(root, input);

    case "kernel.workflow_engine.validate":
      return validateWorkflowDefinition(input.definition || createDefaultWorkflowDefinition());

    case "kernel.workflow_engine.prove":
      return createWorkflowEngineFixture({ root });

    case "kernel.workflow_engine.run": {
      if (!input.definition || typeof input.definition !== "object") {
        throw new Error("kernel.workflow_engine.run requires input.definition");
      }
      return runWorkflow(input.definition, {
        root,
        approvals: Array.isArray(input.approvals) ? input.approvals : []
      });
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

    case "kernel.agent.roles":
      return listAgentRoles({ root });

    case "kernel.agent.validate":
      return validateAgentRuntime({ root });

    case "kernel.agent.run":
      return runAgentTask({
        role: input.role || "reviewer",
        projectPath: input.projectPath || ".",
        objective: input.objective
      }, { root });

    case "kernel.agent.eval":
      return evaluateAgentRuntime({ root });

    case "kernel.council.review":
      return reviewWithCouncil({
        projectPath: input.projectPath || ".",
        objective: input.objective,
        roles: input.roles
      }, { root });

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

    case "kernel.review.diff_review":
      return reviewDiff({ root, projectPath: input.projectPath || ".", diff: input.diff });

    case "kernel.review.route_test_map":
      return mapRoutesToTests({ root, projectPath: input.projectPath || "." });

    case "kernel.review.quality_score":
      return createReviewScore({ root, projectPath: input.projectPath || "." });

    case "kernel.review.senior_review":
      return createSeniorReview({ root, projectPath: input.projectPath || ".", diff: input.diff });

    case "kernel.review.release_proof":
      return createReleaseProof({ root, projectPath: input.projectPath || "." });

    case "kernel.security.threat_model":
      return generateThreatModel({
        root,
        projectPath: input.projectPath || ".",
        systemName: input.systemName,
        assets: input.assets,
        externalSystems: input.externalSystems,
        identities: input.identities
      });

    case "kernel.security.supply_chain":
      return createSupplyChainReport({ root, projectPath: input.projectPath || "." });

    case "kernel.security.proof":
      return createSecurityProof({ root, projectPath: input.projectPath || "." });

    case "kernel.security.sast":
      return scanSast({ root, projectPath: input.projectPath || "." });

    case "kernel.cockpit.status":
      return gatherCockpitSnapshot({ root });

    case "kernel.security.polyglot":
      return scanPolyglot({ root });

    case "kernel.chaos.matrix":
      return runChaosMatrix();

    case "kernel.perf.incremental": {
      const cold = scanSastIncremental({ root, cache: {} });
      const warm = scanSastIncremental({ root, cache: cold.cache });
      return {
        status: warm.status,
        filesScanned: cold.filesScanned,
        cold: cold.perf,
        warm: warm.perf,
        findings: warm.findings.length,
        gain: checkIncrementalGain(cold, warm)
      };
    }

    case "kernel.runtime.gate":
      return runtimeGateForTarget({ root });

    case "kernel.autonomy.harness":
      return runAutonomyHarness();

    case "kernel.intake.prd":
      return synthesizePrd(input.idea || "", input.profile || input.profileId || "library");

    case "kernel.intake.design": {
      const prd = synthesizePrd(input.idea || "", input.profile || input.profileId || "library");
      return deriveArchitecture(prd, input.profile || input.profileId || prd.profileId);
    }

    case "kernel.intake.contract":
      return runIntake(input.idea || "", input.profile || input.profileId || "library", { root });

    case "kernel.generation.scaffold":
      return generate(runIntake(input.idea || "", input.profile || input.profileId || "library", { root }).spec);

    case "kernel.generation.prove": {
      const intake = runIntake(input.idea || "", input.profile || input.profileId || "library", { root });
      return proveGenerated(generate(intake.spec).files);
    }

    case "kernel.security.dataflow":
      return scanInterprocedural({ root });

    case "kernel.sdlc.e2e":
      return runSdlcE2e({ idea: input.idea || "a small service", profile: input.profile || input.profileId || "library", injectDefect: input.injectDefect === true });

    case "kernel.enforce.proof_gate":
      return checkProofGate({ root: input.targetRoot ? path.resolve(input.targetRoot) : root });

    case "kernel.contract.install": {
      const targetRoot = input.targetRoot ? path.resolve(input.targetRoot) : root;
      const res = generateClientContracts({ root: targetRoot, clients: input.clients });
      return { ...res, root: targetRoot, contractHash: contractHash() };
    }

    case "kernel.goal.drive":
      return driveGoal({
        root,
        objective: input.objective,
        tasks: input.tasks,
        decompose: Array.isArray(input.tasks) && input.tasks.length ? async () => input.tasks : undefined,
        maxRounds: input.maxRounds,
        approve: input.approve === true
      });

    case "kernel.deploy.verify_rollback": {
      const provider = createLocalProvider();
      const verify = async (handle) => {
        try {
          const res = await fetch(new URL("/health", handle.baseUrl), { signal: AbortSignal.timeout(2000) });
          return { ok: res.ok };
        } catch (error) {
          return { ok: false, error: String(error?.message || error) };
        }
      };
      try {
        const happy = await deployVerifyRollback({ provider, verify, version: { id: "v2", healthy: true }, previous: { id: "v1", healthy: true } });
        const rolledBack = await deployVerifyRollback({ provider, verify, version: { id: "v3", healthy: false }, previous: { id: "v2", healthy: true } });
        return { happyPath: happy.status, failurePath: rolledBack.status, restoredTo: rolledBack.restored?.id || null };
      } finally {
        await provider.shutdown();
      }
    }

    case "kernel.testing.strategy":
      return generateTestStrategy({ root, projectPath: input.projectPath || ".", risk: input.risk });

    case "kernel.testing.playwright_template":
      return createPlaywrightTemplate({ root, projectPath: input.projectPath || "." });

    case "kernel.testing.performance_budget":
      return createPerformanceBudget({ root, projectPath: input.projectPath || ".", profile: input.profile });

    case "kernel.testing.proof":
      return createTestingLabProof({ root, projectPath: input.projectPath || ".", risk: input.risk, execute: input.execute });

    case "kernel.testing.mutation":
      if (!input.targetFile || !Array.isArray(input.testFiles) || input.testFiles.length === 0) {
        throw new Error("kernel.testing.mutation requires input.targetFile and input.testFiles");
      }
      return runMutationTesting({ root, targetFile: input.targetFile, testFiles: input.testFiles, threshold: input.threshold, maxMutants: input.maxMutants });

    case "kernel.evidence.list":
      return listEvidence(root, input);

    case "kernel.evidence.compare":
      return compareEvidence(root, input);

    case "kernel.postmortem.generate":
      return generatePostmortem(input);

    case "kernel.redteam.agent_safety":
      return createAgentSafetyRedteam(root, input);

    case "kernel.benchmark.matrix":
      return createBenchmarkMatrix(root, input);

    case "kernel.memory.policy":
      return enforceMemoryPolicy({
        projectId: input.projectId || "sage-kernel",
        scope: input.scope || "project",
        kind: input.kind || "episode",
        source: input.source || "mcp",
        summary: input.summary,
        confidence: input.confidence,
        evidenceRef: input.evidenceRef || "mcp"
      });

    case "kernel.memory.graph":
      return createKnowledgeGraph({ root, projectPath: input.projectPath || "." });

    case "kernel.memory.learning_propose":
      return proposeLearningUpdate({
        root,
        projectPath: input.projectPath || ".",
        failure: input.failure,
        fix: input.fix,
        scope: input.scope,
        summary: input.summary,
        evidenceRef: input.evidenceRef
      });

    case "kernel.memory.learning_approve":
      return approveLearningUpdate(input.proposal, { approvedBy: input.approvedBy || "mcp-user" });

    case "kernel.drift.map":
      return createDriftMap({ root });

    case "kernel.drift.scope":
      return detectScopeCreep({ root });

    case "kernel.drift.self_audit":
      return runSelfAudit({ root });

    case "kernel.drift.proof":
      return createDriftProof({ root });

    case "kernel.proof.record":
      if (!input.tool || !input.status) throw new Error("kernel.proof.record requires input.tool and input.status");
      return recordProof({
        tool: input.tool,
        command: input.command,
        status: input.status,
        input: input.input ?? {},
        output: input.output ?? null,
        stdout: input.stdout,
        stderr: input.stderr,
        exitCode: input.exitCode,
        verifier: input.verifier,
        runId: input.runId,
        parentProofIds: input.parentProofIds,
        approvalId: input.approvalId
      }, { root });

    case "kernel.proof.get":
      if (!input.proofId) throw new Error("kernel.proof.get requires input.proofId");
      return getProof(input.proofId, { root });

    case "kernel.proof.list":
      return listProofs({ root, runId: input.runId, status: input.status, tool: input.tool, limit: input.limit });

    case "kernel.proof.verify":
      return input.proofId ? verifyProof(input.proofId, { root }) : verifyLedger({ root });

    case "kernel.proof_graph.build": {
      const graph = buildProofGraph({ root, goal: input.goal, requirements: input.requirements });
      writeGraph(graph, { root });
      return graph;
    }

    case "kernel.proof_graph.query": {
      const graph = input.graph || readGraph({ root });
      if (!graph) throw new Error("kernel.proof_graph.query requires a built graph; run kernel.proof_graph.build first");
      return queryGraph(graph, input);
    }

    case "kernel.proof_graph.validate": {
      const graph = input.graph || readGraph({ root });
      if (!graph) throw new Error("kernel.proof_graph.validate requires a built graph; run kernel.proof_graph.build first");
      return validateProofGraph(graph, { strict: input.strict });
    }

    case "kernel.claims.verify":
      if (!input.text) throw new Error("kernel.claims.verify requires input.text");
      return verifyReport(input.text, { root });

    case "kernel.contract.create":
      if (!input.goal) throw new Error("kernel.contract.create requires input.goal");
      return createTaskContract({
        root,
        goal: input.goal,
        acceptanceCriteria: input.acceptanceCriteria,
        scope: input.scope,
        nonGoals: input.nonGoals
      });

    case "kernel.contract.validate":
      if (!input.contract) throw new Error("kernel.contract.validate requires input.contract");
      return validateTaskContract(input.contract);

    case "kernel.risk.classify_diff":
      return input.files ? classifyDiff(input.files) : classifyRepoDiff({ root });

    case "kernel.testing.impact":
      return mapTestImpact(input.files || [], { root, requireCoverage: input.requireCoverage });

    case "kernel.operate.run": {
      if (!input.goal) throw new Error("kernel.operate.run requires input.goal");
      const opRoot = input.targetRoot ? path.resolve(input.targetRoot) : root;
      return runOperate({
        root: opRoot,
        goal: input.goal,
        acceptanceCriteria: input.acceptanceCriteria,
        files: input.files,
        approve: input.approve,
        repairer: buildRepairer(opRoot)
      });
    }

    case "kernel.agents.route":
      if (!input.goal) throw new Error("kernel.agents.route requires input.goal");
      return routeTask({ root, goal: input.goal, files: input.files, acceptanceCriteria: input.acceptanceCriteria });

    case "kernel.hallucination.scan":
      if (!input.text) throw new Error("kernel.hallucination.scan requires input.text");
      return computeHallucinationRate(input.text, { root });

    case "kernel.profile.learn":
      if (!input.profile) throw new Error("kernel.profile.learn requires input.profile");
      return {
        override: recordProfileOverride({ root, profile: input.profile, reason: input.reason }),
        stats: profileLearningStats({ root })
      };

    case "kernel.refactor.dead_code":
      return analyzeDeadCode(root, { strict: input.strict });

    case "kernel.daemon.status":
      return supervisorStatus(path.join(root, ".sage-kernel/daemon/heartbeat.json"));

    case "kernel.operate.diagnose":
      return diagnoseFailure({ root, command: input.command, stdout: input.stdout, stderr: input.stderr });

    case "kernel.agents.verify":
      return adversariallyVerify({ claim: input.claim });

    case "kernel.evals.model_rubric":
      return runModelRubric({ task: input.task, samples: input.samples });

    case "kernel.evals.ground":
      if (!input.text) throw new Error("kernel.evals.ground requires input.text");
      return groundClaimsAgainstRepo(input.text, root);

    case "kernel.learning.outcomes":
      return { stats: outcomeStats({ root }), recommendation: recommendLoop({ root }) };

    case "kernel.learning.recall_fix":
      if (!input.signature) throw new Error("kernel.learning.recall_fix requires input.signature");
      return recallFix(input.signature, { root }) || { status: "no_match" };

    case "kernel.policy.explain":
      if (!input.kind || input.value === undefined) throw new Error("kernel.policy.explain requires input.kind and input.value");
      return explainPolicy({ kind: input.kind, value: input.value, root });

    case "kernel.security.dlp":
      if (input.text === undefined) throw new Error("kernel.security.dlp requires input.text");
      return redact(input.text);

    case "kernel.loops.list":
      return listLoops();

    case "kernel.loops.select":
      return selectLoop({ root, goal: input.goal, loop: input.loop });

    case "kernel.loops.learn":
      if (!input.loop) throw new Error("kernel.loops.learn requires input.loop");
      return { override: recordLoopOverride({ root, loop: input.loop, reason: input.reason }) };

    case "kernel.loops.run": {
      if (!input.goal && !input.loop) throw new Error("kernel.loops.run requires input.goal or input.loop");
      const loopRoot = input.targetRoot ? path.resolve(input.targetRoot) : root;
      return runLoop({
        root: loopRoot,
        goal: input.goal,
        loop: input.loop,
        acceptanceCriteria: input.acceptanceCriteria,
        files: input.files,
        approve: input.approve,
        repairer: buildRepairer(loopRoot)
      });
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

function cryptoRandomId() {
  return `job_${crypto.randomUUID()}`;
}

export function toMcpTextContent(value, options = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ],
    ...(options.isError ? { isError: true } : {})
  };
}

// Convenience safe wrapper for callers without a runtime (e.g. the autonomous
// loop): same envelope contract as runtime.callSafe, never throws.
export async function callKernelToolSafe(root, toolName, input = {}) {
  try {
    return { ok: true, data: await callKernelTool(root, toolName, input) };
  } catch (error) {
    const normalized = normalizeKernelError(error, { code: "KERNEL_TOOL_FAILED", details: { tool: toolName } });
    return { ok: false, error: { ...normalized.toJSON(), kind: classifyErrorKind(normalized) } };
  }
}

export const __kernelToolsTestInternals = {
  knownKernelToolNames
};
