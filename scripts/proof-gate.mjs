// Enforcement Stop-hook (P10). Exit 0 = allow turn completion; exit 2 = BLOCK
// (no fresh passing operate:run proof for the current diff). Wire as a Claude Code
// Stop hook via installEnforcementHooks(); runs against the current project (cwd).
import { checkProofGate } from "../packages/enforcement/proof-gate.mjs";

const verdict = checkProofGate({ root: process.cwd() });
if (verdict.allowed) {
  process.stdout.write(`proof-gate: OK — ${verdict.reason} (${verdict.proofId})\n`);
  process.exit(0);
}
process.stderr.write(`proof-gate: BLOCKED — ${verdict.reason}\n`);
process.exit(2);
