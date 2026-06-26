import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { recordProof, verifyLedger, hashValue } from "../packages/proof/ledger.mjs";

// Property: for ANY sequence of recorded proofs, the ledger remains a verifiable,
// unbroken hash chain. This is the core integrity invariant (cat 3/4).
test("the proof ledger is a verifiable chain for any proof sequence", () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ tool: fc.constantFrom("build", "test", "scan", "lint", "gate", "run", "review", "audit"), status: fc.constantFrom("passed", "failed", "blocked_not_verified", "blocked_not_implemented") }), { minLength: 1, maxLength: 8 }),
      (entries) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-proofprop-"));
        for (const entry of entries) recordProof({ tool: entry.tool || "t", status: entry.status }, { root });
        const verdict = verifyLedger({ root });
        return verdict.status === "verified" && verdict.chainOk === true && verdict.count === entries.length;
      }
    ),
    { numRuns: 40 }
  );
});

// Property: hashValue is deterministic and key-order independent (so equal
// payloads always hash equal — required for tamper detection to be sound).
test("hashValue is deterministic and key-order independent", () => {
  fc.assert(
    fc.property(fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean())), (obj) => {
      const reordered = Object.fromEntries(Object.entries(obj).reverse());
      return hashValue(obj) === hashValue(reordered);
    })
  );
});
