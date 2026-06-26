import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");

// Per-tool smoke matrix (cat 6): every safe, read-only tool must actually run
// and return a defined result on the kernel itself — proving the surface works,
// not just that the manifest lists it. (Slow/mutating tools are exercised by
// their own dedicated tests; this is the fast read-only conformance sweep.)
const SAFE_SMOKE = [
  ["kernel.phase.status", {}],
  ["kernel.profile.detect", { projectPath: "." }],
  ["kernel.profile.gaps", { projectPath: "." }],
  ["kernel.review.quality_score", { projectPath: "." }],
  ["kernel.security.sast", { projectPath: "." }],
  ["kernel.security.polyglot", { projectPath: "." }],
  ["kernel.chaos.matrix", {}],
  ["kernel.perf.incremental", { projectPath: "." }],
  ["kernel.runtime.gate", { projectPath: "." }],
  ["kernel.autonomy.harness", {}],
  ["kernel.intake.prd", { idea: "stripe webhook handler", profile: "payments-system" }],
  ["kernel.intake.design", { idea: "stripe webhook handler", profile: "payments-system" }],
  ["kernel.intake.contract", { idea: "stripe webhook handler", profile: "payments-system" }],
  ["kernel.generation.scaffold", { idea: "stripe webhook handler", profile: "payments-system" }],
  ["kernel.generation.prove", { idea: "stripe webhook handler", profile: "payments-system" }],
  ["kernel.security.dataflow", { projectPath: "." }],
  ["kernel.deploy.verify_rollback", {}],
  ["kernel.sdlc.e2e", { idea: "a small service", profile: "library" }],
  ["kernel.enforce.proof_gate", {}],
  ["kernel.refactor.dead_code", { projectPath: "." }],
  ["kernel.cockpit.status", {}],
  ["kernel.catalog.search", { query: "qa", limit: 2 }],
  ["kernel.template.list", {}],
  ["kernel.agents.list", {}],
  ["kernel.loops.list", {}],
  ["kernel.evidence.list", { limit: 3 }],
  ["kernel.proof.list", { limit: 3 }],
  ["kernel.testing.impact", { files: ["packages/proof/ledger.mjs"] }],
  ["kernel.risk.classify_diff", { files: ["packages/proof/ledger.mjs"] }],
  ["kernel.loop.score", { projectPath: ".", risk: "high" }]
];

test("every safe read-only tool runs and returns a defined result", async () => {
  const failures = [];
  for (const [name, input] of SAFE_SMOKE) {
    try {
      const result = await callKernelTool(root, name, input);
      if (result === undefined || result === null) failures.push(`${name}: returned ${result}`);
    } catch (error) {
      failures.push(`${name}: threw ${error.message}`);
    }
  }
  assert.deepEqual(failures, [], `tool smoke failures:\n${failures.join("\n")}`);
});

test("the smoke matrix covers a representative slice of the surface", () => {
  assert.ok(SAFE_SMOKE.length >= 15);
  // Spans understand / review / security / testing / observability surfaces.
  const namespaces = new Set(SAFE_SMOKE.map(([name]) => name.split(".")[1]));
  for (const ns of ["profile", "review", "security", "testing", "cockpit", "loop"]) {
    assert.ok(namespaces.has(ns), `smoke matrix should cover ${ns}`);
  }
});
