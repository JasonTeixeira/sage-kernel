import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectRequiredChecks } from "../packages/profiles/required-checks.mjs";

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-reqchk-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}

test("detects an implemented required check with evidence", () => {
  const root = repo({
    "src/webhook.ts": "export function handle(req) {\n  const event = stripe.webhooks.constructEvent(req.body, sig, secret);\n  return event;\n}\n"
  });
  const report = detectRequiredChecks(root, { id: "payments-system", requiredChecks: ["webhook-signature"] });
  const check = report.checks.find((c) => c.check === "webhook-signature");
  assert.equal(check.present, true);
  assert.match(check.evidence, /src\/webhook\.ts:2/);
});

test("reports a missing required check as a gap", () => {
  const root = repo({ "src/index.ts": "export const x = 1;\n" });
  const report = detectRequiredChecks(root, { id: "payments-system", requiredChecks: ["webhook-signature", "idempotency"] });
  assert.equal(report.status, "needs_work");
  assert.deepEqual(report.missing.sort(), ["idempotency", "webhook-signature"].sort());
});

test("a profile with no required checks passes trivially", () => {
  const report = detectRequiredChecks(repo({}), { id: "library", requiredChecks: [] });
  assert.equal(report.status, "passed");
  assert.deepEqual(report.checks, []);
});

test("an unknown check id is surfaced for manual verification, not silently passed", () => {
  const report = detectRequiredChecks(repo({ "a.ts": "export const a=1;" }), { id: "x", requiredChecks: ["totally-novel-check"] });
  const check = report.checks[0];
  assert.equal(check.present, false);
  assert.match(check.reason, /no detector/);
});
