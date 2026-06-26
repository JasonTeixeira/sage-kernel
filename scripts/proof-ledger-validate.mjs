import fs from "node:fs";
import path from "node:path";
import { verifyLedger, validateProofRecord, readLedger } from "../packages/proof/ledger.mjs";

// Validate the proof ledger: schema-check every record and verify the
// tamper-evident hash chain. An empty ledger is reported honestly (not a fake
// pass). Any malformed, tampered, or chain-broken record fails the gate.
//
// Usage: node scripts/proof-ledger-validate.mjs [--root <dir>]

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = rootIndex >= 0 ? args[rootIndex + 1] : process.cwd();

const records = readLedger({ root });
const schemaIssues = [];
for (const record of records) {
  const result = validateProofRecord(record);
  if (!result.valid) {
    schemaIssues.push({ proofId: record.proofId || null, errors: result.errors });
  }
}

const chain = verifyLedger({ root });
const ledgerExists = fs.existsSync(path.join(root, ".sage-kernel/proof/ledger.jsonl"));

const status = !ledgerExists || chain.status === "empty"
  ? "empty"
  : chain.status === "verified" && schemaIssues.length === 0
    ? "passed"
    : "failed";

console.log(
  JSON.stringify(
    {
      status,
      ledgerExists,
      count: chain.count,
      chainOk: chain.chainOk,
      tampered: chain.tampered,
      schemaIssues,
      tamperedRecords: chain.records.filter((record) => record.status !== "verified")
    },
    null,
    2
  )
);

if (status === "failed") {
  console.error(`Proof ledger validation failed: ${chain.tampered} tampered record(s), ${schemaIssues.length} schema issue(s).`);
  process.exit(1);
}

console.log(status === "empty" ? "Proof ledger is empty (no records to validate)." : "Proof ledger validation passed.");
