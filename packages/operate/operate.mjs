// Daily Operating Loop — one entry point that runs a safe, evidence-backed SDLC
// pass over a goal: read repo state, build a task contract, detect profile,
// classify risk, seed the proof graph, plan the required gates, run them
// (recording a proof per gate), repair within bounds, score, and emit a final
// report whose claims are verified by the claim firewall.
//
// The loop does NOT silently auto-edit code: the "apply change" step is an
// injectable repairer (an agent in real use, a deterministic fixer in tests).
// The kernel provides the safe, bounded, evidence-generating harness.

import fs from "node:fs";
import path from "node:path";
import { changedFiles, classifyDiff } from "../risk/diff-classifier.mjs";
import { mapTestImpact } from "../testing/impact-map.mjs";
import { createTaskContract, contractGraphSeed } from "../contracts/task-contract.mjs";
import { addNode, addEdge, writeGraph, validateProofGraph } from "../proof/graph.mjs";
import { recordProof } from "../proof/ledger.mjs";
import { verifyReport } from "../proof/claim-firewall.mjs";
import { computeHallucinationRate } from "../proof/hallucination.mjs";
import { runRepairLoop } from "./repair-loop.mjs";
import { selectAgent } from "../agents/router.mjs";
import { detectProjectProfile } from "../profiles/project-detector.mjs";
import { loadProjectPlugins, listPlugins } from "../plugins/registry.mjs";
import { runConcurrent, maxConcurrencyObserved } from "../orchestration/concurrent.mjs";
// In-process, root-portable gate implementations. operate must work on ANY repo
// (giggl/Voza/Knox), so default gates call these directly instead of shelling
// `npm run <sage-kernel-script>` (which only exists in this repo).
import { createReviewScore, createReleaseProof } from "../review/review-engine.mjs";
import { createSecurityProof } from "../security/supply-chain.mjs";
import { scanSast } from "../security/sast.mjs";
import { analyzeDeadCode } from "../refactor/dead-code.mjs";

// Resolve one gate's final result: take the concurrent first-pass result and, if
// it failed and a repairer is wired, run the bounded repair loop. Extracted so
// runOperate stays under the complexity budget.
async function resolveGateOutcome({ exec, runner, root, contract, impact, risk, repairer, maxRepairAttempts, approve, runId }) {
  let result = exec.status === "fulfilled" ? exec.value : { status: "failed", detail: String(exec.reason || "gate threw") };
  if (result.status === "blocked_not_implemented") return { result, repair: null };
  let repair = null;
  if (result.status !== "passed" && repairer && typeof runner === "function") {
    const runGate = () => Promise.resolve(runner({ root, contract, impact, risk }));
    repair = await runRepairLoop({ root, runGate, repairer, maxAttempts: maxRepairAttempts, approve, runId });
    if (repair.repaired) result = { status: "passed", detail: "repaired", repaired: true };
    else if (repair.status === "blocked_needs_approval") result = { status: "blocked_needs_approval", detail: "repair needs approval" };
    else result = { status: "failed", detail: "repair exhausted" };
  }
  return { result, repair };
}

function buildPlan(contract) {
  return [
    ...contract.requiredTests,
    ...contract.requiredReviewGates,
    ...contract.requiredSecurityGates,
    ...contract.requiredReleaseGates
  ];
}

// The plan is the contract's gates plus a plugin-checks gate when the target has
// registered engine plugins (so they run as a real, load-bearing step).
function buildOperatePlan(contract, options) {
  if (options.plan) return options.plan;
  const base = buildPlan(contract);
  return listPlugins("engine").length ? [...base, "plugin-checks"] : base;
}

function addGateToGraph(graph, category, proof) {
  const gateId = `release_gate:${category}`;
  const proofNodeId = `proof:${proof.proofId}`;
  let next = addNode(graph, { id: gateId, type: "release_gate", label: category });
  next = addNode(next, { id: proofNodeId, type: "proof", label: category, status: proof.status });
  next = addEdge(next, { from: gateId, to: proofNodeId, type: "verified_by" });
  if (proof.status === "passed") {
    const claimId = `claim:${proof.proofId}`;
    next = addNode(next, { id: claimId, type: "claim", label: `${category} produced a passing proof` });
    next = addEdge(next, { from: claimId, to: proofNodeId, type: "verified_by" });
  }
  return next;
}

