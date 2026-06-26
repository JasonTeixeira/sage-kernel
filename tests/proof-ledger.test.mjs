import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  recordProof,
  recordCommandProof,
  getProof,
  listProofs,
  verifyProof,
  verifyLedger,
  validateProofRecord,
  readLedger,
  hashValue,
  PROOF_REQUIRED_FIELDS
} from "../packages/proof/ledger.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-proof-ledger-"));
}

test("records a proof for a successful command and preserves stdout/stderr artifacts", () => {
  const root = tempRoot();
  const proof = recordCommandProof({ command: process.execPath, args: ["-e", "console.log('hello-proof'); console.error('warn-proof')"] }, { root });
  assert.equal(proof.status, "passed");
  assert.equal(proof.exitCode, 0);
  assert.ok(proof.proofId.startsWith("proof_"));
  assert.ok(proof.stdoutPath && fs.existsSync(path.join(root, proof.stdoutPath)));
  assert.match(fs.readFileSync(path.join(root, proof.stdoutPath), "utf8"), /hello-proof/);
  assert.match(fs.readFileSync(path.join(root, proof.stderrPath), "utf8"), /warn-proof/);
  assert.ok(proof.artifacts.length >= 2);
});

test("records a proof for a failed command", () => {
  const root = tempRoot();
  const proof = recordCommandProof({ command: process.execPath, args: ["-e", "process.exit(3)"] }, { root });
  assert.equal(proof.status, "failed");
  assert.equal(proof.exitCode, 3);
  assert.equal(verifyProof(proof.proofId, { root }).status, "verified");
});

test("produced records satisfy every schema-required field", () => {
  const root = tempRoot();
  const proof = recordProof({ tool: "unit.test", input: { a: 1 }, output: { ok: true }, status: "passed" }, { root });
  for (const field of PROOF_REQUIRED_FIELDS) {
    assert.ok(proof[field] !== undefined && proof[field] !== null, `missing ${field}`);
  }
  assert.equal(validateProofRecord(proof).valid, true);
  assert.equal(proof.inputHash, hashValue({ a: 1 }));
});

test("rejects a malformed proof record (validation) and refuses to record invalid status", () => {
  assert.equal(validateProofRecord({}).valid, false);
  assert.equal(validateProofRecord({ proofId: "bad" }).valid, false);
  const root = tempRoot();
  assert.throws(() => recordProof({ tool: "x", status: "totally-made-up" }, { root }), /malformed proof/);
});

test("detects a tampered proof hash", () => {
  const root = tempRoot();
  const proof = recordProof({ tool: "tamper.test", input: { v: 1 }, status: "passed" }, { root });
  assert.equal(verifyProof(proof.proofId, { root }).status, "verified");

  // Tamper with the persisted record content without fixing recordHash.
  const file = path.join(root, ".sage-kernel/proof/ledger.jsonl");
  const record = JSON.parse(fs.readFileSync(file, "utf8").trim());
  record.status = "failed";
  fs.writeFileSync(file, `${JSON.stringify(record)}\n`);

  const verdict = verifyProof(proof.proofId, { root });
  assert.equal(verdict.status, "tampered");
  assert.ok(verdict.issues.some((issue) => /recordHash mismatch/.test(issue)));
});

test("detects a tampered artifact", () => {
  const root = tempRoot();
  const proof = recordProof({ tool: "artifact.test", stdout: "original", status: "passed" }, { root });
  fs.writeFileSync(path.join(root, proof.stdoutPath), "rewritten");
  const verdict = verifyProof(proof.proofId, { root });
  assert.equal(verdict.status, "tampered");
  assert.ok(verdict.issues.some((issue) => /artifact hash mismatch/.test(issue)));
});

