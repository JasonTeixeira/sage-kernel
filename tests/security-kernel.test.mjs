import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createSqliteAdapter } from "../packages/db/adapter.mjs";
import {
  createApprovalLedger,
  createApprovalSignature,
  verifyApprovalSignature
} from "../packages/security/approvals.mjs";
import { createPolicyEngine } from "../packages/core/policy-engine.mjs";

const schemaRoot = path.resolve(import.meta.dirname, "..");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-security-"));
  const db = createSqliteAdapter({ root, schemaRoot });
  db.init();
  return { root, db, ledger: createApprovalLedger({ db, signer: "test-signer" }) };
}

test("approval signatures are deterministic and tamper-evident", () => {
  const approval = {
    id: "approval_1",
    action: "kernel.jobs.run",
    status: "approved",
    reason: "test",
    payload: { job: "repo-health" },
    createdAt: "2026-01-01T00:00:00.000Z",
    decidedAt: "2026-01-01T00:00:01.000Z",
    decidedBy: "tester"
  };
  const signature = createApprovalSignature(approval);
  assert.equal(verifyApprovalSignature({ ...approval, signature }), true);
  assert.equal(verifyApprovalSignature({ ...approval, action: "kernel.jobs.enqueue", signature }), false);
});

test("approval ledger can request, approve, verify, and reject scope mismatches", () => {
  const { ledger } = setup();
  const requested = ledger.request({
    action: "kernel.jobs.run",
    reason: "run local health check",
    payload: { job: "repo-health" }
  });
  assert.equal(requested.status, "pending");

  const approved = ledger.approve({ id: requested.id, decidedBy: "tester" });
  assert.equal(approved.status, "approved");
  assert.equal(ledger.verify({ id: requested.id, action: "kernel.jobs.run", payload: { job: "repo-health" } }).allowed, true);
  assert.throws(
    () => ledger.verify({ id: requested.id, action: "kernel.jobs.run", payload: { job: "nightly-local-audit" } }),
    /scope mismatch/
  );
});

test("policy engine requires signed approval for approval-required tools", () => {
  const { ledger } = setup();
  const policy = createPolicyEngine({ approvalLedger: ledger });
  const tool = {
    name: "kernel.jobs.run",
    risk: "mutating",
    permission: "jobs:run",
    approvalRequired: true
  };

  assert.throws(() => policy.authorize(tool, { job: "repo-health" }), /requires approval/);
  const approval = ledger.request({ action: "kernel.jobs.run", reason: "test", payload: { job: "repo-health" } });
  ledger.approve({ id: approval.id, decidedBy: "tester" });
  assert.equal(policy.authorize(tool, { job: "repo-health", approvalId: approval.id }).allowed, true);
});

test("policy engine enforces permission scopes", () => {
  const policy = createPolicyEngine({ scopes: ["catalog:read"] });
  assert.equal(policy.authorize({ name: "kernel.catalog.search", risk: "safe", permission: "catalog:read" }).allowed, true);
  assert.throws(
    () => policy.authorize({ name: "kernel.jobs.enqueue", risk: "mutating", permission: "jobs:write" }),
    /Missing permission scope/
  );
});