export async function runOperate(options = {}) {
  const root = options.root || process.cwd();
  const goal = options.goal || "";
  const acceptanceCriteria = options.acceptanceCriteria || [];
  const runId = options.runId || `run_operate_${Date.now()}`;
  const maxRepairAttempts = options.maxRepairAttempts ?? 2;
  const approve = Boolean(options.approve);

  // 1. Repo state. 2. Contract. 3. Profile (inside contract). 4. Risk.
  const files = options.files || changedFiles(root);
  const risk = classifyDiff(files);
  const contract = createTaskContract({
    root,
    goal,
    acceptanceCriteria,
    extraRiskClasses: risk.classes
  });

  if (!contract.canImplement) {
    return {
      status: "blocked_missing_acceptance_criteria",
      runId,
      contractId: contract.contractId,
      profile: contract.profile,
      risk: contract.riskClassification,
      blockers: ["Acceptance criteria are required before implementation."],
      nextActions: ["Provide acceptance criteria, then re-run operate."],
      gates: [],
      evidenceIds: []
    };
  }

  // 5. Test impact. 6. Proof graph seed.
  const impact = mapTestImpact(files, { root, requireCoverage: false });
  let graph = contractGraphSeed(contract);

  // 7. Plan the required gates and route each to the right agent. A loop may
  // supply an explicit plan (its phases); otherwise derive from the contract.
  // Load the TARGET repo's plugins so registered engine plugins become real,
  // load-bearing gates in the cycle (extensibility = config, not core edits).
  await loadProjectPlugins({ root }).catch(() => {});
  const plan = buildOperatePlan(contract, options);
  const languages = options.languages || detectLanguages(root);
  const gateRunners = { ...defaultGateRunners(), ...(options.gateRunners || {}) };

  // 8. Phase 1 — execute gate runners CONCURRENTLY (bounded pool). The expensive
  // work (spawning node --test, running scans) runs in parallel; bookkeeping
  // (repair, proofs, graph) stays SERIAL below so the proof chain never forks.
  // Durable resume: a gate marked "passed" in options.resume is reused, not re-run.
  const resume = options.resume || {};
  const runnable = plan.map((category) => ({
    category,
    agent: selectAgent({ gate: category, languages, riskLevel: contract.riskClassification.level }).agent,
    runner: gateRunners[category]
  }));
  const execResults = await runConcurrent(
    runnable.map((g) => async () => {
      if (resume[g.category] === "passed") return { status: "passed", detail: "resumed (already passed)", resumed: true };
      if (typeof g.runner !== "function") return { status: "blocked_not_implemented", detail: "no runner wired" };
      return g.runner({ root, contract, impact, risk });
    }),
    { limit: options.concurrency || 4 }
  );
  const peakConcurrency = maxConcurrencyObserved(execResults);

  // 9-13. Phase 2 — serial: repair within bounds, then a proof + graph node per gate.
  const gates = [];
  for (let i = 0; i < runnable.length; i += 1) {
    const { category, agent, runner } = runnable[i];
    const { result, repair } = await resolveGateOutcome({
      exec: execResults[i], runner, root, contract, impact, risk,
      repairer: options.repairer, maxRepairAttempts, approve, runId
    });
    const proof = recordProof(
      {
        tool: `operate:gate:${category}`,
        status: result.status === "passed" ? "passed" : "failed",
        input: { category, goal },
        output: { detail: result.detail || null },
        verifier: "operate",
        runId
      },
      { root }
    );
    graph = addGateToGraph(graph, category, proof);
    gates.push({ category, agent, status: result.status, detail: result.detail || null, proofId: proof.proofId, repair, resumed: Boolean(result.resumed) });
  }

  // 12. Score.
  const passed = gates.filter((gate) => gate.status === "passed").length;
  const score = plan.length > 0 ? Math.round((100 * passed) / plan.length) : 100;

  writeGraph(graph, { root });

  const blockers = gates.filter((gate) => gate.status !== "passed");
  const status =
    blockers.length === 0
      ? "passed"
      : gates.some((gate) => gate.status === "blocked_needs_approval")
        ? "blocked_needs_approval"
        : "needs_work";

  // Loop semantics: a loop completes only when its required-before-exit gates
  // pass (the Letta required-gate pattern). Every exit carries a typed reason.
  const requiredGates = options.requiredGates || [];
  const requiredGatesMet = requiredGates.every((gate) => gates.some((entry) => entry.category === gate && entry.status === "passed"));
  const stopReason = gates.some((gate) => gate.status === "blocked_needs_approval")
    ? "blocked_needs_approval"
    : !requiredGatesMet
      ? "required_gate_failed"
      : blockers.length === 0
        ? "completed"
        : "needs_work";
  const loop = options.loopId
    ? { id: options.loopId, source: options.loopSource || null, requiredGates, requiredGatesMet, stopReason }
    : null;

  // 15. Evidence-backed report. The summary avoids unverified success claims and
  // is checked by the claim firewall.
  const summary = `Operate ${runId}: ${passed}/${plan.length} gates produced passing proofs; ${blockers.length} blocking. Profile ${contract.profile.winner}, risk ${contract.riskClassification.level}.`;
  const claimFirewall = verifyReport(summary, { root });
  const hallucination = computeHallucinationRate(summary, { root });

  const overall = recordProof(
    { tool: "operate:run", status: status === "passed" ? "passed" : "failed", input: { goal }, output: { status, score }, verifier: "operate", runId },
    { root }
  );

  return {
    status,
    runId,
    contractId: contract.contractId,
    proofGraphValidation: validateProofGraph(graph, {}),
    profile: contract.profile,
    risk: contract.riskClassification,
    score,
    plan,
    gates,
    peakConcurrency,
    filesChanged: files,
    impact: { uncovered: impact.uncovered, requiredTests: impact.requiredTests },
    blockers: blockers.map((gate) => gate.category),
    nextActions: deriveNextActions(status, blockers, impact),
    evidenceIds: [...gates.map((gate) => gate.proofId), overall.proofId],
    summary,
    claimFirewall,
    hallucination,
    loop
  };
}

