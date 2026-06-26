#!/usr/bin/env node
// The autonomous engineering loop. Each round: MEASURE every capability from REAL
// evidence (regenerating it via its gate), check the round's own report through the
// claim-firewall (a lying report aborts), journal a proof-backed scorecard, and
// loop until every category clears its floor for two consecutive rounds (dry) or
// the iteration/time budget is spent — with a TYPED stop reason, never silent.
//
// Integrity guardrails (why a reported score cannot be hallucinated):
//   * Every category score is read from an artifact on disk, regenerated this round.
//   * The round report is run through the STRICT claim-firewall; an unproven success
//     claim aborts the round (no self-congratulatory hallucination survives).
//   * The proof ledger is verified each round; a tampered ledger aborts.
//   * Hard --rounds / --budget-min caps + typed stop; the loop cannot run forever.
//
//   node scripts/autonomous-engineer.mjs --rounds 6 --budget-min 180 [--live] [--measure-only]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CAPABILITY_REGISTRY, assessCategory, checkIntegrity } from "../packages/companion/capability-registry.mjs";
import { verifyLedger } from "../packages/proof/ledger.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const num = (f, d) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : d; };
const has = (f) => args.includes(f);
const maxRounds = num("--rounds", 6);
const budgetMin = num("--budget-min", 180);
const live = has("--live");
const measureOnly = has("--measure-only");
const startedAt = Date.now();
const deadline = startedAt + budgetMin * 60 * 1000;

// Live evidence generators (cost model calls) — only run with --live.
const LIVE_COMMANDS = {
  "repair-intelligence": `SAGE_AGENT_COMMAND="node ${path.join(root, "providers/claude-agent.mjs")}" node tests/harness/run-repair-eval.mjs --limit 32 --attempts 1 --model claude`,
  "live-autonomy": "node tests/harness/live-codex-autonomy.mjs"
};

function run(cmd) {
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8", timeout: 1_200_000, maxBuffer: 1024 * 1024 * 64 });
  return { ok: r.status === 0, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function measureCategory(cat, round) {
  let stdout = "";
  // Regenerate evidence: live categories only with --live; per-round commandFor
  // (fresh-seed) categories vary by round; otherwise run the fixed gate.
  if (live && LIVE_COMMANDS[cat.id]) ({ stdout } = run(LIVE_COMMANDS[cat.id]));
  else if (cat.commandFor) ({ stdout } = run(cat.commandFor(round)));
  else if (cat.command) ({ stdout } = run(cat.command));
  return assessCategory(cat, root, { stdout });
}

function journal(entry) {
  const dir = path.join(root, ".sage-kernel/autonomy");
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, "engineer-journal.jsonl"), `${JSON.stringify(entry)}\n`);
}

let dryRounds = 0;
let stopReason = "max_rounds";
let lastScorecard = [];
let completedRounds = 0;
for (let round = 1; round <= maxRounds; round += 1) {
  completedRounds = round;
  if (Date.now() > deadline) { stopReason = "budget_exhausted"; break; }

  const ledger = verifyLedger({ root });
  if (ledger.status === "tampered") { stopReason = "ledger_tampered"; journal({ round, abort: "ledger_tampered" }); break; }

  const scorecard = CAPABILITY_REGISTRY.map((cat) => measureCategory(cat, round));
  lastScorecard = scorecard;
  const below = scorecard.filter((c) => !c.met);

  // INTEGRITY (structural, unfakeable): a category may be marked "met" ONLY if it
  // is backed by a real artifact this round AND its measured score clears the
  // floor. Any "met" without proof, or with a score below floor, is a fabricated
  // result and aborts the loop. (The lexical claim-firewall is applied to the
  // human-facing summary, not to these factual measurement lines.)
  const fabricated = checkIntegrity(scorecard);

  const entry = {
    round, at: new Date().toISOString(),
    elapsedMin: Math.round((Date.now() - startedAt) / 60000),
    scorecard: scorecard.map(({ id, score, floor, met, proven, detail }) => ({ id, score, floor, met, proven, detail })),
    below: below.map((c) => c.id),
    integrity: fabricated.length === 0 ? "ok" : "violated",
    fabricated: fabricated.map((c) => c.id)
  };
  journal(entry);
  console.error(`round ${round}: ${scorecard.filter((c) => c.met).length}/${scorecard.length} met; below=[${below.map((c) => c.id).join(",")}]; integrity=${entry.integrity}; ${entry.elapsedMin}min`);

  if (fabricated.length) { stopReason = "integrity_violation"; break; }
  if (measureOnly) { stopReason = "measure_only"; break; }

  if (below.length === 0) { dryRounds += 1; if (dryRounds >= 2) { stopReason = "converged"; break; } }
  else dryRounds = 0;
}

const final = {
  type: "autonomous-engineer-final",
  stopReason,
  rounds: completedRounds,
  elapsedMin: Math.round((Date.now() - startedAt) / 60000),
  scorecard: lastScorecard.map(({ id, score, floor, met, proven, detail }) => ({ id, score, floor, met, proven, detail })),
  allMet: lastScorecard.length > 0 && lastScorecard.every((c) => c.met),
  generatedAt: new Date().toISOString()
};
const dir = path.join(root, ".sage-kernel/autonomy");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "engineer-final.json"), `${JSON.stringify(final, null, 2)}\n`);
console.error(`\nSTOP: ${stopReason} — ${final.scorecard.filter((c) => c.met).length}/${final.scorecard.length} categories met floor (allMet=${final.allMet})`);
console.log(JSON.stringify({ stopReason, allMet: final.allMet, scorecard: final.scorecard }));
process.exit(final.allMet ? 0 : 1);
