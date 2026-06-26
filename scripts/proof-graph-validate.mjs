import fs from "node:fs";
import { buildProofGraph, validateProofGraph } from "../packages/proof/graph.mjs";

// Validate a proof graph. With --graph <file> it validates that file; otherwise
// it builds a fresh graph from the current repo state and validates it.
//
// Validation fails (exit 1) on structural errors, on any claim with no path to a
// passing proof, and on any release gate without a proof edge. With --strict, an
// untested changed file is also a blocking finding.
//
// Usage: node scripts/proof-graph-validate.mjs [--graph <file>] [--root <dir>] [--strict]

const args = process.argv.slice(2);
const arg = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
};
const root = arg("root") || process.cwd();
const strict = args.includes("--strict");
const graphPath = arg("graph");

const graph = graphPath
  ? JSON.parse(fs.readFileSync(graphPath, "utf8"))
  : buildProofGraph({ root, goal: arg("goal") || undefined });

const result = validateProofGraph(graph, { strict });

console.log(JSON.stringify({ source: graphPath || "built-from-repo", ...result }, null, 2));

if (result.status !== "passed") {
  console.error(`Proof graph validation failed: ${result.findings.filter((f) => f.severity === "critical").length} blocking finding(s).`);
  process.exit(1);
}

console.log("Proof graph validation passed.");
