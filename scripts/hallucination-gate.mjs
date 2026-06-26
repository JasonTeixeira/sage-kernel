import fs from "node:fs";
import path from "node:path";
import { scanReports } from "../packages/proof/hallucination.mjs";

// Measure the hallucination rate across the given report files (default README)
// and write evidence to .sage-kernel/evidence/hallucination-latest.json. Fails
// (exit 1) when any unbacked success claim is found (zero tolerance by default).
//
// Usage: node scripts/hallucination-gate.mjs [file ...] [--threshold 0]

const root = process.cwd();
const args = process.argv.slice(2);
const thresholdIndex = args.indexOf("--threshold");
const threshold = thresholdIndex >= 0 ? Number(args[thresholdIndex + 1]) : 0;
// BUG FIX: when --threshold is absent, thresholdIndex === -1 so (thresholdIndex+1)
// === 0 wrongly dropped the FIRST file argument, silently scanning only README
// (0 claims). Only skip the threshold VALUE index when --threshold is present.
const skipValueIndex = thresholdIndex >= 0 ? thresholdIndex + 1 : -1;
const targets = args.filter((arg, index) => !arg.startsWith("--") && index !== skipValueIndex);
const files = targets.length > 0 ? targets : ["README.md"];

const items = [];
const missing = [];
for (const file of files) {
  const full = path.isAbsolute(file) ? file : path.join(root, file);
  if (!fs.existsSync(full)) {
    missing.push(file);
    continue;
  }
  items.push({ source: file, text: fs.readFileSync(full, "utf8") });
}

const result = scanReports(items, { root, threshold });

const evidenceDir = path.join(root, ".sage-kernel/evidence");
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(
  path.join(evidenceDir, "hallucination-latest.json"),
  `${JSON.stringify({ ...result, missing, generatedAt: new Date().toISOString() }, null, 2)}\n`
);

console.log(JSON.stringify({ status: result.status, rate: result.rate, threshold, totalClaims: result.totalClaims, hallucinatedClaims: result.hallucinatedClaims, missing }, null, 2));

if (missing.length > 0 || result.status !== "passed") {
  console.error(`Hallucination gate failed: rate ${result.rate} > ${threshold}${missing.length ? `, missing: ${missing.join(", ")}` : ""}.`);
  process.exit(1);
}

console.log("Hallucination gate passed.");
