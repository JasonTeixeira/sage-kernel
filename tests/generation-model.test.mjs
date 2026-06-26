import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateWithModel } from "../packages/generation/model-gen.mjs";

// Deterministic injected runners stand in for the live model so the GATE logic
// (prove-or-discard + acceptance test must pass) is provable in CI.
function seedWithTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-modelgen-"));
  fs.mkdirSync(path.join(root, "test"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "g", type: "module" }));
  fs.writeFileSync(path.join(root, "test/sum.test.mjs"), "import test from 'node:test';import assert from 'node:assert/strict';import { sum } from '../src/sum.mjs';\ntest('sum', () => { assert.equal(sum([1,2,3]), 6); });\n");
  return root;
}
const SPEC = { idea: "sum(items) returns the total", targetFile: "src/sum.mjs", requirements: ["sum([1,2,3]) === 6"] };

test("ACCEPTS a correct generated implementation (prove-or-discard + acceptance test pass)", async () => {
  const root = seedWithTest();
  const runner = async ({ root: r }) => { fs.writeFileSync(path.join(r, "src/sum.mjs"), "export function sum(items){ return items.reduce((a,b)=>a+b,0); }\n"); };
  try {
    const r = await generateWithModel({ spec: SPEC, root, runner, testFile: "test/sum.test.mjs" });
    assert.equal(r.status, "generated");
    assert.equal(r.testsPass, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("REJECTS generated code that fails the acceptance test (no fake-green)", async () => {
  const root = seedWithTest();
  const runner = async ({ root: r }) => { fs.writeFileSync(path.join(r, "src/sum.mjs"), "export function sum(items){ return 0; }\n"); };
  try {
    const r = await generateWithModel({ spec: SPEC, root, runner, testFile: "test/sum.test.mjs" });
    assert.equal(r.status, "rejected");
    assert.equal(r.testsPass, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("REJECTS generated code with a high-severity vulnerability even if the test passes", async () => {
  const root = seedWithTest();
  const runner = async ({ root: r }) => { fs.writeFileSync(path.join(r, "src/sum.mjs"), "export function sum(items){ if(globalThis.x){ eval(globalThis.x); } return items.reduce((a,b)=>a+b,0); }\n"); };
  try {
    const r = await generateWithModel({ spec: SPEC, root, runner, testFile: "test/sum.test.mjs" });
    assert.equal(r.status, "rejected");
    assert.match(r.reason || "", /high-severity|does not parse/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("the command runner path generates via an external agent executable (no live model)", async () => {
  const root = seedWithTest();
  const fake = path.resolve("tests/harness/fake-generator.mjs");
  try {
    const r = await generateWithModel({ spec: SPEC, root, agentCommand: fake, testFile: "test/sum.test.mjs" });
    assert.equal(r.status, "generated");
    assert.equal(r.testsPass, true);
    assert.ok(r.generatedFiles.includes("src/sum.mjs"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("blocked_not_implemented when no generation agent is configured (never fakes)", async () => {
  const prev = process.env.SAGE_AGENT_COMMAND;
  delete process.env.SAGE_AGENT_COMMAND;
  try {
    const r = await generateWithModel({ spec: SPEC, root: process.cwd() });
    assert.equal(r.status, "blocked_not_implemented");
  } finally { if (prev !== undefined) process.env.SAGE_AGENT_COMMAND = prev; }
});
