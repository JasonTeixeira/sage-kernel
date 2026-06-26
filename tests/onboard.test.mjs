import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { onboardRepo } from "../scripts/onboard.mjs";

// One-command onboarding produces a real, structured SDLC summary for an arbitrary
// repo, transparently handling the allowed-roots gate. Read-only.

test("onboardRepo returns a structured per-project summary and never throws on a valid repo", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-onboard-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "demo", type: "module", dependencies: { express: "^4.0.0" }, scripts: { test: "node --test" } }));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "server.mjs"), "import express from 'express';\nexpress().listen(3000);\n");
  try {
    const out = await onboardRepo(dir);
    assert.ok(out.summary, "produces a summary");
    assert.ok(out.summary.profile, "detects a profile");
    assert.equal(typeof out.summary.loopScore, "number", "loop score is numeric");
    assert.ok(out.steps.every((s) => s.ok || s.error), "every step has a defined outcome (envelope)");
    // analyzed the SUPPLIED repo, not the kernel
    assert.equal(fs.realpathSync(out.repo), fs.realpathSync(dir));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("onboardRepo rejects a non-directory target with a clear error", async () => {
  await assert.rejects(() => onboardRepo("/Users/Sage/definitely/not/here"), /not a directory/);
});
