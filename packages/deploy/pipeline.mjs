// Deploy -> verify -> rollback loop (P31). Closes the back end of the SDLC: a
// deploy is only kept if it verifies live; otherwise it is rolled back to the
// previous good version. Fail-closed: a failed verify NEVER leaves the bad
// version live. The provider is an interface (local provider is real; cloud
// adapters are credential-gated). `verify` is injectable (health + smoke).

export async function deployVerifyRollback(options = {}) {
  const { provider, verify } = options;
  if (!provider || typeof provider.deploy !== "function") throw new Error("a provider with deploy/rollback is required");
  if (typeof verify !== "function") throw new Error("a verify(handle) function is required");

  const version = options.version;
  const previous = options.previous ?? null;

  const deployed = await provider.deploy(version);
  if (deployed && deployed.status === "blocked_not_available") {
    return { status: "blocked_not_available", reason: deployed.reason, attemptedVersion: version };
  }

  let verdict;
  try {
    verdict = await verify(deployed);
  } catch (error) {
    verdict = { ok: false, error: String(error?.message || error) };
  }

  if (verdict.ok) {
    return { status: "deployed", version, handle: deployed, verdict };
  }

  // Fail closed: roll back to the previous good version (if any).
  let rolledBack = null;
  if (previous !== null && typeof provider.rollback === "function") {
    rolledBack = await provider.rollback(deployed, previous);
  }
  return {
    status: rolledBack ? "rolled_back" : "failed_no_rollback",
    attemptedVersion: version,
    restored: rolledBack ? previous : null,
    verdict,
    rolledBack
  };
}
