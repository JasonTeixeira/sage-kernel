import test from "node:test";
import assert from "node:assert/strict";
import { runSdlcE2e } from "../packages/sdlc/e2e.mjs";

test("the full SDLC pipeline runs idea->score with every stage proven", async () => {
  const result = await runSdlcE2e({ idea: "a small worker service", profile: "worker-service" });
  assert.equal(result.status, "passed", JSON.stringify(result.stages));
  assert.equal(result.score, 100);
  const stages = result.stages.map((s) => s.stage);
  // The whole arc is present, in order, none skipped.
  assert.deepEqual(stages, ["intake", "generation", "security", "dataflow", "runtime", "deploy"]);
  // Runtime HONESTLY reports not-applicable on a code-only fixture (no app/browser)
  // — never a fabricated green. Every other stage genuinely passes.
  assert.equal(result.stages.find((s) => s.stage === "runtime").status, "blocked_not_available");
  assert.ok(result.stages.every((s) => s.status === "passed" || s.status === "blocked_not_available"));
});

test("a defect injected at generation STOPS the pipeline before deploy (fail-closed)", async () => {
  const result = await runSdlcE2e({ idea: "a small worker service", profile: "worker-service", injectDefect: true });
  assert.equal(result.status, "stopped_before_deploy");
  assert.equal(result.stoppedAt, "generation");
  const stages = result.stages.map((s) => s.stage);
  assert.ok(stages.includes("generation"));
  // Critically: deploy was never reached — bad code cannot be deployed.
  assert.ok(!stages.includes("deploy"));
  assert.equal(result.stages.find((s) => s.stage === "generation").status, "blocked_defect");
});

test("the pipeline composes for a different profile too", async () => {
  const result = await runSdlcE2e({ idea: "stripe webhook handler", profile: "payments-system" });
  assert.equal(result.status, "passed", JSON.stringify(result.stages));
  assert.equal(result.stages.find((s) => s.stage === "deploy").status, "passed");
});
