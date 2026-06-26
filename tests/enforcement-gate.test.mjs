import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { checkProofGate, installEnforcementHooks } from "../packages/enforcement/proof-gate.mjs";
import { recordProof } from "../packages/proof/ledger.mjs";

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-enforce-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "e", type: "module" }));
  fs.writeFileSync(path.join(dir, "src.mjs"), "export const v = 1;\n");
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: dir });
  return dir;
}

test("BLOCKS when there is no operate:run proof for the work", () => {
  const dir = gitRepo();
  try {
    fs.writeFileSync(path.join(dir, "src.mjs"), "export const v = 2;\n"); // uncommitted work, no proof
    const v = checkProofGate({ root: dir });
    assert.equal(v.allowed, false);
    assert.match(v.reason, /no passing operate:run proof/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("ALLOWS when a passing operate:run proof matches the current diff", () => {
  const dir = gitRepo();
  try {
    fs.writeFileSync(path.join(dir, "src.mjs"), "export const v = 2;\n"); // the work
    recordProof({ tool: "operate:run", status: "passed", verifier: "operate" }, { root: dir }); // proof captures THIS diff
    const v = checkProofGate({ root: dir });
    assert.equal(v.allowed, true, v.reason);
    assert.ok(v.proofId);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("BLOCKS when the diff CHANGED after the proof (the model edited more, then claimed done)", () => {
  const dir = gitRepo();
  try {
    fs.writeFileSync(path.join(dir, "src.mjs"), "export const v = 2;\n");
    recordProof({ tool: "operate:run", status: "passed", verifier: "operate" }, { root: dir }); // proof for v=2
    fs.writeFileSync(path.join(dir, "src.mjs"), "export const v = 3;\n"); // edited AFTER the proof
    const v = checkProofGate({ root: dir });
    assert.equal(v.allowed, false, "a proof for an older diff must not authorize a newer one");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("BLOCKS when the operate:run proof FAILED (not a passing proof)", () => {
  const dir = gitRepo();
  try {
    fs.writeFileSync(path.join(dir, "src.mjs"), "export const v = 2;\n");
    recordProof({ tool: "operate:run", status: "failed", verifier: "operate" }, { root: dir });
    assert.equal(checkProofGate({ root: dir }).allowed, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the Stop-hook script exits non-zero (blocks) with no proof and 0 with a matching proof", () => {
  const dir = gitRepo();
  const gate = path.resolve("scripts/proof-gate.mjs");
  try {
    fs.writeFileSync(path.join(dir, "src.mjs"), "export const v = 2;\n");
    assert.notEqual(spawnSync("node", [gate], { cwd: dir, encoding: "utf8" }).status, 0, "must block with no proof");
    recordProof({ tool: "operate:run", status: "passed", verifier: "operate" }, { root: dir });
    assert.equal(spawnSync("node", [gate], { cwd: dir, encoding: "utf8" }).status, 0, "must allow with a matching proof");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a matching proof but a LYING/unproven deliverable is BLOCKED (firewall fail-closed)", () => {
  const dir = gitRepo();
  try {
    fs.writeFileSync(path.join(dir, "src.mjs"), "export const v = 2;\n");
    recordProof({ tool: "operate:run", status: "passed", verifier: "operate" }, { root: dir });
    assert.equal(checkProofGate({ root: dir, deliverable: "Updated src.mjs; see the operate run." }).allowed, true);
    const lying = checkProofGate({ root: dir, deliverable: "All done: the feature is complete and fully verified at https://example.com." });
    assert.equal(lying.allowed, false, "an unproven success claim must block even with a matching proof");
    assert.match(lying.reason, /unproven success claims/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("installEnforcementHooks WIRES the Stop hook into the target's .claude/settings.json", () => {
  const dir = gitRepo();
  try {
    const res = installEnforcementHooks({ root: dir });
    const settings = JSON.parse(fs.readFileSync(res.settingsPath, "utf8"));
    assert.ok(Array.isArray(settings.hooks.Stop) && settings.hooks.Stop.length === 1, "Stop hook must be wired, not just present");
    assert.match(settings.hooks.Stop[0].hooks[0].command, /proof-gate\.mjs/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
