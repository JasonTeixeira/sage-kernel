// Adversarial verification — N independent verifiers must confirm a fix/claim
// before it is accepted. Verifiers are provider-gated (real model calls when a
// command is configured) and injectable for deterministic testing. Default
// posture is skeptical: a tie or any shortfall = rejected.

// Parse a verifier verdict STRICTLY: the verdict must LEAD the output (the prompt
// asks for "CONFIRMED" or "REFUTED" first), and any explicit refutation anywhere
// rejects. This fixes the prior loose /verified/ match that accepted "not
// verified"/"could not confirm"/"REFUTED ... verified the opposite".
export function parseVerifierVerdict(text) {
  const t = String(text || "").trim().toUpperCase();
  if (!t) return false;
  if (/\bREFUTED\b|\bNOT\s+(CONFIRMED|VERIFIED|TRUE)\b|\bUN(CONFIRMED|VERIFIED)\b|\bCANNOT\b|\bFAIL/.test(t)) return false;
  return /^[^A-Z0-9]*(CONFIRMED|VERIFIED|YES|TRUE)\b/.test(t);
}

function commandVerifier(command, count) {
  if (!command || !String(command).trim()) return [];
  return Array.from({ length: count }, (_unused, index) => async ({ claim }) => {
    const { spawnSync } = await import("node:child_process");
    // Claim via env (SAGE_VERIFY_CLAIM) — shell:true word-splits a JSON argv and
    // would shatter it (same bug fixed in the repair agent). argv carries index.
    const env = { ...process.env, SAGE_VERIFY_CLAIM: JSON.stringify(claim) };
    const result = spawnSync(command, [String(index)], { encoding: "utf8", timeout: 120000, shell: true, env });
    const ok = result.status === 0 && parseVerifierVerdict(result.stdout || "");
    return { confirmed: ok, reason: (result.stdout || result.stderr || "").trim().slice(0, 200) };
  });
}

export async function adversariallyVerify(options = {}) {
  const count = options.count ?? 3;
  const runners = options.verifierRunners || commandVerifier(options.verifierCommand || process.env.SAGE_VERIFIER_COMMAND, count);
  if (!runners.length) {
    return { status: "blocked_not_implemented", reason: "no verifiers configured (set SAGE_VERIFIER_COMMAND or inject verifierRunners)" };
  }
  const votes = await Promise.all(
    runners.map(async (runner) => {
      try {
        return await runner({ claim: options.claim });
      } catch (error) {
        return { confirmed: false, reason: `verifier error: ${error.message}` };
      }
    })
  );
  const confirmed = votes.filter((vote) => vote.confirmed).length;
  const needed = options.votesNeeded ?? Math.ceil(runners.length / 2 + 0.5); // strict majority
  return {
    status: confirmed >= needed ? "verified" : "rejected",
    confirmed,
    total: runners.length,
    needed,
    votes
  };
}
