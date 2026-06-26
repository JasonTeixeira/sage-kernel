#!/usr/bin/env node
// Model-backed repair eval: for each broken-repo fixture, confirm the test is RED,
// then ask a LIVE model (via SAGE_AGENT_COMMAND) to fix it from a fresh copy, K
// independent times, and re-run the test. Records genuine pass@1 / pass@k / pass^k.
// This is the real intelligence eval — unlike the deterministic command re-run
// grader, success requires the model to read intent and make a correct edit.
//
//   SAGE_AGENT_COMMAND="node providers/claude-agent.mjs" \
//     node tests/harness/run-repair-eval.mjs --limit 15 --attempts 1 --model claude
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPAIR_FIXTURES, fixtureCount } from "./repair-eval-corpus.mjs";

const args = process.argv.slice(2);
const num = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : def; };
const str = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const limit = num("--limit", fixtureCount());
const attempts = num("--attempts", 1);
const model = str("--model", process.env.SAGE_EVAL_MODEL || "unknown");
const agentCommand = process.env.SAGE_AGENT_COMMAND;
if (!agentCommand) { console.error("SAGE_AGENT_COMMAND must be set (e.g. 'node providers/claude-agent.mjs')"); process.exit(2); }

const TEST_HEADER = "import test from 'node:test';\nimport assert from 'node:assert/strict';\nconst t = (name, fn) => test(name, fn);\nconst eq = (a, b) => assert.deepEqual(a, b);\n";

function materialize(fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sage-repair-${fixture.id}-`));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "fx", type: "module" }));
  fs.writeFileSync(path.join(dir, "src.mjs"), fixture.src);
  fs.mkdirSync(path.join(dir, "test"));
  fs.writeFileSync(path.join(dir, "test", "fixture.test.mjs"), TEST_HEADER + fixture.test);
  return dir;
}

function testsPass(dir) {
  const r = spawnSync("node", ["--test"], { cwd: dir, encoding: "utf8", timeout: 60000 });
  return r.status === 0;
}

function runAgent(dir, fixture) {
  const diagnosis = {
    category: fixture.category,
    primaryLocation: { file: "src.mjs", line: 1 },
    instruction: fixture.instruction,
    impactedFiles: ["src.mjs"]
  };
  const env = { ...process.env, SAGE_DIAGNOSIS_JSON: JSON.stringify(diagnosis) };
  const r = spawnSync(agentCommand, ["repair"], { cwd: dir, shell: true, encoding: "utf8", timeout: 590000, env, maxBuffer: 1024 * 1024 * 16 });
  return r.status === 0;
}

const startedAt = new Date().toISOString();
const t0 = Date.now();
const selected = REPAIR_FIXTURES.slice(0, limit);
const results = [];
for (const fixture of selected) {
  const attemptOutcomes = [];
  let invalid = false;
  for (let a = 0; a < attempts; a += 1) {
    const dir = materialize(fixture);
    try {
      if (testsPass(dir)) { invalid = true; break; } // fixture must start RED
      runAgent(dir, fixture);
      attemptOutcomes.push(testsPass(dir));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  if (invalid) { results.push({ id: fixture.id, category: fixture.category, invalid: true }); continue; }
  const passed = attemptOutcomes.filter(Boolean).length;
  results.push({
    id: fixture.id, category: fixture.category,
    attempts: attemptOutcomes.length,
    passAt1: attemptOutcomes[0] ? 1 : 0,
    passAtK: passed > 0 ? 1 : 0,
    passPowerK: passed === attemptOutcomes.length ? 1 : 0
  });
  console.error(`[${results.length}/${selected.length}] ${fixture.id}: ${attemptOutcomes.map((x) => (x ? "✓" : "✗")).join("")}`);
}

const graded = results.filter((r) => !r.invalid);
const mean = (field) => graded.length ? Number((graded.reduce((s, r) => s + r[field], 0) / graded.length).toFixed(4)) : 0;
const report = {
  type: "repair-eval", model, startedAt, finishedAt: new Date().toISOString(),
  totalDurationMs: Date.now() - t0,
  corpusSize: fixtureCount(),
  graded: graded.length,
  invalid: results.filter((r) => r.invalid).map((r) => r.id),
  attemptsPerFixture: attempts,
  metrics: { passAt1: mean("passAt1"), passAtK: mean("passAtK"), passPowerK: mean("passPowerK") },
  byCategory: graded.reduce((m, r) => { (m[r.category] ||= []).push(r.passAtK); return m; }, {}),
  results
};
const dir = path.join(process.cwd(), ".sage-kernel/evals");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "repair-eval-latest.json"), `${JSON.stringify(report, null, 2)}\n`);
// Also keep a per-model artifact so a claude run and a codex run don't clobber
// each other (cross-model evidence lives side by side).
fs.writeFileSync(path.join(dir, `repair-eval-${String(model).replace(/[^a-z0-9]+/gi, "-")}.json`), `${JSON.stringify(report, null, 2)}\n`);
console.error(`\nrepair-eval (${model}, n=${graded.length}, k=${attempts}): pass@1 ${report.metrics.passAt1} / pass@k ${report.metrics.passAtK} / pass^k ${report.metrics.passPowerK}`);
console.log(JSON.stringify(report.metrics));
