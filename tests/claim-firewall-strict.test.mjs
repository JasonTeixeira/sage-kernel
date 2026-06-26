import test from "node:test";
import assert from "node:assert/strict";
import { verifyReport } from "../packages/proof/claim-firewall.mjs";

// P11: in STRICT mode a success claim is supported ONLY by a resolvable valid
// proofId — the lexical escape (URL / backtick path / tests mention) is dropped.

test("STRICT mode rejects a success claim 'backed' only by a URL (the gameable escape)", () => {
  const text = "Done: the feature is complete and fully verified at https://example.com/ci";
  assert.equal(verifyReport(text, { strict: true }).status, "failed", "a URL must not count as proof in strict mode");
  // Lenient default keeps the old behavior for advisory callers.
  assert.equal(verifyReport(text).status, "passed");
});

test("STRICT mode rejects a success claim with a backtick path but no proofId", () => {
  assert.equal(verifyReport("The feature is complete (see `tests/foo.test.mjs`).", { strict: true }).status, "failed");
});

test("STRICT mode rejects an UNRESOLVABLE proofId", () => {
  // proof_deadbeef is not in the ledger -> not a valid proof -> unsupported.
  assert.equal(verifyReport("Feature complete. proof_deadbeef00", { strict: true, root: process.cwd() }).status, "failed");
});

test("an honest blocked_* statement is not a violation", () => {
  assert.equal(verifyReport("blocked_not_verified: cannot reach the DB; next: provide credentials.", { strict: true }).status, "passed");
});
