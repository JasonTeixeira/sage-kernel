// Proof Graph — connects goals, requirements, acceptance criteria, risks,
// changed files, tests, commands, tool calls, findings, release gates, proofs,
// claims, and scores with typed edges. Its purpose is to make a "passed" claim
// rejectable when no evidence path connects it to a proof (and ultimately a
// goal). The graph data is built from real signals (git diff, test imports, the
// proof ledger); the validation logic is what enforces "nothing stated,
// everything proven."

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { listProofs } from "./ledger.mjs";

export const NODE_TYPES = new Set([
  "goal",
  "requirement",
  "acceptance_criterion",
  "risk",
  "changed_file",
  "test",
  "command",
  "mcp_tool_call",
  "review_finding",
  "security_finding",
  "redteam_case",
  "release_gate",
  "proof",
  "claim",
  "score"
]);

export const EDGE_TYPES = new Set([
  "satisfies",
  "tests",
  "covers",
  "depends_on",
  "produced_by",
  "verified_by",
  "blocked_by",
  "supersedes",
  "regressed_from"
]);

const PASSING_PROOF_STATUSES = new Set(["passed", "verified"]);

export function createGraph(meta = {}) {
  return { meta, nodes: [], edges: [] };
}

export function addNode(graph, node) {
  if (!node || !node.id || !node.type) throw new Error("node requires id and type");
  if (!NODE_TYPES.has(node.type)) throw new Error(`invalid node type: ${node.type}`);
  if (graph.nodes.some((existing) => existing.id === node.id)) return graph;
  return { ...graph, nodes: [...graph.nodes, { ...node }] };
}

export function addEdge(graph, edge) {
  if (!edge || !edge.from || !edge.to || !edge.type) throw new Error("edge requires from, to, type");
  if (!EDGE_TYPES.has(edge.type)) throw new Error(`invalid edge type: ${edge.type}`);
  const duplicate = graph.edges.some(
    (existing) => existing.from === edge.from && existing.to === edge.to && existing.type === edge.type
  );
  if (duplicate) return graph;
  return { ...graph, edges: [...graph.edges, { ...edge }] };
}

export function nodeById(graph, id) {
  return graph.nodes.find((node) => node.id === id) || null;
}

export function outgoing(graph, id, edgeTypes) {
  return graph.edges.filter((edge) => edge.from === id && (!edgeTypes || edgeTypes.includes(edge.type)));
}

// BFS over outgoing edges; returns the node-id path to the first node matching
// predicate, or null. The start node is never treated as a match.
export function findPath(graph, fromId, predicate, edgeTypes) {
  const visited = new Set([fromId]);
  const queue = [[fromId]];
  while (queue.length) {
    const trail = queue.shift();
    const last = trail[trail.length - 1];
    if (last !== fromId) {
      const node = nodeById(graph, last);
      if (node && predicate(node)) return trail;
    }
    for (const edge of outgoing(graph, last, edgeTypes)) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push([...trail, edge.to]);
      }
    }
  }
  return null;
}

// Structural validation: known types, unique node ids, edges reference real nodes.
export function validateGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== "object") return { valid: false, errors: ["graph must be an object"] };
  if (!Array.isArray(graph.nodes)) errors.push("nodes must be an array");
  if (!Array.isArray(graph.edges)) errors.push("edges must be an array");
  const ids = new Set();
  for (const node of graph.nodes || []) {
    if (!node.id) errors.push("node missing id");
    else if (ids.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    else ids.add(node.id);
    if (!NODE_TYPES.has(node.type)) errors.push(`invalid node type: ${node.type} (${node.id})`);
  }
  for (const edge of graph.edges || []) {
    if (!EDGE_TYPES.has(edge.type)) errors.push(`invalid edge type: ${edge.type}`);
    if (!ids.has(edge.from)) errors.push(`edge references unknown node (from): ${edge.from}`);
    if (!ids.has(edge.to)) errors.push(`edge references unknown node (to): ${edge.to}`);
  }
  return { valid: errors.length === 0, errors };
}

