import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTestingLabProof, runTestExecution } from "../packages/testing/testing-lab.mjs";
import { generateMutants, runMutationTesting, MUTATORS } from "../packages/testing/mutation.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-testproof-"));
}

// --- testing-lab real execution ---

test("testing proof is plan-only by default and transparently reports executed:false", () => {
  const proof = createTestingLabProof({ root: repoRoot, projectPath: "." });
  assert.equal(proof.status, "passed");
  assert.equal(proof.executed, false);
  assert.equal(proof.execution.status, "not_run");
});

test("testing proof goes red when executed tests fail", () => {
  const proof = createTestingLabProof({
    root: repoRoot,
    projectPath: ".",
    execute: true,
    runner: () => ({ status: "failed", files: ["x.test.mjs"] })
  });
  assert.equal(proof.status, "failed");
  assert.equal(proof.executed, false);
});

test("testing proof passes when executed tests pass", () => {
  const proof = createTestingLabProof({
    root: repoRoot,
    projectPath: ".",
    execute: true,
    runner: () => ({ status: "passed", files: ["x.test.mjs"] })
  });
  assert.equal(proof.status, "passed");
  assert.equal(proof.executed, true);
});

test("runTestExecution skips honestly when there are no impacted tests", () => {
  const result = runTestExecution({ root: repoRoot, testFiles: [] });
  assert.equal(result.status, "skipped");
});

// --- mutation testing ---

test("generateMutants produces token-level mutants and avoids substring words", () => {
  const mutants = generateMutants("const a = x === y && construed;", { maxMutants: 30 });
  assert.ok(mutants.some((m) => m.mutator === "strict-eq"));
  assert.ok(mutants.some((m) => m.mutator === "logical-and"));
  // 'construed' contains 'true' but must NOT be mutated as a boolean.
  assert.ok(!mutants.some((m) => m.mutator === "bool-true"));
});

test("MUTATORS cover condition, boolean, and logical fault classes", () => {
  const ids = MUTATORS.map((m) => m.id);
  for (const id of ["strict-eq", "logical-and", "bool-true", "gte"]) assert.ok(ids.includes(id));
});

test("mutation testing kills mutants when the tests are strong (real node --test on a fixture)", async () => {
  const root = tempRoot();
  fs.writeFileSync(path.join(root, "calc.mjs"), "export const eq = (a, b) => a === b;\nexport const ok = () => true;\n");
  fs.writeFileSync(
    path.join(root, "calc.test.mjs"),
    [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { eq, ok } from "./calc.mjs";',
      'test("eq", () => { assert.equal(eq(1, 1), true); assert.equal(eq(1, 2), false); });',
      'test("ok", () => assert.equal(ok(), true));'
    ].join("\n")
  );
  const result = await runMutationTesting({ root, targetFile: "calc.mjs", testFiles: ["calc.test.mjs"], threshold: 80 });
  assert.equal(result.status, "passed");
  assert.ok(result.killed > 0);
  assert.equal(result.restored, true);
});

test("mutation testing flags surviving mutants when tests are weak", async () => {
  const root = tempRoot();
  fs.writeFileSync(path.join(root, "calc.mjs"), "export const eq = (a, b) => a === b;\n");
  // Weak test: never exercises the false branch, so === -> !== survives.
  fs.writeFileSync(
    path.join(root, "calc.test.mjs"),
    [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { eq } from "./calc.mjs";',
      'test("eq weak", () => { assert.equal(typeof eq, "function"); });'
    ].join("\n")
  );
  const result = await runMutationTesting({ root, targetFile: "calc.mjs", testFiles: ["calc.test.mjs"], threshold: 80 });
  assert.equal(result.status, "failed");
  assert.ok(result.survived.length > 0);
  assert.equal(result.restored, true);
});

test("mutation testing restores the target file even when a runner throws", async () => {
  const root = tempRoot();
  const original = "export const eq = (a, b) => a === b;\n";
  fs.writeFileSync(path.join(root, "calc.mjs"), original);
  fs.writeFileSync(path.join(root, "calc.test.mjs"), "import 'node:test';\n");
  await assert.rejects(
    runMutationTesting({
      root,
      targetFile: "calc.mjs",
      testFiles: ["calc.test.mjs"],
      runner: () => {
        throw new Error("boom");
      }
    })
  );
  assert.equal(fs.readFileSync(path.join(root, "calc.mjs"), "utf8"), original);
});
