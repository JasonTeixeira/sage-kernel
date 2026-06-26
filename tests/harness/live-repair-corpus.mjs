// LIVE-MODEL autonomy corpus (P6). Proves the production loop, driven by the real
// model (SAGE_AGENT_COMMAND -> claude), fixes a RANGE of distinct, non-templated
// bugs end-to-end — not just one off-by-one. Each bug is a different reasoning
// shape (boundary, semantic, cross-module, algorithm). Persists a real pass-rate.
//
// Opt-in + nondeterministic + token-cost (real model). Run manually:
//   node tests/harness/live-repair-corpus.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { callKernelTool } from "../../apps/mcp-server/src/kernel-tools.mjs";

const KERNEL = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const AGENT = path.join(KERNEL, "providers/claude-agent.mjs");

// Each bug: a distinct reasoning shape. `files` -> path:content; `tests` -> the
// failing spec; `goal`/`acceptance` -> what the model is told to satisfy.
const BUGS = [
  {
    id: "boundary-comparator",
    files: { "src/age.mjs": "export function isAdult(age) {\n  return age > 18;\n}\n" },
    test: { "test/age.test.mjs": "import test from 'node:test';import assert from 'node:assert/strict';import { isAdult } from '../src/age.mjs';\ntest('18 is an adult', () => { assert.equal(isAdult(18), true); assert.equal(isAdult(17), false); });\n" },
    change: "src/age.mjs", goal: "isAdult must treat exactly 18 as an adult", acceptance: ["isAdult(18)===true", "isAdult(17)===false"]
  },
  {
    id: "semantic-discount",
    files: { "src/discount.mjs": "export function discount(price, pct) {\n  return (price * pct) / 100;\n}\n" },
    test: { "test/discount.test.mjs": "import test from 'node:test';import assert from 'node:assert/strict';import { discount } from '../src/discount.mjs';\ntest('price after discount', () => { assert.equal(discount(100, 20), 80); assert.equal(discount(50, 10), 45); });\n" },
    change: "src/discount.mjs", goal: "discount must return the price AFTER applying the percent off", acceptance: ["discount(100,20)===80"]
  },
  {
    id: "wrong-algorithm-fib",
    files: { "src/fib.mjs": "export function fib(n) {\n  return n * n;\n}\n" },
    test: { "test/fib.test.mjs": "import test from 'node:test';import assert from 'node:assert/strict';import { fib } from '../src/fib.mjs';\ntest('fibonacci', () => { assert.deepEqual([0,1,2,3,4,5,6].map(fib), [0,1,1,2,3,5,8]); });\n" },
    change: "src/fib.mjs", goal: "fib(n) must return the nth Fibonacci number (fib(0)=0, fib(1)=1)", acceptance: ["fib maps 0..6 to 0,1,1,2,3,5,8"]
  },
  {
    id: "cross-module-slugify",
    files: { "src/slug.mjs": "export function slugify(s) {\n  return s.toLowerCase();\n}\n" },
    test: { "test/slug.test.mjs": "import test from 'node:test';import assert from 'node:assert/strict';import { slugify } from '../src/slug.mjs';\ntest('slug', () => { assert.equal(slugify('Hello World Foo'), 'hello-world-foo'); });\n" },
    change: "src/slug.mjs", goal: "slugify must lowercase AND replace whitespace runs with single dashes", acceptance: ["slugify('Hello World Foo')==='hello-world-foo'"]
  },
  {
    id: "null-guard-default",
    files: { "src/total.mjs": "export function total(items) {\n  return items.reduce((a, b) => a + b);\n}\n" },
    test: { "test/total.test.mjs": "import test from 'node:test';import assert from 'node:assert/strict';import { total } from '../src/total.mjs';\ntest('handles empty + normal', () => { assert.equal(total([]), 0); assert.equal(total([1,2,3]), 6); });\n" },
    change: "src/total.mjs", goal: "total must return 0 for an empty array and the sum otherwise", acceptance: ["total([])===0", "total([1,2,3])===6"]
  }
];

function seed(bug) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sage-corpus-${bug.id}-`));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: bug.id, type: "module", scripts: { test: "node --test" } }));
  for (const [rel, content] of Object.entries({ ...bug.files, ...bug.test })) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "seed"], { cwd: dir });
  return dir;
}
function testPasses(dir, testFile) {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  return spawnSync("node", ["--test", testFile], { cwd: dir, encoding: "utf8", env }).status === 0;
}

async function main() {
  const prev = process.env.SAGE_AGENT_COMMAND;
  const prevV = process.env.SAGE_VERIFIER_COMMAND;
  process.env.SAGE_AGENT_COMMAND = `node ${AGENT}`;
  delete process.env.SAGE_VERIFIER_COMMAND;
  const results = [];
  try {
    for (const bug of BUGS) {
      const dir = seed(bug);
      const testFile = Object.keys(bug.test)[0];
      try {
        const before = testPasses(dir, testFile);
        await callKernelTool(dir, "kernel.operate.run", { goal: bug.goal, acceptanceCriteria: bug.acceptance, files: [bug.change, testFile], approve: true, maxRepairAttempts: 3 });
        const after = testPasses(dir, testFile);
        results.push({ id: bug.id, brokenBefore: before === false, fixed: after, source: fs.readFileSync(path.join(dir, bug.change), "utf8").trim() });
        process.stdout.write(`${after ? "FIXED " : "MISS  "} ${bug.id}\n`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  } finally {
    if (prev === undefined) delete process.env.SAGE_AGENT_COMMAND; else process.env.SAGE_AGENT_COMMAND = prev;
    if (prevV !== undefined) process.env.SAGE_VERIFIER_COMMAND = prevV;
  }
  const fixed = results.filter((r) => r.fixed).length;
  const passRate = Number((fixed / BUGS.length).toFixed(4));
  const report = { type: "live-repair-corpus", total: BUGS.length, fixed, passRate, model: "claude", results, generatedAt: new Date().toISOString() };
  const out = path.join(KERNEL, ".sage-kernel/evidence/live-repair-corpus.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nLIVE-REPAIR CORPUS: ${fixed}/${BUGS.length} fixed (pass-rate ${passRate}). Evidence: .sage-kernel/evidence/live-repair-corpus.json`);
  return fixed === BUGS.length ? 0 : 1;
}

process.exit(await main());