function detectLanguages(root) {
  try {
    return detectProjectProfile({ root, projectPath: "." }).languages || [];
  } catch {
    return [];
  }
}

function deriveNextActions(status, blockers, impact) {
  const actions = [];
  if (status === "blocked_needs_approval") actions.push("Approve the pending repair, then re-run operate.");
  for (const gate of blockers) actions.push(`Fix and re-run gate: ${gate.category}`);
  if (impact.uncovered.length > 0) actions.push(`Add tests for uncovered files: ${impact.uncovered.join(", ")}`);
  if (actions.length === 0) actions.push("All required gates passed; ready for review/merge.");
  return actions;
}

// A soft verdict (passed/needs_work/failed) becomes a hard gate result: only a
// genuine "failed" blocks/triggers repair; soft findings are surfaced in detail
// (the strict bar is release:check, not the per-change operate loop).
function gateFrom(status, detail) {
  return { status: status === "failed" ? "failed" : "passed", detail: `${detail} (${status})` };
}

// Default gate runners — ALL in-process and root-portable (work on any repo, no
// sage-kernel npm scripts required). Overridable via options.gateRunners.
function defaultGateRunners() {
  const review = ({ root }) => { const r = createReviewScore({ root }); return gateFrom(r.report.status, `review score ${r.report.score}`); };
  const security = ({ root }) => { const r = createSecurityProof({ root }); return gateFrom(r.status, "security proof"); };
  const dead = ({ root }) => { const r = analyzeDeadCode(root); return gateFrom(r.status, `dead-code ${r.summary?.orphanFiles ?? 0} orphans`); };
  return {
    "impacted-tests": async ({ root, impact }) => runImpactedTests(root, impact),
    "code-review": async (ctx) => review(ctx),
    "senior-review": async (ctx) => review(ctx),
    "secret-scan": async ({ root }) => { const r = scanSast({ root }); return { status: r.high > 0 ? "failed" : "passed", detail: `sast ${r.high} high / ${r.summary?.total ?? 0} findings` }; },
    "security-proof": async (ctx) => security(ctx),
    redteam: async (ctx) => security(ctx),
    "release-check": async ({ root }) => { const r = createReleaseProof({ root }); return gateFrom(r.status, `release ${r.report?.score ?? ""}`); },
    "scaffold-scan": async (ctx) => dead(ctx),
    "dead-code": async (ctx) => dead(ctx),
    audit: async (ctx) => review(ctx),
    // Registered engine plugins run as a REAL gate — a project drops an engine
    // plugin in .sage-kernel/plugins and it executes in the operate cycle (zero
    // core edits). Any plugin returning status "failed" fails the gate.
    "plugin-checks": async ({ root, contract, impact, risk }) => {
      const plugins = listPlugins("engine");
      if (!plugins.length) return { status: "passed", detail: "no engine plugins registered" };
      const results = [];
      for (const plugin of plugins) {
        try {
          const r = await plugin.run({ root, contract, impact, risk });
          results.push({ id: plugin.id, status: r?.status === "failed" ? "failed" : "passed" });
        } catch (error) {
          results.push({ id: plugin.id, status: "failed", error: String(error?.message || error) });
        }
      }
      const failed = results.filter((r) => r.status === "failed");
      return { status: failed.length ? "failed" : "passed", detail: `engine plugins: ${results.map((r) => `${r.id}=${r.status}`).join(", ")}` };
    }
    // proof-graph / mutation are kernel-internal (not root-portable); a loop that
    // needs them supplies them via options.gateRunners. Omitted here so a foreign
    // repo never false-fails on a sage-kernel-only check.
  };
}

