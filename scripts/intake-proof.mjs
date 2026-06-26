// Intake gate (P28). Proves the idea->PRD->design->contract bridge produces, for
// a representative set of profiles, a PRD that covers EVERY required check and a
// valid, implementable task contract + a valid generation spec.
import fs from "node:fs";
import path from "node:path";
import { runIntake } from "../packages/intake/contract.mjs";
import { validateGenerationSpec, resolveProfile } from "../packages/intake/spec.mjs";

const root = process.cwd();
const cases = [
  { idea: "stripe webhook handler", profile: "payments-system" },
  { idea: "multi-tenant saas dashboard", profile: "saas-app" },
  { idea: "expo fitness tracker", profile: "mobile-app" },
  { idea: "internal mcp tool server", profile: "mcp-server" }
];

const results = cases.map(({ idea, profile }) => {
  const out = runIntake(idea, profile, { root });
  const prof = resolveProfile(profile);
  const specValid = validateGenerationSpec(out.spec).valid;
  const covers = out.prd.coversAllRequiredChecks && out.prd.requirements.length === prof.requiredChecks.length;
  const ok = out.contractValid && out.contract.canImplement && specValid && covers;
  return { idea, profile, ok, contractValid: out.contractValid, specValid, coversAllRequiredChecks: covers, requirements: out.prd.requirements.length };
});

const status = results.every((r) => r.ok) ? "passed" : "failed";
const report = { type: "intake-proof", status, results, generatedAt: new Date().toISOString() };
const target = path.join(root, ".sage-kernel/evidence/intake-proof-latest.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
process.exit(status === "passed" ? 0 : 1);
