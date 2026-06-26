// Autonomy harness (cat 14: intelligence/autonomy). Measures the self-healing
// LOOP's mechanics — detect a real defect, apply a fix, re-verify, and fail
// closed (roll back) when a fix does not resolve the defect — as a close-rate
// over a seeded-bug corpus.
//
// HONEST SCOPE: this proves the HARNESS, not model IQ. With the deterministic
// known-good fixer the close-rate is 1.0 (the loop mechanics are correct). With a
// no-op fixer the close-rate is 0 AND every bug is rolled back (the loop never
// fakes a close and never leaves debt). A model-backed fixer (the real brain,
// gated) plugs into the same interface; its close-rate is whatever the model
// genuinely achieves and is reported as such — never asserted to be 1.0.

import { scanSastFile } from "../security/sast.mjs";
import { collectNodes, safeParse } from "../ast/parse.mjs";

// A bug is healthy when its detector reports clean. Detectors use the REAL
// engines (SAST / AST), so "closed" means a real defect is genuinely gone.
const noHighSast = (source) => scanSastFile("seed.mjs", source).every((f) => f.severity !== "high" && f.severity !== "critical");

function exportsHandler(source) {
  const ast = safeParse(source);
  if (!ast) return false;
  for (const node of collectNodes(ast, "ExportNamedDeclaration")) {
    const decl = node.declaration;
    if (decl && decl.type === "FunctionDeclaration" && decl.id?.name === "handler") return true;
  }
  return false;
}

export const SEEDED_BUGS = [
  {
    id: "taint-shell-injection",
    category: "security",
    broken: "export function h(req){ const c = req.body.cmd; execSync(c); }",
    isHealthy: noHighSast,
    knownFix: () => "export function h(req){ execFileSync('git', ['status']); void req; }"
  },
  {
    id: "dynamic-eval",
    category: "security",
    broken: "export function run(payload){ return eval(payload); }",
    isHealthy: noHighSast,
    knownFix: () => "export function run(payload){ return JSON.parse(payload); }"
  },
  {
    id: "command-injection-exec",
    category: "security",
    broken: "export function build(name){ execSync('rm -rf ' + name); }",
    isHealthy: noHighSast,
    knownFix: () => "export function build(name){ execFileSync('rm', ['-rf', name]); }"
  },
  {
    id: "missing-api-contract",
    category: "contract",
    broken: "export const ready = true;\n",
    isHealthy: exportsHandler,
    knownFix: () => "export const ready = true;\nexport function handler(){ return { ok: true }; }\n"
  }
];

// Run the close-loop for one bug with a given fixer:
//   detect (broken must be unhealthy) -> fix -> re-verify -> rollback on failure.
export function runCloseLoop(bug, fixer) {
  const detected = bug.isHealthy(bug.broken) === false; // the defect is real and seen
  let candidate;
  try {
    candidate = fixer(bug);
  } catch {
    candidate = bug.broken;
  }
  const healthyAfter = bug.isHealthy(candidate);
  const closed = detected && healthyAfter;
  // Fail closed: if the fix did not heal, revert to the original (leave no debt).
  const finalSource = closed ? candidate : bug.broken;
  const rolledBack = !closed;
  // Independent re-check of the FINAL state — the source of truth for no-fake-close.
  const healthyFinal = bug.isHealthy(finalSource);
  return { id: bug.id, category: bug.category, detected, closed, rolledBack, healthyFinal, finalSource };
}

export function runAutonomyHarness(options = {}) {
  const fixer = options.fixer || ((bug) => bug.knownFix(bug.broken));
  const bugs = options.bugs || SEEDED_BUGS;
  const results = bugs.map((bug) => runCloseLoop(bug, fixer));
  const detected = results.filter((r) => r.detected).length;
  const closed = results.filter((r) => r.closed).length;
  const rolledBack = results.filter((r) => r.rolledBack).length;
  return {
    type: "autonomy-harness",
    fixer: options.fixerName || (options.fixer ? "custom" : "deterministic-known-fix"),
    total: bugs.length,
    detected,
    closed,
    rolledBack,
    detectRate: bugs.length ? Number((detected / bugs.length).toFixed(4)) : 0,
    closeRate: bugs.length ? Number((closed / bugs.length).toFixed(4)) : 0,
    // Invariant: a bug reported closed MUST be genuinely healthy in its final
    // state (no fake-green); a rolled-back bug is left exactly as it was found.
    noFakeClose: results.every((r) => (r.closed ? r.healthyFinal === true : true)),
    results
  };
}
