import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-intel-mcp-"));
}

test("Phase I/J/K capabilities dispatch through the MCP surface", async () => {
  const root = tempRoot();

  const diag = await callKernelTool(root, "kernel.operate.diagnose", { stderr: "AssertionError at packages/x.mjs:5:2" });
  assert.equal(diag.category, "assertion");

  const verify = await callKernelTool(root, "kernel.agents.verify", { claim: "fix x" });
  assert.equal(verify.status, "blocked_not_implemented"); // no verifiers configured

  const rubric = await callKernelTool(root, "kernel.evals.model_rubric", { task: { id: "t" }, samples: 2 });
  assert.equal(rubric.status, "blocked_not_implemented"); // no grader configured

  const ground = await callKernelTool(root, "kernel.evals.ground", { text: "edited apps/does-not-exist-xyz.mjs" });
  assert.ok(ground.ungrounded.includes("apps/does-not-exist-xyz.mjs"));

  const outcomes = await callKernelTool(root, "kernel.learning.outcomes", {});
  assert.ok(Array.isArray(outcomes.stats));

  const recall = await callKernelTool(root, "kernel.learning.recall_fix", { signature: { category: "assertion", message: "none yet" } });
  assert.equal(recall.status, "no_match");
});
