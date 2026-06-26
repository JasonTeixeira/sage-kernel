import test from "node:test";
import assert from "node:assert/strict";
import { synthesizePrd } from "../packages/intake/prd.mjs";
import { deriveArchitecture } from "../packages/intake/design.mjs";
import { prdToContract, buildGenerationSpec, runIntake } from "../packages/intake/contract.mjs";
import { validateGenerationSpec, resolveProfile } from "../packages/intake/spec.mjs";
import { validateTaskContract } from "../packages/contracts/task-contract.mjs";

test("PRD covers EVERY required check for the profile (completeness invariant)", () => {
  for (const id of ["saas-app", "payments-system", "mobile-app"]) {
    const prof = resolveProfile(id);
    const prd = synthesizePrd("build a thing", id);
    assert.equal(prd.coversAllRequiredChecks, true, id);
    const covered = new Set(prd.requirements.map((r) => r.requiredCheck));
    for (const check of prof.requiredChecks) assert.ok(covered.has(check), `${id} missing requirement for ${check}`);
  }
});

test("intake is profile-correct: a payments idea surfaces webhook + idempotency", () => {
  const prd = synthesizePrd("stripe webhook handler", "payments-system");
  const checks = prd.requirements.map((r) => r.requiredCheck);
  assert.ok(checks.includes("webhook-signature"));
  assert.ok(checks.includes("idempotency"));
  assert.ok(prd.risks.some((r) => r.area === "idempotency"));
});

test("architecture yields >=1 component and >=1 ADR decision", () => {
  const prd = synthesizePrd("payments service", "payments-system");
  const design = deriveArchitecture(prd, "payments-system");
  assert.ok(design.components.length >= 1);
  assert.ok(design.decisions.length >= 1);
  assert.ok(design.decisions[0].title.length > 0);
});

test("the produced contract is a VALID, implementable task contract (round-trip)", () => {
  const prd = synthesizePrd("stripe webhook handler", "payments-system");
  const design = deriveArchitecture(prd, "payments-system");
  const contract = prdToContract(prd, design, "payments-system");
  const validity = validateTaskContract(contract);
  assert.equal(validity.valid, true, JSON.stringify(validity.errors));
  assert.equal(contract.status, "ready");
  assert.equal(contract.canImplement, true);
  // Payments risk pulls in the security gate-set.
  assert.ok(contract.requiredSecurityGates.length > 0);
});

test("the generation spec is valid and carries the requirements + risk", () => {
  const prd = synthesizePrd("stripe webhook handler", "payments-system");
  const design = deriveArchitecture(prd, "payments-system");
  const spec = buildGenerationSpec(prd, design, "payments-system");
  const validity = validateGenerationSpec(spec);
  assert.equal(validity.valid, true, JSON.stringify(validity.errors));
  assert.equal(spec.profileId, "payments-system");
  assert.ok(spec.requirements.length > 0);
});

test("validateGenerationSpec rejects malformed specs", () => {
  assert.equal(validateGenerationSpec(null).valid, false);
  assert.equal(validateGenerationSpec({ name: "x", profileId: "p", idea: "i", requirements: [], components: [], risk: { level: "low" } }).valid, false);
  assert.equal(validateGenerationSpec({ name: "x", profileId: "p", idea: "i", requirements: [{ id: "1", label: "l" }], components: [], risk: { level: "nope" } }).valid, false);
});

test("E2E: a one-line idea flows to a valid contract + spec the loop can execute", () => {
  const result = runIntake("stripe webhook handler", "payments-system");
  assert.equal(result.contractValid, true, JSON.stringify(result.contractErrors));
  assert.equal(result.contract.canImplement, true);
  assert.equal(validateGenerationSpec(result.spec).valid, true);
  // The full arc is present: requirements -> acceptance criteria -> gates.
  assert.equal(result.contract.acceptanceCriteria.length, result.prd.requirements.length);
  assert.ok(result.contract.requiredTests.length > 0);
});

test("unknown profile falls back to library (never throws)", () => {
  const prd = synthesizePrd("some idea", "totally-unknown-profile");
  assert.equal(prd.profileId, "library");
  assert.equal(prd.coversAllRequiredChecks, true);
});
