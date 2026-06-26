// Operate Guard — a fast operate variant for git hooks / CI. It classifies the
// changed (staged) files, runs the impacted tests, enforces that high-risk
// changes are test-covered, records proofs, and verifies its own summary with
// the claim firewall. This is the "runs on its own" path: install it as a
// pre-commit hook and the loop guards every commit without being retyped.

import { changedFiles, classifyDiff } from "../risk/diff-classifier.mjs";
import { mapTestImpact } from "../testing/impact-map.mjs";
import { runTestExecution } from "../testing/testing-lab.mjs";
import { recordProof } from "../proof/ledger.mjs";
import { verifyReport } from "../proof/claim-firewall.mjs";
import { selectAgent } from "../agents/router.mjs";

export async function runGuard(options = {}) {
  const root = options.root || process.cwd();
  const files = options.files || changedFiles(root);
  const risk = classifyDiff(files);
  const impact = mapTestImpact(files, { root, requireCoverage: false });
  const runId = options.runId || `run_guard_${new Date().toISOString()}`;

  const gates = [];

  // Gate 1: impacted tests must pass.
  const execution = options.testRunner
    ? await options.testRunner({ testFiles: impact.requiredTests })
    : runTestExecution({ root, testFiles: impact.requiredTests });
  gates.push({
    category: "impacted-tests",
    status: execution.status === "failed" ? "failed" : "passed",
    detail: execution.status,
    agent: selectAgent({ gate: "impacted-tests", riskLevel: risk.riskLevel }).agent
  });

  // Gate 2: a high-risk change must not be left untested (no debt).
  if (risk.riskLevel === "high" && impact.uncovered.length > 0) {
    gates.push({
      category: "risk-coverage",
      status: "failed",
      detail: `high-risk files with no mapped test: ${impact.uncovered.join(", ")}`,
      agent: selectAgent({ gate: "code-review", languages: options.languages, riskLevel: risk.riskLevel }).agent
    });
  }

  for (const gate of gates) {
    const proof = recordProof(
      { tool: `guard:${gate.category}`, status: gate.status, input: { category: gate.category }, output: { detail: gate.detail }, verifier: "guard", runId },
      { root }
    );
    gate.proofId = proof.proofId;
  }

  const passed = gates.filter((gate) => gate.status === "passed").length;
  const status = passed === gates.length ? "passed" : "failed";
  const summary = `Guard ${runId}: ${passed}/${gates.length} gates produced passing proofs; risk ${risk.riskLevel}.`;

  return {
    status,
    runId,
    risk: risk.riskLevel,
    classes: risk.classes,
    filesChanged: files,
    gates,
    uncovered: impact.uncovered,
    claimFirewall: verifyReport(summary, { root }),
    summary
  };
}
