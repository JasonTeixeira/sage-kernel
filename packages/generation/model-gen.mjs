// Model-lane codegen (P6). Unlike engine.mjs (deterministic scaffolder that emits
// stubs), this asks the real model (SAGE_AGENT_COMMAND -> claude) to write a
// WORKING implementation that satisfies a spec's acceptance test, then gates the
// result through prove-or-discard (SAST/parse) + the acceptance test actually
// passing. Provider-gated: without an agent it honestly returns
// blocked_not_implemented (never a fake "generated"). Runner injectable for tests.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { proveGenerated } from "./gate.mjs";

const CODE = /\.(mjs|cjs|js|jsx|ts|tsx)$/;
const IGNORED = new Set([".git", "node_modules", ".sage-kernel"]);

function collectFiles(root, dir = root, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(root, full, out);
    else if (CODE.test(entry.name)) out.push({ path: path.relative(root, full), content: fs.readFileSync(full, "utf8") });
  }
  return out;
}

function buildPrompt(spec) {
  const reqs = (spec.requirements || []).map((r) => `- ${r.label || r}`).join("\n");
  return [
    `Implement code that satisfies this specification. Make the existing test(s) pass; do not weaken or edit the tests.`,
    `Goal: ${spec.idea || spec.goal || spec.name}`,
    spec.targetFile ? `Write the implementation to: ${spec.targetFile}` : "",
    reqs ? `Requirements:\n${reqs}` : "",
    `Write clean, working code. Do not add unrelated files.`
  ].filter(Boolean).join("\n");
}

function claudeGenerateRunner(command) {
  if (!command || !String(command).trim()) return null;
  return async ({ spec, root }) => {
    const result = spawnSync(command, ["-p", buildPrompt(spec), "--permission-mode", "acceptEdits"], {
      cwd: root, encoding: "utf8", timeout: 600000, shell: false
    });
    return { ran: result.status === 0, output: (result.stdout || result.stderr || "").slice(0, 300) };
  };
}

// Generate into `root` (which should already contain the acceptance test), then
// verify: prove-or-discard (no high SAST, parses) AND the acceptance test passes.
export async function generateWithModel(options = {}) {
  const spec = options.spec || {};
  const root = options.root || process.cwd();
  const runner = options.runner || claudeGenerateRunner(options.agentCommand || process.env.SAGE_AGENT_COMMAND);
  if (typeof runner !== "function") {
    return { status: "blocked_not_implemented", reason: "no generation agent configured (set SAGE_AGENT_COMMAND or inject runner)" };
  }
  await runner({ spec, root });
  const files = collectFiles(root).filter((f) => !/\.(test|spec)\./.test(f.path));
  const verdict = proveGenerated(files);
  let testsPass = null;
  if (options.testFile) {
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    testsPass = spawnSync("node", ["--test", options.testFile], { cwd: root, encoding: "utf8", env }).status === 0;
  }
  const accepted = verdict.accepted && (options.testFile ? testsPass === true : true);
  return {
    status: accepted ? "generated" : "rejected",
    accepted,
    proveVerdict: verdict,
    testsPass,
    generatedFiles: files.map((f) => f.path),
    reason: accepted ? null : !verdict.accepted ? verdict.reason : "acceptance test failed"
  };
}