test("supports parent/child proof relationships", () => {
  const root = tempRoot();
  const parent = recordProof({ tool: "parent", status: "passed" }, { root });
  const child = recordProof({ tool: "child", status: "passed", parentProofIds: [parent.proofId] }, { root });
  assert.deepEqual(child.parentProofIds, [parent.proofId]);
  assert.equal(getProof(parent.proofId, { root }).tool, "parent");
});

test("chains records and verifies the whole ledger; detects chain break", () => {
  const root = tempRoot();
  const first = recordProof({ tool: "a", status: "passed" }, { root });
  const second = recordProof({ tool: "b", status: "passed" }, { root });
  assert.equal(second.prevHash, first.recordHash);

  const ok = verifyLedger({ root });
  assert.equal(ok.status, "verified");
  assert.equal(ok.count, 2);
  assert.equal(ok.chainOk, true);

  // Delete the first record -> chain must break.
  const file = path.join(root, ".sage-kernel/proof/ledger.jsonl");
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  fs.writeFileSync(file, `${lines[1]}\n`);
  const broken = verifyLedger({ root });
  assert.equal(broken.status, "tampered");
  assert.equal(broken.chainOk, false);
});

test("MCP proof tools record, get, list, and verify through the dispatcher", async () => {
  const root = tempRoot();
  const recorded = await callKernelTool(root, "kernel.proof.record", { tool: "mcp.demo", status: "passed", input: { k: 1 } });
  assert.ok(recorded.proofId.startsWith("proof_"));

  const fetched = await callKernelTool(root, "kernel.proof.get", { proofId: recorded.proofId });
  assert.equal(fetched.tool, "mcp.demo");

  const listed = await callKernelTool(root, "kernel.proof.list", { limit: 10 });
  assert.equal(listed.length, 1);

  const verdict = await callKernelTool(root, "kernel.proof.verify", {});
  assert.equal(verdict.status, "verified");
});

test("listProofs filters by runId and status and an empty ledger verifies as empty", () => {
  const root = tempRoot();
  assert.equal(verifyLedger({ root }).status, "empty");
  recordProof({ tool: "x", status: "passed", runId: "run-1" }, { root });
  recordProof({ tool: "y", status: "failed", runId: "run-1" }, { root });
  recordProof({ tool: "z", status: "passed", runId: "run-2" }, { root });
  assert.equal(listProofs({ root, runId: "run-1" }).length, 2);
  assert.equal(listProofs({ root, status: "failed" }).length, 1);
  assert.equal(readLedger({ root }).length, 3);
});

test("listProofs filters by tool and honors the limit option", () => {
  const root = tempRoot();
  recordProof({ tool: "alpha", status: "passed" }, { root });
  recordProof({ tool: "beta", status: "passed" }, { root });
  recordProof({ tool: "alpha", status: "passed" }, { root });
  const alpha = listProofs({ root, tool: "alpha" });
  assert.equal(alpha.length, 2);
  assert.equal(alpha.every((proof) => proof.tool === "alpha"), true);
  assert.equal(listProofs({ root, tool: "beta" }).length, 1);
  // limit keeps the most recent N records.
  assert.equal(listProofs({ root, limit: 1 }).length, 1);
  assert.equal(listProofs({ root, limit: 2 }).length, 2);
});

test("validation rejects a non-array artifacts field", () => {
  const root = tempRoot();
  const proof = recordProof({ tool: "v", status: "passed" }, { root });
  assert.equal(validateProofRecord({ ...proof, artifacts: "not-an-array" }).valid, false);
  assert.equal(validateProofRecord({ ...proof, artifacts: [] }).valid, true);
});

test("omits stdout/stderr artifacts when none are provided", () => {
  const root = tempRoot();
  const proof = recordProof({ tool: "no-output", status: "passed" }, { root });
  assert.ok(!proof.stdoutPath, "no stdout artifact expected");
  assert.ok(!proof.stderrPath, "no stderr artifact expected");
  assert.equal((proof.artifacts || []).some((ref) => /stdout\.txt|stderr\.txt/.test(ref)), false);
});
