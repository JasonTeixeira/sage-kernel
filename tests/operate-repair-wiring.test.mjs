import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildRepairer, callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";
import { resetPlugins } from "../packages/plugins/registry.mjs";

test("P4: a dropped-in ENGINE plugin runs as a real gate in the operate cycle (load-bearing)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-plugin-gate-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "p", type: "module", scripts: { test: "node --test" } }));
  fs.mkdirSync(path.join(dir, "src"));
  fs.mkdirSync(path.join(dir, ".sage-kernel/plugins"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "app.mjs"), "export function app() { return 'TODO: finish'; }\n");
  // An engine plugin that fails the cycle when source contains a TODO marker.
  fs.writeFileSync(path.join(dir, ".sage-kernel/plugins", "no-todo.mjs"),
    "import fs from 'node:fs'; import path from 'node:path';\nexport default { kind: 'engine', id: 'no-todo', run: ({ root }) => { const s = fs.readFileSync(path.join(root, 'src/app.mjs'), 'utf8'); return { status: s.includes('TODO') ? 'failed' : 'passed' }; } };\n");
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "s"], { cwd: dir });
  try {
    const result = await callKernelTool(dir, "kernel.operate.run", { goal: "edit app", acceptanceCriteria: ["x"], files: ["src/app.mjs"], approve: true });
    const pc = (result.gates || []).find((g) => g.category === "plugin-checks");
    assert.ok(pc, "the dropped-in engine plugin must run as a real gate");
    assert.equal(pc.status, "failed", "the plugin flagged the TODO — its verdict is honored");
    assert.match(pc.detail || "", /no-todo=failed/);
  } finally {
    resetPlugins("engine");
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("product-not-diff: operate refuses to pass a docs-only change on a repo whose committed tests are RED", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-redrepo-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "r", type: "module", scripts: { test: "node --test" } }));
  fs.mkdirSync(path.join(dir, "src"));
  fs.mkdirSync(path.join(dir, "test"));
  // A committed, ALREADY-FAILING test (the product is broken).
  fs.writeFileSync(path.join(dir, "src", "total.mjs"), "export function total(items){ return items.reduce((a,b)=>a+b,1); }\n");
  fs.writeFileSync(path.join(dir, "test", "total.test.mjs"), "import test from 'node:test';import assert from 'node:assert/strict';import { total } from '../src/total.mjs';\ntest('t', () => assert.equal(total([1,2,3]), 6));\n");
  fs.writeFileSync(path.join(dir, "README.md"), "# r\n");
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "s"], { cwd: dir });
  try {
    // A DOCS-ONLY change (no source touched). Pre-fix this returned passed/100.
    const result = await callKernelTool(dir, "kernel.operate.run", { goal: "tweak docs", acceptanceCriteria: ["x"], files: ["README.md"], approve: true });
    const impacted = (result.gates || []).find((g) => g.category === "impacted-tests");
    assert.ok(impacted, "impacted-tests gate present");
    assert.notEqual(impacted.status, "passed", "a clean diff on a RED repo must NOT pass (product, not diff)");
    assert.match(impacted.detail || "", /repo-health/);
    assert.notEqual(result.status, "passed");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("execution-grounded: a changed file that is IMPORTED but not EXECUTED fails (tested != reachable)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-exec-cov-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "e", type: "module", scripts: { test: "node --test" } }));
  fs.mkdirSync(path.join(dir, "src"));
  fs.mkdirSync(path.join(dir, "test"));
  // Two functions; the test imports + exercises only `add`, never `untested`.
  fs.writeFileSync(path.join(dir, "src", "m.mjs"), "export function add(a, b) { return a + b; }\nexport function untested(x) { if (x) { return 1; } return 2; }\n");
  fs.writeFileSync(path.join(dir, "test", "m.test.mjs"), "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { add } from \"../src/m.mjs\";\ntest(\"add\", () => { assert.equal(add(1, 2), 3); });\n");
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "s"], { cwd: dir });
  try {
    const result = await callKernelTool(dir, "kernel.operate.run", { goal: "edit m", acceptanceCriteria: ["works"], files: ["src/m.mjs"], approve: true });
    const impacted = (result.gates || []).find((g) => g.category === "impacted-tests");
    assert.ok(impacted, "impacted-tests gate present");
    // The test PASSES and the file is import-reachable — but `untested` never ran,
    // so execution coverage is below the floor and the gate is NOT a clean pass.
    assert.notEqual(impacted.status, "passed", "import-reachable-but-unexecuted code must not pass");
    assert.match(impacted.detail || "", /coverage/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("operate refuses fake-green: changed SOURCE with no covering test fails the impacted-tests gate", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-uncovered-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "u", type: "module", scripts: { test: "node --test" } }));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "util.mjs"), "export function add(a, b) { return a - b; }\n"); // buggy AND untested
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "s"], { cwd: dir });
  try {
    const result = await callKernelTool(dir, "kernel.operate.run", { goal: "add util", acceptanceCriteria: ["works"], files: ["src/util.mjs"], approve: true });
    const impacted = (result.gates || []).find((g) => g.category === "impacted-tests");
    assert.ok(impacted, "impacted-tests gate present");
    assert.notEqual(impacted.status, "passed", "uncovered changed source must NOT be a clean pass");
    assert.match(impacted.detail || "", /no covering tests/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// W1/W2 wiring: kernel.operate.run and kernel.loops.run now build a real
// repairer (self-gated on SAGE_AGENT_COMMAND) that diagnoses each failing gate
// from its stdout/stderr. These tests prove the wiring is honest both ways.

test("buildRepairer returns undefined when no agent is configured (honest: no fake self-heal)", () => {
  const prev = process.env.SAGE_AGENT_COMMAND;
  delete process.env.SAGE_AGENT_COMMAND;
  try {
    assert.equal(buildRepairer(process.cwd()), undefined);
  } finally {
    if (prev !== undefined) process.env.SAGE_AGENT_COMMAND = prev;
  }
});

test("buildRepairer returns a working repairer that diagnoses from stdout/stderr when an agent IS configured", async () => {
  const prevAgent = process.env.SAGE_AGENT_COMMAND;
  const prevVerifier = process.env.SAGE_VERIFIER_COMMAND;
  // A deterministic no-op agent (exits 1 = applied no fix) so the path is fast and
  // exercises diagnose+route+agentRunner without a live model.
  process.env.SAGE_AGENT_COMMAND = "node -e \"process.exit(1)\"";
  delete process.env.SAGE_VERIFIER_COMMAND;
  try {
    const repairer = buildRepairer(process.cwd());
    assert.equal(typeof repairer, "function");
    // Feed a realistic failing gate result carrying real error text; the wired
    // diagnose closure must parse it (it would be content-free before W2).
    const result = await repairer({
      attempt: 1,
      failing: { status: "failed", detail: "node --test (1 files)", stdout: "AssertionError\n  at file:///repo/src/total.mjs:2:10\nexpected: 6\nactual: 7", stderr: "" }
    });
    // The no-op agent applied nothing, so the repairer honestly reports no fix —
    // but the diagnosis (with a real file:line) was produced and attached.
    assert.equal(result.applied, false);
    assert.ok(result.diagnosis, "diagnosis must be attached");
    // The diagnosis located the failing file from the gate's real stdout (it
    // would have been content-free/unknown before the W2 stdout/stderr wiring).
    assert.match(result.diagnosis.primaryLocation.file, /total\.mjs$/);
  } finally {
    if (prevAgent === undefined) delete process.env.SAGE_AGENT_COMMAND; else process.env.SAGE_AGENT_COMMAND = prevAgent;
    if (prevVerifier !== undefined) process.env.SAGE_VERIFIER_COMMAND = prevVerifier;
  }
});
