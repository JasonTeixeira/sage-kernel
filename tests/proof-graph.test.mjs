import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createGraph,
  addNode,
  addEdge,
  validateGraph,
  validateProofGraph,
  verifyClaims,
  verifyGates,
  findPath,
  requirementsForGoal,
  criteriaForRequirement,
  testsForFile,
  queryGraph,
  buildProofGraph,
  NODE_TYPES,
  EDGE_TYPES
} from "../packages/proof/graph.mjs";
import { recordProof } from "../packages/proof/ledger.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-proof-graph-"));
}

test("exposes the documented node and edge vocabularies", () => {
  assert.ok(NODE_TYPES.has("goal") && NODE_TYPES.has("claim") && NODE_TYPES.has("proof"));
  assert.ok(EDGE_TYPES.has("satisfies") && EDGE_TYPES.has("verified_by") && EDGE_TYPES.has("tests"));
});

test("goal links to requirements", () => {
  let g = createGraph();
  g = addNode(g, { id: "goal:1", type: "goal", label: "Ship" });
  g = addNode(g, { id: "req:1", type: "requirement", label: "Auth works" });
  g = addEdge(g, { from: "req:1", to: "goal:1", type: "satisfies" });
  const reqs = requirementsForGoal(g, "goal:1");
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].id, "req:1");
});

test("requirement links to acceptance criteria", () => {
  let g = createGraph();
  g = addNode(g, { id: "req:1", type: "requirement", label: "Auth" });
  g = addNode(g, { id: "ac:1", type: "acceptance_criterion", label: "Rejects bad token" });
  g = addEdge(g, { from: "ac:1", to: "req:1", type: "satisfies" });
  assert.equal(criteriaForRequirement(g, "req:1").length, 1);
});

test("changed file links to mapped tests", () => {
  let g = createGraph();
  g = addNode(g, { id: "changed_file:src/a.mjs", type: "changed_file", label: "src/a.mjs" });
  g = addNode(g, { id: "test:tests/a.test.mjs", type: "test", label: "tests/a.test.mjs" });
  g = addEdge(g, { from: "test:tests/a.test.mjs", to: "changed_file:src/a.mjs", type: "tests" });
  assert.equal(testsForFile(g, "changed_file:src/a.mjs").length, 1);
});

test("a claim is rejected when no proof path exists, accepted when verified_by a proof", () => {
  let g = createGraph();
  g = addNode(g, { id: "claim:done", type: "claim", label: "Feature done" });
  assert.equal(verifyClaims(g).status, "failed");
  assert.equal(verifyClaims(g).unproven[0].id, "claim:done");

  g = addNode(g, { id: "proof:p1", type: "proof", label: "test run", status: "passed" });
  g = addEdge(g, { from: "claim:done", to: "proof:p1", type: "verified_by" });
  assert.equal(verifyClaims(g).status, "passed");
});

test("a claim backed only by a failing proof is rejected", () => {
  let g = createGraph();
  g = addNode(g, { id: "claim:c", type: "claim", label: "X passed" });
  g = addNode(g, { id: "proof:p", type: "proof", label: "p", status: "failed" });
  g = addEdge(g, { from: "claim:c", to: "proof:p", type: "verified_by" });
  assert.equal(verifyClaims(g).status, "failed");
});

test("release gate fails when required proof edges are missing", () => {
  let g = createGraph();
  g = addNode(g, { id: "gate:release", type: "release_gate", label: "release-check" });
  assert.equal(verifyGates(g).status, "failed");

  g = addNode(g, { id: "proof:rc", type: "proof", label: "release-check", status: "passed" });
  g = addEdge(g, { from: "gate:release", to: "proof:rc", type: "verified_by" });
  assert.equal(verifyGates(g).status, "passed");
});

test("validateProofGraph fails on a missing test edge in strict mode (missing test edge fails)", () => {
  let g = createGraph();
  g = addNode(g, { id: "changed_file:src/x.mjs", type: "changed_file", label: "src/x.mjs" });
  assert.equal(validateProofGraph(g, { strict: false }).status, "passed");
  const strict = validateProofGraph(g, { strict: true });
  assert.equal(strict.status, "failed");
  assert.ok(strict.findings.some((f) => /no test edge/.test(f.message)));
});

test("validateProofGraph fails on a claim with no proof edge (missing proof edge fails)", () => {
  let g = createGraph();
  g = addNode(g, { id: "claim:unbacked", type: "claim", label: "shipped" });
  const result = validateProofGraph(g);
  assert.equal(result.status, "failed");
  assert.ok(result.findings.some((f) => /claim not proven/.test(f.message)));
});

test("structural validation rejects unknown types and dangling edges", () => {
  const bad = { nodes: [{ id: "n1", type: "not_a_type" }], edges: [{ from: "n1", to: "ghost", type: "satisfies" }] };
  const result = validateGraph(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /invalid node type/.test(e)));
  assert.ok(result.errors.some((e) => /unknown node/.test(e)));
});

test("buildProofGraph assembles real ledger proofs into proven claims", () => {
  const root = tempRoot();
  recordProof({ tool: "npm test", status: "passed" }, { root });
  recordProof({ tool: "npm run lint", status: "failed" }, { root });
  const g = buildProofGraph({ root, goal: "Prove the build" });
  assert.equal(validateGraph(g).valid, true);
  // The passing proof becomes a proven claim; the failing one does not create a claim.
  const claims = g.nodes.filter((n) => n.type === "claim");
  assert.equal(claims.length, 1);
  assert.equal(verifyClaims(g).status, "passed");
  assert.ok(g.nodes.some((n) => n.type === "goal"));
  assert.ok(findPath(g, claims[0].id, (n) => n.type === "goal", ["satisfies"]));
});

test("MCP proof_graph tools build, query, and validate through the dispatcher", async () => {
  const root = tempRoot();
  recordProof({ tool: "npm test", status: "passed" }, { root });
  const built = await callKernelTool(root, "kernel.proof_graph.build", { goal: "Prove it" });
  assert.ok(built.nodes.length >= 2);

  const validated = await callKernelTool(root, "kernel.proof_graph.validate", {});
  assert.equal(validated.status, "passed");

  const claims = await callKernelTool(root, "kernel.proof_graph.query", { nodeType: "claim" });
  assert.ok(Array.isArray(claims.nodes));
});