// A claim is proven when a directed path reaches a proof node whose status is
// passing. Optionally it should also connect upward to a goal.
export function verifyClaims(graph) {
  const claims = graph.nodes.filter((node) => node.type === "claim");
  const results = claims.map((claim) => {
    const issues = [];
    const proofPath = findPath(graph, claim.id, (node) => node.type === "proof");
    if (!proofPath) {
      issues.push("no proof path to a proof node");
    } else {
      const proof = nodeById(graph, proofPath[proofPath.length - 1]);
      if (proof.status && !PASSING_PROOF_STATUSES.has(proof.status)) {
        issues.push(`backing proof is not passing: ${proof.status}`);
      }
    }
    const goalPath = findPath(graph, claim.id, (node) => node.type === "goal", [
      "satisfies",
      "covers",
      "depends_on"
    ]);
    return { id: claim.id, proven: issues.length === 0, hasGoalPath: Boolean(goalPath), proofPath, issues };
  });
  const unproven = results.filter((result) => !result.proven);
  return { status: unproven.length === 0 ? "passed" : "failed", claims: results, unproven };
}

// A release gate must be backed by a proof via a verified_by / produced_by edge.
export function verifyGates(graph) {
  const gates = graph.nodes.filter((node) => node.type === "release_gate");
  const results = gates.map((gate) => {
    const proofPath = findPath(graph, gate.id, (node) => node.type === "proof", ["verified_by", "produced_by"]);
    return {
      id: gate.id,
      proven: Boolean(proofPath),
      issues: proofPath ? [] : ["release gate has no verified_by/produced_by edge to a proof"]
    };
  });
  return { status: results.every((result) => result.proven) ? "passed" : "failed", gates: results };
}

// Full validation used by the CLI and MCP tool. strict=true treats an untested
// changed file as a blocking finding (missing test edge fails).
export function validateProofGraph(graph, options = {}) {
  const findings = [];
  const structural = validateGraph(graph);
  for (const error of structural.errors) findings.push({ severity: "critical", message: error });

  const claims = verifyClaims(graph);
  for (const unproven of claims.unproven) {
    findings.push({ severity: "critical", message: `claim not proven: ${unproven.id} (${unproven.issues.join("; ")})` });
  }

  const gates = verifyGates(graph);
  for (const gate of gates.gates.filter((entry) => !entry.proven)) {
    findings.push({ severity: "critical", message: `release gate missing proof edge: ${gate.id}` });
  }

  for (const file of graph.nodes.filter((node) => node.type === "changed_file")) {
    const tested = graph.edges.some((edge) => edge.type === "tests" && (edge.to === file.id || edge.from === file.id));
    if (!tested) {
      findings.push({
        severity: options.strict ? "critical" : "warning",
        message: `changed file has no test edge: ${file.id}`
      });
    }
  }

  const blocking = findings.filter((finding) => finding.severity === "critical");
  return {
    status: blocking.length === 0 ? "passed" : "failed",
    findings,
    counts: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      claims: claims.claims.length,
      unprovenClaims: claims.unproven.length,
      gates: gates.gates.length
    }
  };
}

export function requirementsForGoal(graph, goalId) {
  return graph.edges
    .filter((edge) => edge.type === "satisfies" && edge.to === goalId)
    .map((edge) => nodeById(graph, edge.from))
    .filter((node) => node && node.type === "requirement");
}

export function criteriaForRequirement(graph, requirementId) {
  return graph.edges
    .filter((edge) => edge.type === "satisfies" && edge.to === requirementId)
    .map((edge) => nodeById(graph, edge.from))
    .filter((node) => node && node.type === "acceptance_criterion");
}

export function testsForFile(graph, fileId) {
  return graph.edges
    .filter((edge) => edge.type === "tests" && edge.to === fileId)
    .map((edge) => nodeById(graph, edge.from))
    .filter((node) => node && node.type === "test");
}

export function queryGraph(graph, filter = {}) {
  let nodes = graph.nodes;
  let edges = graph.edges;
  if (filter.nodeType) nodes = nodes.filter((node) => node.type === filter.nodeType);
  if (filter.id) nodes = nodes.filter((node) => node.id === filter.id);
  if (filter.edgeType) edges = edges.filter((edge) => edge.type === filter.edgeType);
  if (filter.from) edges = edges.filter((edge) => edge.from === filter.from);
  if (filter.to) edges = edges.filter((edge) => edge.to === filter.to);
  return { nodes, edges };
}

