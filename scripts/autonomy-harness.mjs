// Autonomy harness gate (cat 14). Proves the self-healing loop's mechanics with a
// deterministic known-good fixer: every seeded defect is detected by a real
// engine, closed end-to-end, and re-verified — with the no-fake-close invariant
// holding. (Model-backed close-rate is a separate, honestly-reported live run via
// the brain adapters; this gate proves the harness is correct, not the model.)
import fs from "node:fs";
import path from "node:path";
import { runAutonomyHarness } from "../packages/autonomy/harness.mjs";

const root = process.cwd();
const deterministic = runAutonomyHarness();
// Control: a no-op fixer must close nothing and roll back everything — proving the
// harness cannot fake a green close.
const control = runAutonomyHarness({ fixer: (bug) => bug.broken, fixerName: "noop-control" });

const status =
  deterministic.detectRate === 1 &&
  deterministic.closeRate === 1 &&
  deterministic.noFakeClose === true &&
  control.closeRate === 0 &&
  control.rolledBack === control.total
    ? "passed"
    : "failed";

const report = {
  type: "autonomy-harness",
  status,
  deterministic: { detectRate: deterministic.detectRate, closeRate: deterministic.closeRate, rolledBack: deterministic.rolledBack, noFakeClose: deterministic.noFakeClose, total: deterministic.total },
  noopControl: { closeRate: control.closeRate, rolledBack: control.rolledBack },
  note: "Deterministic close-rate proves harness mechanics. Model-backed close-rate is measured live via SAGE_AGENT_COMMAND and reported honestly (not asserted to be 1.0).",
  generatedAt: new Date().toISOString()
};
const out = path.join(root, ".sage-kernel/evidence/autonomy-harness-latest.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
process.exit(status === "passed" ? 0 : 1);
