import fs from "node:fs";
import path from "node:path";
import { verifyReport } from "../packages/proof/claim-firewall.mjs";

// CLI for the claim firewall. Verifies the given files (or a default set)
// against the proof ledger: unsupported success claims, claims citing missing
// or stale proofs, and unsupported public-release / client-connection claims all
// fail the gate. A missing target is itself a failure so the gate can never
// silently pass on an absent claim surface.
//
// Usage: node scripts/claim-firewall.mjs [file ...]

const root = process.cwd();
const args = process.argv.slice(2);
const DEFAULT_TARGETS = ["README.md"];
const targets = args.length > 0 ? args : DEFAULT_TARGETS;

const reports = [];
const missing = [];

for (const target of targets) {
  const fullPath = path.isAbsolute(target) ? target : path.join(root, target);
  if (!fs.existsSync(fullPath)) {
    missing.push(target);
    continue;
  }
  reports.push(verifyReport(fs.readFileSync(fullPath, "utf8"), { source: target, root }));
}

const violations = reports.flatMap((report) => report.violations);
const status = missing.length === 0 && violations.length === 0 ? "passed" : "failed";

console.log(
  JSON.stringify(
    {
      status,
      scanned: reports.map((report) => report.source),
      missing,
      violations
    },
    null,
    2
  )
);

if (status !== "passed") {
  if (missing.length > 0) {
    console.error(`Claim gate: missing target(s): ${missing.join(", ")}`);
  }
  if (violations.length > 0) {
    console.error(`Claim gate: ${violations.length} unsupported claim(s) found.`);
  }
  process.exit(1);
}

console.log("Claim gate passed.");
