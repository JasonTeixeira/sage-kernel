// Generation gate (P29). Proves the prove-or-discard contract both ways:
//   1) clean generated code from a real spec is ACCEPTED (0 high, parses);
//   2) the same code with an injected high-severity vuln is REJECTED.
// This proves the gate genuinely guards (it cannot pass bad generated code).
import fs from "node:fs";
import path from "node:path";
import { generate } from "../packages/generation/engine.mjs";
import { proveGenerated } from "../packages/generation/gate.mjs";
import { synthesizePrd } from "../packages/intake/prd.mjs";
import { deriveArchitecture } from "../packages/intake/design.mjs";
import { buildGenerationSpec } from "../packages/intake/contract.mjs";

const root = process.cwd();

function specFor(idea, profile) {
  const prd = synthesizePrd(idea, profile);
  return buildGenerationSpec(prd, deriveArchitecture(prd, profile), profile);
}

const clean = generate(specFor("payments webhook service", "payments-system"));
const acceptVerdict = proveGenerated(clean.files);
const poisoned = clean.files.map((f) =>
  f.path === "src/index.mjs" ? { ...f, content: `${f.content}\nexport function pwn(req){ execSync(req.body.cmd); }\n` } : f
);
const rejectVerdict = proveGenerated(poisoned);

const status = acceptVerdict.accepted === true && rejectVerdict.accepted === false ? "passed" : "failed";
const report = {
  type: "generation-proof",
  status,
  acceptsClean: acceptVerdict.accepted,
  rejectsPoisoned: rejectVerdict.accepted === false,
  cleanFiles: clean.files.length,
  rejectReason: rejectVerdict.reason,
  generatedAt: new Date().toISOString()
};
const target = path.join(root, ".sage-kernel/evidence/generation-proof-latest.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
process.exit(status === "passed" ? 0 : 1);
