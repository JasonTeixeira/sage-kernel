import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { __workflowEngineTestInternals, runWorkflow } from "../engine.mjs";

const { proofCommandResult, runShell } = __workflowEngineTestInternals;

export function createWorkflowEngineFixture(options = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-workflow-engine-"));
  fs.mkdirSync(path.join(fixtureRoot, "src"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "tests"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), JSON.stringify({
    type: "module",
    scripts: { test: "node tests/math.test.mjs" }
  }, null, 2));
  fs.writeFileSync(path.join(fixtureRoot, "src/math.mjs"), "export function addOne() { return 1; }\n");
  fs.writeFileSync(path.join(fixtureRoot, "tests/math.test.mjs"), [
    "import { addOne } from '../src/math.mjs';",
    "if (addOne() !== 2) {",
    "  console.error('expected addOne() to return 2');",
    "  process.exit(1);",
    "}",
    "console.log('fixture passed');"
  ].join("\n"));

  const before = runShell("npm test", { root: fixtureRoot });
  const workflow = runWorkflow({
    id: "fixture_repair",
    objective: "Repair controlled fixture test failure.",
    retryLimit: 1,
    steps: [
      { id: "inspect", type: "inspect" },
      { id: "unit", type: "test", command: "npm test" },
      { id: "review", type: "review" }
    ]
  }, {
    root: fixtureRoot,
    repairer(failure) {
      fs.writeFileSync(path.join(fixtureRoot, "src/math.mjs"), "export function addOne() { return 2; }\n");
      return { status: "repaired", summary: `Updated src/math.mjs after ${failure.step.id}.` };
    }
  });
  const after = runShell("npm test", { root: fixtureRoot });

  return {
    status: before.status !== 0 && after.status === 0 && workflow.status === "passed" ? "passed" : "failed",
    fixtureRoot,
    before: proofCommandResult("npm test", before),
    workflow,
    after: proofCommandResult("npm test", after)
  };
}
