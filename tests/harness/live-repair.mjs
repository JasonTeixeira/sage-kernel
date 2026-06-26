// LIVE-MODEL autonomy proof. Unlike foreign-repair.mjs (deterministic fixer that
// proves the WIRING), this proves the INTELLIGENCE: a REAL model (via
// SAGE_AGENT_COMMAND -> providers/claude-agent.mjs -> `claude -p`) closes a
// NON-TEMPLATED bug end-to-end through the production operate loop. The bug is a
// semantic error (returns the discount amount, not the discounted price) that no
// regex/templated fixer could solve — only actual reasoning over the test intent.
//
// Opt-in + nondeterministic (real model): run manually:
//   node tests/harness/live-repair.mjs
// Writes the outcome to .sage-kernel/evidence/live-repair-latest.json as the
// recorded proof that autonomous self-heal works with a real brain.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { callKernelTool } from "../../apps/mcp-server/src/kernel-tools.mjs";

const KERNEL = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const AGENT = path.join(KERNEL, "providers/claude-agent.mjs");

function seedRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-live-repair-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "live-fix", type: "module", scripts: { test: "node --test" } }, null, 2));
  fs.mkdirSync(path.join(dir, "src"));
  fs.mkdirSync(path.join(dir, "test"));
  // NON-TEMPLATED semantic bug: returns the discount amount, not the price after discount.
  fs.writeFileSync(path.join(dir, "src", "discount.mjs"), "export function discount(price, pct) {\n  return (price * pct) / 100;\n}\n");
  fs.writeFileSync(path.join(dir, "test", "discount.test.mjs"), "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { discount } from \"../src/discount.mjs\";\ntest(\"discount returns the price AFTER the discount\", () => {\n  assert.equal(discount(100, 20), 80);\n  assert.equal(discount(50, 10), 45);\n});\n");
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "seed"], { cwd: dir });
  return dir;
}

function testPasses(dir) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync("node", ["--test", "test/discount.test.mjs"], { cwd: dir, encoding: "utf8", env }).status === 0;
}

async function main() {
  const dir = seedRepo();
  const prev = process.env.SAGE_AGENT_COMMAND;
  process.env.SAGE_AGENT_COMMAND = `node ${AGENT}`;
  const startedAt = new Date().toISOString();
  try {
    if (testPasses(dir)) throw new Error("precondition: the seeded bug must make the test fail");
    const result = await callKernelTool(dir, "kernel.operate.run", {
      goal: "fix discount() so it returns the price after applying the discount",
      acceptanceCriteria: ["discount(100,20) === 80", "discount(50,10) === 45"],
      files: ["src/discount.mjs", "test/discount.test.mjs"],
      approve: true,
      maxRepairAttempts: 3
    });
    const fixed = testPasses(dir);
    const finalSrc = fs.readFileSync(path.join(dir, "src", "discount.mjs"), "utf8");
    const report = {
      type: "live-repair-proof",
      status: fixed ? "passed" : "failed",
      model: "claude (SAGE_AGENT_COMMAND)",
      bug: "non-templated semantic: returned discount amount, not discounted price",
      operateStatus: result.status,
      impactedRepaired: (result.gates || []).find((g) => g.category === "impacted-tests")?.repair?.repaired ?? null,
      fixedSource: finalSrc.trim(),
      startedAt,
      finishedAt: new Date().toISOString()
    };
    const out = path.join(KERNEL, ".sage-kernel/evidence/live-repair-latest.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return fixed ? 0 : 1;
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    return 1;
  } finally {
    if (prev === undefined) delete process.env.SAGE_AGENT_COMMAND; else process.env.SAGE_AGENT_COMMAND = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

process.exit(await main());