const SOURCE_CODE = /\.(mjs|cjs|js|jsx|ts|tsx)$/;
const NOT_SOURCE = /(\.(test|spec|config|d)\.)|(^|\/)(node_modules|dist|build)\//;

// Whole-repo product health: when a change has no impacted tests, run the repo's
// own test command (if any) so operate reflects whether the PRODUCT works, not
// just whether the diff is clean. A repo with red committed tests can never be
// reported "passed" by a docs-only change.
function runRepoHealth(root, spawnSync) {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")); } catch { pkg = null; }
  if (!pkg?.scripts?.test) return { status: "passed", detail: "no impacted tests; repo has no test script" };
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync("npm", ["test", "--silent"], { cwd: root, encoding: "utf8", timeout: 600000, env });
  return {
    status: result.status === 0 ? "passed" : "failed",
    detail: result.status === 0 ? "repo-health: full test suite green (no impacted tests for the diff)" : "repo-health: the repo's committed tests are FAILING (a clean diff is not a working product)",
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

async function runImpactedTests(root, impact) {
  const { spawnSync } = await import("node:child_process");
  const files = (impact.requiredTests || []).filter(Boolean);
  if (files.length === 0) {
    // No covering tests for the change. If the changed set includes real source
    // code, that is a coverage GAP, not a clean pass — refuse fake-green. (Pure
    // doc/config changes with no code legitimately have no impacted tests.)
    const uncoveredCode = (impact.uncovered || []).filter((file) => SOURCE_CODE.test(file) && !NOT_SOURCE.test(file));
    if (uncoveredCode.length > 0) {
      return { status: "failed", detail: `changed code has no covering tests: ${uncoveredCode.slice(0, 5).join(", ")}`, stdout: "", stderr: `Uncovered changed source files: ${uncoveredCode.join(", ")}` };
    }
    // No impacted tests for the diff — but a clean DIFF is not a working PRODUCT.
    // If the repo has a test command, run the WHOLE suite so operate can never
    // report "passed" on a repo whose committed tests are already red.
    return runRepoHealth(root, spawnSync);
  }
  // Strip the parent test-runner context so a `node --test` child behaves
  // normally even when operate is itself invoked from within a test runner
  // (otherwise a nested run can falsely report exit 0).
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;

  // EXECUTION-GROUNDED COVERAGE: don't just check the mapped tests pass — verify
  // the changed SOURCE files were actually EXECUTED to a floor (not merely
  // import-reachable). Node's --test-coverage-include + threshold flags fail the
  // run when an included file's coverage is below the floor — no fragile parsing.
  const changedSource = (impact.files || [])
    .filter((entry) => entry.covered && SOURCE_CODE.test(entry.file) && !NOT_SOURCE.test(entry.file))
    .map((entry) => entry.file);
  const floor = Number.isFinite(impact.coverageFloor) ? impact.coverageFloor : 60;
  const coverageArgs = changedSource.length
    ? ["--experimental-test-coverage", ...changedSource.flatMap((file) => ["--test-coverage-include", file]), `--test-coverage-functions=${floor}`, `--test-coverage-lines=${floor}`]
    : [];

  const result = spawnSync("node", ["--test", ...coverageArgs, ...files], { cwd: root, encoding: "utf8", timeout: 300000, env });
  const detail = coverageArgs.length
    ? `node --test +coverage>=${floor}% on ${changedSource.length} changed file(s)`
    : `node --test (${files.length} files)`;
  // Return stdout/stderr so the repair loop's diagnosis can localize the failure
  // (file:line). A non-zero exit means tests failed OR changed code wasn't
  // executed to the floor (import-reachable != tested).
  return { status: result.status === 0 ? "passed" : "failed", detail, stdout: result.stdout || "", stderr: result.stderr || "" };
}
