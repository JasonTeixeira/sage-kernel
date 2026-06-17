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
import { assertToolAllowed, signRecord } from "../packages/security/guard.mjs";

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
  assert.equal(verifyApprovalSignature({ ...approval }), false);
  assert.equal(verifyApprovalSignature(null), false);
  assert.equal(createApprovalSignature({ id: "approval_minimal", action: "kernel.test", status: "approved", reason: "minimal" }).length, 64);
});

test("generic record signatures are deterministic and tamper-evident", () => {
  const report = {
    projectPath: "/workspace/sage-kernel",
    mode: "fast",
    status: "passed",
    checks: [{ name: "npm:test", status: "passed" }]
  };
  const signature = signRecord(report);

  assert.equal(signRecord(report), signature);
  assert.notEqual(signRecord({ ...report, status: "failed" }), signature);
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

test("approval ledger rejects invalid requests, unknown approvals, action mismatches, and tampering", () => {
  assert.throws(() => createApprovalLedger({}), /requires db/);
  const { ledger, db } = setup();
  assert.throws(() => ledger.request({ action: "", reason: "missing action" }), /requires action/);
  assert.throws(() => ledger.approve({ id: "approval_missing" }), /Unknown approval/);
  assert.throws(() => ledger.verify({ id: "approval_missing", action: "kernel.test" }), /Unknown approval/);

  const approval = ledger.request({ action: "kernel.jobs.run", reason: "test", payload: { job: "repo-health" } });
  assert.throws(() => ledger.verify({ id: approval.id, action: "kernel.jobs.run", payload: { job: "repo-health" } }), /not approved/);
  ledger.approve({ id: approval.id, decidedBy: "tester" });
  assert.throws(() => ledger.verify({ id: approval.id, action: "kernel.jobs.enqueue", payload: { job: "repo-health" } }), /action mismatch/);

  db.execute("UPDATE approvals SET signature=? WHERE id=?", ["tampered", approval.id]);
  assert.equal(verifyApprovalSignature(ledger.get(approval.id)), false);
  assert.throws(() => ledger.verify({ id: approval.id, action: "kernel.jobs.run", payload: { job: "repo-health" } }), /signature invalid/);
  assert.equal(ledger.list().length, 1);
  assert.equal(ledger.list("approved").length, 1);
  assert.equal(ledger.get("approval_missing"), null);
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

  const wildcard = createPolicyEngine({ scopes: ["dashboard.workflow:*"] });
  assert.equal(wildcard.authorize({ name: "kernel.workflow.daily_summary", risk: "safe", permission: "dashboard.workflow.read" }).allowed, true);
  assert.throws(
    () => wildcard.authorize({ name: "kernel.catalog.search", risk: "safe", permission: "catalog:read" }),
    /Missing permission scope/
  );
});

test("tool guard treats string true as read-only mode", () => {
  const { root } = setup();
  process.env.SAGE_KERNEL_READ_ONLY = "true";
  try {
    assert.throws(
      () => assertToolAllowed(root, "jobs.enqueue", { job: "repo-health" }),
      /Read-only mode blocks/
    );
    assert.equal(assertToolAllowed(root, "catalog.search", {}).allowed, true);
  } finally {
    delete process.env.SAGE_KERNEL_READ_ONLY;
  }
});
