// Full-SDLC capstone (P33). Composes the whole arc on an isolated fixture:
//   idea -> intake.contract -> generation (prove-or-discard) -> security (SAST) ->
//   dataflow -> runtime -> deploy(verify/rollback) -> score.
// Every stage reports a proven status. A defect injected at the generation stage
// is caught and the pipeline STOPS before deploy (fail-closed: bad code never
// reaches deploy). Deterministic — runtime uses an injected green runner; deploy
// uses the real local provider.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runIntake } from "../intake/contract.mjs";
import { generate } from "../generation/engine.mjs";
import { proveGenerated, commitGeneratedIfProven } from "../generation/gate.mjs";
import { scanSast } from "../security/sast.mjs";
import { scanInterprocedural } from "../security/dataflow.mjs";
import { runtimeGateForTarget } from "../runtime/gate.mjs";
import { deployVerifyRollback } from "../deploy/pipeline.mjs";
import { createLocalProvider } from "../deploy/providers/local.mjs";

export async function runSdlcE2e(options = {}) {
  const idea = options.idea || "a small service";
  const profile = options.profile || "library";
  const injectDefect = options.injectDefect === true;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-sdlc-e2e-"));
  const stages = [];
  const record = (stage, status, detail) => { stages.push({ stage, status, ...(detail ? { detail } : {}) }); };

  try {
    // 1. Intake: idea -> valid, implementable contract + spec.
    const intake = runIntake(idea, profile, { root: dir });
    const intakeOk = intake.contractValid && intake.contract.canImplement;
    record("intake", intakeOk ? "passed" : "failed");
    if (!intakeOk) return finalize("failed", "intake", stages, dir);

    // 2. Generation: prove-or-discard. A seeded defect must be caught here.
    let files = generate(intake.spec).files;
    if (injectDefect) files = [...files, { path: "src/pwn.mjs", content: "export function pwn(req){ execSync(req.body.cmd); }\n" }];
    const verdict = proveGenerated(files);
    if (!verdict.accepted) {
      record("generation", "blocked_defect", verdict.reason);
      // FAIL-CLOSED: stop before any downstream stage (no deploy of bad code).
      return finalize("stopped_before_deploy", "generation", stages, dir);
    }
    record("generation", "passed");
    commitGeneratedIfProven(files, dir);

    // 3. Security SAST on the generated tree.
    const sast = scanSast({ root: dir });
    record("security", sast.high === 0 ? "passed" : "failed");

    // 4. Cross-file dataflow.
    const df = scanInterprocedural({ root: dir });
    record("dataflow", df.high === 0 ? "passed" : "failed");

    // 5. Runtime (production-grade) — HONEST: a code-only fixture has no running
    // app/browser, so the runtime gate reports blocked_not_available (never a
    // fabricated green). On a real app with Playwright it would run live.
    const rt = await runtimeGateForTarget({ root: dir });
    record("runtime", rt.status);

    // 6. Deploy -> verify -> rollback (real local provider, real HTTP).
    const provider = createLocalProvider();
    try {
      const deployVerify = async (handle) => {
        try { return { ok: (await fetch(new URL("/health", handle.baseUrl), { signal: AbortSignal.timeout(2000) })).ok }; }
        catch (error) { return { ok: false, error: String(error?.message || error) }; }
      };
      const deployed = await deployVerifyRollback({ provider, verify: deployVerify, version: { id: "v1", healthy: true }, previous: null });
      record("deploy", deployed.status === "deployed" ? "passed" : "failed");
    } finally {
      await provider.shutdown();
    }

    // A stage is acceptable if it passed OR honestly reported not-applicable
    // (blocked_not_available) — an honest skip never fails the composition proof,
    // but it is NOT counted as a pass either (see finalize()).
    const acceptable = (s) => s.status === "passed" || s.status === "blocked_not_available";
    return finalize(stages.every(acceptable) ? "passed" : "failed", null, stages, dir);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

function finalize(status, stoppedAt, stages, dir) {
  // Honest scoring: blocked_not_available (not-applicable) stages are excluded
  // from the denominator — they are neither a pass nor a penalty.
  const applicable = stages.filter((s) => s.status !== "blocked_not_available");
  const passedCount = stages.filter((s) => s.status === "passed").length;
  return {
    type: "sdlc-e2e",
    status,
    stoppedAt,
    score: applicable.length ? Math.round((passedCount / applicable.length) * 100) : 0,
    stages,
    fixtureRoot: path.basename(dir)
  };
}
