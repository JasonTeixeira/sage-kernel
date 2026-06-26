// FOREIGN-REPAIR HARNESS — the single source of truth for "the loop actually
// works." Seeds a REAL foreign repo with a REAL bug (an off-by-one reduce seed),
// points the PRODUCTION entry point (callKernelTool 'kernel.operate.run') at it
// with SAGE_AGENT_COMMAND=deterministic fixer, and asserts the loop fixes the bug
// end to end. "Done" = this harness prints PASS — not gates-green, not a score.
//
// It is a PLAIN script (not a node --test test) on purpose: it spawns `node
// --test` against the fixture, which misbehaves when nested under a parent test
// runner. Run it directly:  node tests/harness/foreign-repair.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { callKernelTool } from "../../apps/mcp-server/src/kernel-tools.mjs";

const FIXER = fileURLToPath(new URL("./offbyone-fixer.mjs", import.meta.url));

function seedBrokenRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-foreign-repair-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "fix-me", type: "module", scripts: { test: "node --test" } }, null, 2));
  fs.mkdirSync(path.join(dir, "src"));
  fs.mkdirSync(path.join(dir, "test"));
  fs.writeFileSync(path.join(dir, "src", "total.mjs"), "export function total(items) {\n  return items.reduce((a, b) => a + b, 1);\n}\n");
  fs.writeFileSync(path.join(dir, "test", "total.test.mjs"), "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { total } from \"../src/total.mjs\";\ntest(\"total sums correctly\", () => { assert.equal(total([1, 2, 3]), 6); });\n");
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "seed"], { cwd: dir });
  return dir;
}

function fixtureTestPasses(dir) {
  // Clean the parent test-runner context so this nested `node --test` is honest
  // even when the harness is spawned from within another test runner.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync("node", ["--test", "test/total.test.mjs"], { cwd: dir, encoding: "utf8", env }).status === 0;
}

async function main() {
  const dir = seedBrokenRepo();
  const prevAgent = process.env.SAGE_AGENT_COMMAND;
  const prevVerifier = process.env.SAGE_VERIFIER_COMMAND;
  process.env.SAGE_AGENT_COMMAND = `node ${FIXER}`;
  // Determinism: no live adversarial verifier in the harness (production keeps it).
  delete process.env.SAGE_VERIFIER_COMMAND;
  try {
    assert.equal(fixtureTestPasses(dir), false, "precondition: the seeded bug must make the test fail");

    const result = await callKernelTool(dir, "kernel.operate.run", {
      goal: "make total() sum correctly",
      acceptanceCriteria: ["total([1,2,3]) === 6"],
      files: ["src/total.mjs", "test/total.test.mjs"],
      approve: true
    });

    // THE proof: the previously-failing test now passes — a real source edit.
    assert.equal(fixtureTestPasses(dir), true, `loop did not fix the bug. operate status=${result.status}, blockers=${JSON.stringify(result.blockers)}`);

    const impacted = (result.gates || []).find((g) => g.category === "impacted-tests");
    assert.ok(impacted, "impacted-tests gate missing from the plan");
    assert.equal(impacted.status, "passed", "impacted-tests gate did not end passed");
    assert.ok(impacted.repair && impacted.repair.repaired === true, "the repair loop must have engaged and repaired the gate");

    // W3 portability: NO gate may false-fail because a sage-kernel npm script is
    // missing on the foreign repo — every default gate runs in-process.
    for (const g of result.gates || []) {
      assert.ok(!/Missing script|npm error|npm run /.test(g.detail || ""), `gate ${g.category} false-failed on a missing sage-kernel script: ${g.detail}`);
    }
    const review = (result.gates || []).find((g) => g.category === "code-review");
    assert.ok(review, "code-review gate missing");
    assert.match(review.detail || "", /review score/, "code-review must run the in-process reviewer, not an npm script");

    console.log(`PASS: production operate loop fixed a real off-by-one bug in a foreign repo end-to-end (overall=${result.status}, gates portable in-process).`);
    return 0;
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    return 1;
  } finally {
    if (prevAgent === undefined) delete process.env.SAGE_AGENT_COMMAND; else process.env.SAGE_AGENT_COMMAND = prevAgent;
    if (prevVerifier !== undefined) process.env.SAGE_VERIFIER_COMMAND = prevVerifier;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

process.exit(await main());