function graphFile(options = {}) {
  const root = options.root || process.cwd();
  return options.graphFile || path.join(root, ".sage-kernel/proof/graph-latest.json");
}

export function writeGraph(graph, options = {}) {
  const file = graphFile(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(graph, null, 2)}\n`);
  return file;
}

export function readGraph(options = {}) {
  const file = graphFile(options);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? String(result.stdout || "").trim() : "";
}

function changedFiles(root) {
  const tracked = git(root, ["diff", "--name-only", "HEAD"]).split("\n").filter(Boolean);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
}

function listTestFiles(root) {
  const dir = path.join(root, "tests");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => `tests/${name}`);
}

// A test "tests" a changed file when the test source references the file's
// module path or basename (real import-reference analysis, not name guessing).
function testReferencesFile(root, testFile, changedFile) {
  const full = path.join(root, testFile);
  if (!fs.existsSync(full)) return false;
  const body = fs.readFileSync(full, "utf8");
  const base = path.basename(changedFile).replace(/\.(mjs|js|ts|tsx|jsx)$/, "");
  const withoutExt = changedFile.replace(/\.(mjs|js|ts|tsx|jsx)$/, "");
  return body.includes(changedFile) || body.includes(withoutExt) || new RegExp(`/${base}\\.mjs`).test(body);
}

// Build a proof graph from real repo state: provided goal/requirements, git
// changed files, real test imports, and proofs from the ledger.
export function buildProofGraph(options = {}) {
  const root = options.root || process.cwd();
  const goalLabel = options.goal || "Maintain proof-first kernel posture.";
  let graph = createGraph({ goal: goalLabel, builtFrom: "git+tests+ledger" });

  const goalId = "goal:main";
  graph = addNode(graph, { id: goalId, type: "goal", label: goalLabel });

  const requirements =
    Array.isArray(options.requirements) && options.requirements.length
      ? options.requirements
      : [{ id: "requirement:deliver", label: "Deliver the goal with passing, evidenced gates." }];
  for (const requirement of requirements) {
    graph = addNode(graph, { id: requirement.id, type: "requirement", label: requirement.label });
    graph = addEdge(graph, { from: requirement.id, to: goalId, type: "satisfies" });
    for (const criterion of requirement.criteria || []) {
      graph = addNode(graph, { id: criterion.id, type: "acceptance_criterion", label: criterion.label });
      graph = addEdge(graph, { from: criterion.id, to: requirement.id, type: "satisfies" });
    }
  }
  const primaryRequirement = requirements[0].id;

  const files = changedFiles(root);
  const tests = listTestFiles(root);
  for (const file of files) {
    const fileId = `changed_file:${file}`;
    graph = addNode(graph, { id: fileId, type: "changed_file", label: file });
    graph = addEdge(graph, { from: fileId, to: primaryRequirement, type: "depends_on" });
  }
  for (const test of tests) {
    const testId = `test:${test}`;
    graph = addNode(graph, { id: testId, type: "test", label: test });
    for (const file of files) {
      if (testReferencesFile(root, test, file)) {
        graph = addEdge(graph, { from: testId, to: `changed_file:${file}`, type: "tests" });
      }
    }
  }

  const proofs = listProofs({ root, limit: options.proofLimit || 200 });
  for (const proof of proofs) {
    const proofId = `proof:${proof.proofId}`;
    graph = addNode(graph, { id: proofId, type: "proof", label: proof.tool || proof.proofId, status: proof.status });
    if (proof.command) {
      const commandId = `command:${proof.command}`;
      graph = addNode(graph, { id: commandId, type: "command", label: proof.command });
      graph = addEdge(graph, { from: proofId, to: commandId, type: "produced_by" });
    }
    if (PASSING_PROOF_STATUSES.has(proof.status)) {
      const claimId = `claim:${proof.proofId}`;
      graph = addNode(graph, { id: claimId, type: "claim", label: `${proof.tool || proof.proofId} passed` });
      graph = addEdge(graph, { from: claimId, to: proofId, type: "verified_by" });
      graph = addEdge(graph, { from: claimId, to: primaryRequirement, type: "satisfies" });
    }
  }

  return graph;
}
