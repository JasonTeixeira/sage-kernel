// Agent execution adapter — the keystone of autonomous self-healing. Given a
// diagnosis and a routed agent, it asks an agent to produce a fix, applies it,
// re-runs the gate, and (optionally) requires adversarial verification before
// accepting. Provider-gated: without a configured/injected agent runner it
// honestly returns blocked_not_implemented (never fakes a fix). Every attempt is
// recorded as a proof by the surrounding repair loop.

import { recordProof } from "../proof/ledger.mjs";
import { adversariallyVerify } from "./verify.mjs";
import { recallFix, recordFix } from "../learning/knowledge.mjs";

export function isAgentConfigured(env = process.env) {
  return Boolean(env.SAGE_AGENT_COMMAND && String(env.SAGE_AGENT_COMMAND).trim());
}

// Build a default agent runner that shells out to a configured command. The
// command receives the diagnosis as JSON on argv and is expected to mutate the
// working tree and exit 0 when it applied a fix.
function commandAgentRunner(command) {
  if (!command || !String(command).trim()) return null;
  return async ({ diagnosis, agent, root }) => {
    const { spawnSync } = await import("node:child_process");
    // Deliver the diagnosis via env (SAGE_DIAGNOSIS_JSON), NOT as a shell argv —
    // shell:true word-splits a JSON argv and shatters it, so the agent never
    // actually receives the file:line aim. Env is shell-safe and lossless. argv
    // still carries the agent id for back-compat.
    const env = { ...process.env, SAGE_DIAGNOSIS_JSON: JSON.stringify(diagnosis) };
    const result = spawnSync(command, [agent || "auto"], {
      cwd: root,
      encoding: "utf8",
      timeout: 600000,
      shell: true,
      env
    });
    return {
      applied: result.status === 0,
      description: (result.stdout || result.stderr || "").trim().slice(0, 300) || `${agent} attempted a fix`
    };
  };
}

// Returns a repairer compatible with runRepairLoop:
//   async ({ attempt, failing }) => { applied, description, destructive }
// It diagnoses the failure, asks the agent for a fix, optionally verifies it
// adversarially, and lets the repair loop re-run the gate.
export function createAutonomousRepairer(options = {}) {
  const root = options.root || process.cwd();
  const agentRunner = options.agentRunner || commandAgentRunner(options.agentCommand || process.env.SAGE_AGENT_COMMAND);
  const diagnose = options.diagnose; // ({ failing }) => diagnosis
  const route = options.route; // (diagnosis) => agent id
  const requireVerification = options.requireVerification !== false;

  return async ({ attempt, failing }) => {
    if (!agentRunner) {
      recordProof(
        { tool: `autonomous-repair:attempt:${attempt}`, status: "blocked_not_implemented", input: { attempt }, output: { reason: "no agent configured" }, verifier: "agent-executor", runId: options.runId },
        { root }
      );
      return { applied: false, description: "blocked_not_implemented: no agent configured (set SAGE_AGENT_COMMAND or inject agentRunner)" };
    }

    const diagnosis = diagnose ? diagnose({ failing }) : { category: "unknown", instruction: "Fix the failing gate.", impactedFiles: [] };
    const agent = route ? route(diagnosis) : "general-purpose";

    // Recall a similar past fix to prime the agent ("gets smarter over time").
    const recalled = options.knowledge !== false ? recallFix(diagnosis, { root }) : null;
    if (recalled) diagnosis.recalledFix = { fix: recalled.fix, similarity: recalled.score };

    const proposal = await agentRunner({ diagnosis, agent, root, attempt });
    if (!proposal || !proposal.applied) {
      return { applied: false, description: `agent ${agent} produced no fix`, diagnosis };
    }

    // Adversarial verification gate (skeptical): only accept a fix that passes.
    if (requireVerification) {
      const verdict = await adversariallyVerify({
        claim: `Fix for ${diagnosis.category} at ${diagnosis.primaryLocation?.file || "unknown"}: ${proposal.description}`,
        verifierRunners: options.verifierRunners,
        verifierCommand: options.verifierCommand,
        count: options.verifierCount
      });
      if (verdict.status === "rejected") {
        return { applied: false, description: `fix rejected by adversarial verification (${verdict.confirmed}/${verdict.total})`, diagnosis, verdict };
      }
      // blocked_not_implemented verification (no verifiers) does not block — the
      // repair loop's gate re-run is still the source of truth.
      if (options.knowledge !== false) recordFix({ signature: diagnosis, fix: proposal.description }, { root });
      return { applied: true, description: proposal.description, agent, diagnosis, verdict };
    }

    if (options.knowledge !== false) recordFix({ signature: diagnosis, fix: proposal.description }, { root });
    return { applied: true, description: proposal.description, agent, diagnosis };
  };
}
