// Deterministic repair agent for the foreign-repair harness. Stands in for the
// real model behind SAGE_AGENT_COMMAND so the WIRING can be proven without a live
// LLM.
//
// HONEST PROOF DISCIPLINE: this agent ONLY acts if it actually received a valid
// diagnosis via SAGE_DIAGNOSIS_JSON. There is NO scan-without-diagnosis fallback
// — if the diagnosis did not arrive (e.g. the old shell-shatter bug), it exits 1
// and applies nothing, so the harness fails. That makes "harness GREEN" a real
// proof that diagnose -> agent delivery works, not a self-rescue. (It still uses
// knowledge of the seeded off-by-one to apply the fix — the deterministic
// stand-in for model reasoning; real aiming is the model's job.)
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function parsedDiagnosis() {
  const raw = process.env.SAGE_DIAGNOSIS_JSON;
  if (!raw || !raw.trim()) return null;
  try {
    const d = JSON.parse(raw);
    // A real diagnosis must carry a category and a located failure.
    if (!d || !d.category || !(d.primaryLocation || (d.impactedFiles && d.impactedFiles.length))) return null;
    return d;
  } catch {
    return null;
  }
}

const diagnosis = parsedDiagnosis();
if (!diagnosis) {
  process.stderr.write("no valid SAGE_DIAGNOSIS_JSON delivered — refusing to act (diagnose->agent wire is broken)");
  process.exit(1);
}

// Diagnosis received: apply the seeded off-by-one fix to the source under src/.
let fixed = false;
const srcDir = path.join(root, "src");
let entries = [];
try { entries = fs.readdirSync(srcDir); } catch { /* no src */ }
for (const name of entries) {
  if (!name.endsWith(".mjs")) continue;
  const file = path.join(srcDir, name);
  const source = fs.readFileSync(file, "utf8");
  const next = source.split("\n").map((line) =>
    line.includes("reduce(") && /,\s*1\s*\)/.test(line) ? line.replace(/,(\s*)1(\s*)\)/, ",$10$2)") : line
  ).join("\n");
  if (next !== source) { fs.writeFileSync(file, next); fixed = true; }
}

process.stdout.write(fixed ? `applied off-by-one fix (diagnosis: ${diagnosis.category})` : "diagnosis received but no off-by-one pattern found");
process.exit(fixed ? 0 : 1);
