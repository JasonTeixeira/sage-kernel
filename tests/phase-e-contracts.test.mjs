import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyFile,
  classifyText,
  classifyDiff,
  RISK_CLASSES
} from "../packages/risk/diff-classifier.mjs";
import { mapTestImpact } from "../packages/testing/impact-map.mjs";
import {
  createTaskContract,
  validateTaskContract,
  contractGraphSeed
} from "../packages/contracts/task-contract.mjs";
import { validateGraph, verifyClaims } from "../packages/proof/graph.mjs";

const root = path.resolve(import.meta.dirname, "..");

// --- Diff-to-Risk classifier ---

test("package.json change triggers release and security gates", () => {
  const result = classifyDiff(["package.json"]);
  assert.ok(result.classes.includes("release_pipeline"));
  assert.ok(result.requiredGates.includes("release"));
  assert.ok(result.requiredGates.includes("security"));
  assert.equal(result.riskLevel, "high");
});

test("MCP manifest change triggers contract, smoke, and client gates", () => {
  const result = classifyDiff(["apps/mcp-server/tools.json"]);
  assert.ok(result.classes.includes("mcp_tool_surface"));
  for (const gate of ["contract", "smoke", "client", "drift"]) {
    assert.ok(result.requiredGates.includes(gate), `missing gate ${gate}`);
  }
});

test("migration change triggers db migration/rollback test gates", () => {
  const result = classifyDiff(["db/migrations/001_add_users.sql"]);
  assert.ok(result.classes.includes("db_migration"));
  assert.ok(result.requiredGates.includes("db_migration_tests"));
});

test("docs-only change does not force release or security gates", () => {
  const result = classifyDiff(["docs/guide.md", "README.md"]);
  assert.deepEqual(result.classes.sort(), ["docs_only"]);
  assert.equal(result.riskLevel, "low");
  assert.ok(!result.requiredGates.includes("release"));
  assert.ok(!result.requiredGates.includes("security"));
});

test("auth/payment paths classify as high risk", () => {
  assert.ok(classifyFile("src/auth/login.ts").includes("auth"));
  assert.ok(classifyFile("src/payments/stripe.ts").includes("payments"));
  assert.equal(classifyDiff(["src/auth/login.ts"]).riskLevel, "high");
});

test("classifyText flags risk keywords in a goal description", () => {
  assert.ok(classifyText("Harden the auth flow and session handling").includes("auth"));
  assert.equal(classifyText("Improve the homepage copy").length, 0);
});

// --- Test Impact Mapper ---

test("changed MCP tool maps to MCP tests", () => {
  const impact = mapTestImpact(["apps/mcp-server/src/kernel-tools.mjs"], { root });
  assert.ok(impact.files[0].covered);
  assert.ok(impact.files[0].tests.some((t) => /mcp-(contracts|integration)/.test(t)));
});

test("changed dashboard route maps to dashboard tests", () => {
  const impact = mapTestImpact(["apps/dashboard/server.mjs"], { root });
  assert.ok(impact.files[0].tests.includes("tests/dashboard-app.test.mjs"));
});

test("changed review engine maps to review tests", () => {
  const impact = mapTestImpact(["packages/review/review-engine.mjs"], { root });
  assert.ok(impact.files[0].tests.some((t) => /review/.test(t)));
});

test("an unmapped risky change fails coverage", () => {
  const impact = mapTestImpact(["packages/brand-new/thing.mjs"], { root, requireCoverage: true });
  assert.equal(impact.status, "failed");
  assert.deepEqual(impact.uncovered, ["packages/brand-new/thing.mjs"]);
});

// --- Task Contract ---

test("an auth goal produces high-risk security gates", () => {
  const contract = createTaskContract({ root, goal: "Add OAuth login and session auth", acceptanceCriteria: ["Rejects invalid tokens"] });
  assert.equal(contract.riskClassification.level, "high");
  assert.ok(contract.requiredSecurityGates.length > 0);
  assert.ok(contract.requiredReviewGates.includes("senior-review"));
  assert.equal(validateTaskContract(contract).valid, true);
});

test("a docs-only goal produces lower gates", () => {
  const contract = createTaskContract({ root, goal: "Improve the getting-started copy", acceptanceCriteria: ["Reads clearly"] });
  assert.notEqual(contract.riskClassification.level, "high");
  assert.equal(contract.requiredSecurityGates.length, 0);
  assert.equal(contract.requiredReleaseGates.length, 0);
});

test("missing acceptance criteria blocks implementation", () => {
  const contract = createTaskContract({ root, goal: "Do a thing" });
  assert.equal(contract.status, "blocked_missing_acceptance_criteria");
  assert.equal(contract.canImplement, false);
});

test("contract links into a valid proof graph", () => {
  const contract = createTaskContract({
    root,
    goal: "Ship feature X",
    acceptanceCriteria: ["Endpoint returns 200", "Errors are handled"]
  });
  const graph = contractGraphSeed(contract);
  assert.equal(validateGraph(graph).valid, true);
  assert.ok(graph.nodes.some((n) => n.type === "goal"));
  assert.equal(graph.nodes.filter((n) => n.type === "requirement").length, 2);
});

test("RISK_CLASSES covers the documented taxonomy", () => {
  for (const cls of ["auth", "payments", "db_migration", "mcp_tool_surface", "release_pipeline", "docs_only"]) {
    assert.ok(RISK_CLASSES.includes(cls), `missing risk class ${cls}`);
  }
});
