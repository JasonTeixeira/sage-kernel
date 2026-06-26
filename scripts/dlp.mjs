import { auditEvidence } from "../packages/security/dlp.mjs";

// DLP gate: audit persisted evidence/proof artifacts for leaked (unredacted)
// secrets. With redact-on-write in the proof ledger this should stay clean.
const result = auditEvidence(process.cwd());

console.log(JSON.stringify(result, null, 2));

if (result.status !== "passed") {
  console.error(`DLP audit failed: ${result.findings.length} artifact(s) contain unredacted secrets.`);
  process.exit(1);
}
console.log("DLP audit passed (no unredacted secrets in evidence).");
