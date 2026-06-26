// LIVE model-gen proof (P6b). Seeds a repo with ONLY an acceptance test (no
// implementation) and asks the real model to GENERATE a working implementation
// that passes it — then gates via prove-or-discard. Proves the model-lane creates
// correct code from a contract, distinct from repairing existing code.
//
// Opt-in (real model). Run: node tests/harness/live-generate.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateWithModel } from "../../packages/generation/model-gen.mjs";

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-live-gen-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "live-gen", type: "module" }));
  fs.mkdirSync(path.join(root, "test"));
  // Acceptance test only — no src/parse.mjs exists yet. The model must create it.
  fs.writeFileSync(path.join(root, "test/parse.test.mjs"),
    "import test from 'node:test';import assert from 'node:assert/strict';import { parseRange } from '../src/parse.mjs';\ntest('parseRange', () => { assert.deepEqual(parseRange('1-3'), [1,2,3]); assert.deepEqual(parseRange('5'), [5]); });\n");
  const spec = { idea: "parseRange(s): given '1-3' return [1,2,3]; given a single number return [that number]", targetFile: "src/parse.mjs", requirements: ["parseRange('1-3') deep-equals [1,2,3]", "parseRange('5') deep-equals [5]"] };
  try {
    // model-gen shells the `claude` CLI directly with a generation prompt
    // (SAGE_AGENT_COMMAND is the repair adapter, which expects a diagnosis).
    const r = await generateWithModel({ spec, root, agentCommand: "claude", testFile: "test/parse.test.mjs" });
    const out = { type: "live-generate-proof", status: r.status, testsPass: r.testsPass, generatedFiles: r.generatedFiles, reason: r.reason, generatedAt: new Date().toISOString() };
    const evid = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../.sage-kernel/evidence/live-generate-latest.json");
    fs.mkdirSync(path.dirname(evid), { recursive: true });
    fs.writeFileSync(evid, `${JSON.stringify(out, null, 2)}\n`);
    console.log(JSON.stringify(out, null, 2));
    return r.status === "generated" ? 0 : 1;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
process.exit(await main());
