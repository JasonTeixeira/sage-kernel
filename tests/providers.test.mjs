import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");

// Create a throwaway directory containing a fake `claude` CLI that echoes
// $STUB_OUTPUT, so the adapters can be contract-tested without a live model.
function stubPathEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-claude-stub-"));
  const bin = path.join(dir, "claude");
  fs.writeFileSync(bin, "#!/bin/sh\nprintf '%s' \"$STUB_OUTPUT\"\n");
  fs.chmodSync(bin, 0o755);
  return dir;
}

function runAdapter(adapter, args, { stub, input }) {
  const dir = stubPathEnv();
  return spawnSync(process.execPath, [path.join("providers", adapter), ...args], {
    cwd: root,
    encoding: "utf8",
    input,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, STUB_OUTPUT: stub }
  });
}

test("claude-rubric reads {rubric} on stdin and emits {score, evidence}", () => {
  const stub = JSON.stringify({ result: JSON.stringify({ score: 95, evidence: "meets rubric" }) });
  const res = runAdapter("claude-rubric.mjs", [], { stub, input: JSON.stringify({ rubric: ["does X"], minimumScore: 80 }) });
  assert.equal(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.score, 95);
  assert.equal(parsed.evidence, "meets rubric");
});

test("claude-rubric degrades to score 0 on unparseable model output", () => {
  const res = runAdapter("claude-rubric.mjs", [], { stub: "not json at all", input: JSON.stringify({ rubric: ["x"] }) });
  assert.equal(res.status, 0);
  assert.equal(JSON.parse(res.stdout).score, 0);
});

test("claude-agent returns exit 0 and a summary on success", () => {
  const res = runAdapter("claude-agent.mjs", ["tdd-guide", JSON.stringify({ instruction: "fix bar", category: "assertion" })], { stub: "patched bar.mjs" });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /patched bar\.mjs/);
});

test("claude-verifier surfaces CONFIRMED for a confirm vote", () => {
  const res = runAdapter("claude-verifier.mjs", ["0", JSON.stringify("the fix is correct")], { stub: "CONFIRMED the change holds" });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /CONFIRMED/);
  // verify.mjs accepts on /confirm|verified|true|yes/i
  assert.match(res.stdout, /confirm/i);
});
