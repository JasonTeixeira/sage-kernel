import { buildProofGraph, writeGraph, validateGraph } from "../packages/proof/graph.mjs";

// Build a proof graph from real repo state (goal, git changed files, test
// imports, ledger proofs) and persist it to the evidence directory.
//
// Usage: node scripts/proof-graph-build.mjs [--goal "..."] [--root <dir>]

const args = process.argv.slice(2);
const arg = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
};
const root = arg("root") || process.cwd();
const goal = arg("goal") || undefined;

const graph = buildProofGraph({ root, goal });
const structural = validateGraph(graph);
const file = writeGraph(graph, { root });

console.log(
  JSON.stringify(
    {
      status: structural.valid ? "built" : "invalid",
      graphPath: file,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      nodeTypes: countBy(graph.nodes, "type"),
      structuralErrors: structural.errors
    },
    null,
    2
  )
);

if (!structural.valid) process.exit(1);

function countBy(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}
