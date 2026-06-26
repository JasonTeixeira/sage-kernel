// Bounded, evidence-driven repair loop. Policy:
// - Never hide failures.
// - Bounded retries (budget).
// - Every repair attempt gets a proof record.
// - A destructive repair requires approval.
// - Repeated failure produces a postmortem candidate (the loop never claims a
//   fix it cannot prove).

import { recordProof } from "../proof/ledger.mjs";

// runGate: async () => ({ status, ... })  re-runs the gate and reports status.
// repairer: async ({ attempt, failing }) => ({ applied, description, destructive })
export async function runRepairLoop(options = {}) {
  const root = options.root || process.cwd();
  const runGate = options.runGate;
  const repairer = options.repairer;
  const maxAttempts = options.maxAttempts ?? 2;
  const approve = Boolean(options.approve);
  const runId = options.runId;

  if (typeof runGate !== "function") throw new Error("runRepairLoop requires a runGate function");

  const attempts = [];
  let result = await runGate();
  let attempt = 0;
  let blockedOnApproval = false;

  while (result.status !== "passed" && attempt < maxAttempts) {
    attempt += 1;
    if (typeof repairer !== "function") break;

    const fix = await repairer({ attempt, failing: result });
    if (fix && fix.destructive && !approve) {
      attempts.push({ attempt, status: "blocked_needs_approval", description: fix.description || "destructive repair" });
      blockedOnApproval = true;
      break;
    }

    const proof = recordProof(
      {
        tool: `repair:attempt:${attempt}`,
        status: fix && fix.applied ? "passed" : "failed",
        input: { attempt },
        output: { description: (fix && fix.description) || null, applied: Boolean(fix && fix.applied) },
        verifier: "repair-loop",
        runId
      },
      { root }
    );

    result = await runGate();
    attempts.push({
      attempt,
      applied: Boolean(fix && fix.applied),
      description: (fix && fix.description) || null,
      proofId: proof.proofId,
      result: result.status
    });
  }

  const repaired = result.status === "passed";
  const exhausted = !repaired && !blockedOnApproval && attempt >= maxAttempts && typeof repairer === "function";

  const postmortem = repaired
    ? null
    : {
        candidate: true,
        reason: blockedOnApproval
          ? "repair requires human approval"
          : exhausted
            ? "max repair attempts exhausted; same failure persists"
            : "no repairer available",
        failing: result,
        attempts: attempts.length
      };

  return {
    status: repaired ? "repaired" : blockedOnApproval ? "blocked_needs_approval" : "failed",
    repaired,
    attempts,
    postmortem,
    finalResult: result
  };
}

// Detect a flaky gate: run it N times with no change between runs; mixed results
// mean flakiness. Flaky gates are marked, never silently retried into a pass.
export async function detectFlaky(options = {}) {
  const runGate = options.runGate;
  const runs = options.runs ?? 3;
  if (typeof runGate !== "function") throw new Error("detectFlaky requires a runGate function");
  const results = [];
  for (let i = 0; i < runs; i += 1) {
    results.push((await runGate()).status);
  }
  const distinct = new Set(results);
  const flaky = distinct.has("passed") && results.some((status) => status !== "passed");
  return { flaky, results, marked: flaky ? "quarantine" : "stable" };
}
