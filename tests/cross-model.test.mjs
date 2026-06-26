import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOperate } from "../packages/operate/operate.mjs";
import { listProofs, verifyLedger } from "../packages/proof/ledger.mjs";

// P12: the operate loop is provider-NEUTRAL. The reasoning model is just an
// injected repairer; nothing in the proof spine depends on the model's identity.
// We drive the SAME loop under two different "models" (a Claude-shaped agent and
// a non-Claude/Cursor-shaped agent) and assert identical proof artifacts.

function repoWithFixableGate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-xmodel-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", type: "module" }));
  return dir;
}

// A gate that fails until the model writes a sentinel "fix" file — the same
// observable contract any real model's edit would satisfy.
function gateThatNeedsAFix(dir) {
  return async () => (fs.existsSync(path.join(dir, "FIXED")) ? { status: "passed", detail: "fix present" } : { status: "failed", detail: "needs fix" });
}

// A repairer modeling ANY agent: it "edits" the tree (writes the sentinel). The
// only thing that varies is the model label it stamps into its description.
function modelRepairer(dir, modelLabel) {
  return async () => {
    fs.writeFileSync(path.join(dir, "FIXED"), `repaired by ${modelLabel}\n`);
    return { applied: true, description: `${modelLabel} applied a fix` };
  };
}

async function driveUnder(modelLabel) {
  const dir = repoWithFixableGate();
  try {
    const result = await runOperate({
      root: dir, goal: "fix the gate", acceptanceCriteria: ["gate passes"], files: ["src.mjs"],
      plan: ["model-gate"],
      gateRunners: { "model-gate": gateThatNeedsAFix(dir) },
      repairer: modelRepairer(dir, modelLabel)
    });
    const operateProof = listProofs({ root: dir }).find((p) => p.tool === "operate:run");
    return {
      status: result.status,
      gateCategories: result.gates.map((g) => g.category).sort(),
      graphValid: result.proofGraphValidation?.status,
      ledgerOk: verifyLedger({ root: dir }).status,
      hasOperateProof: Boolean(operateProof),
      operateProofPassed: operateProof?.status,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("identical proof artifacts under a Claude-shaped agent and a non-Claude agent (agnostic spine)", async () => {
  const claude = await driveUnder("claude");
  const cursor = await driveUnder("cursor/generic");

  // The autonomy worked for both: failing gate -> repaired -> passed.
  assert.equal(claude.status, "passed", "Claude-driven loop must reach passed");
  assert.equal(cursor.status, "passed", "non-Claude-driven loop must reach passed");

  // The PROOF artifacts are structurally identical — the spine is model-agnostic.
  assert.deepEqual(cursor.gateCategories, claude.gateCategories, "same gate set regardless of model");
  assert.equal(cursor.graphValid, claude.graphValid);
  assert.equal(cursor.graphValid, "passed", "proof graph must validate");
  assert.equal(cursor.ledgerOk, claude.ledgerOk);
  assert.equal(cursor.ledgerOk, "verified", "anchored ledger must verify clean under both");
  assert.equal(cursor.hasOperateProof, true);
  assert.equal(claude.hasOperateProof, true);
  assert.equal(cursor.operateProofPassed, claude.operateProofPassed);
  assert.equal(cursor.operateProofPassed, "passed");
});
