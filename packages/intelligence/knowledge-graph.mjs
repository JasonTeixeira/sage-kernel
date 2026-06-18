import fs from "node:fs";
import path from "node:path";
import { createMemoryRecord } from "./memory-store.mjs";
import { detectProjectProfile } from "../profiles/project-detector.mjs";

const SECRET_PATTERN = /(secret|token|password|api[_-]?key)\s+[A-Za-z0-9_./+=-]{8,}/i;

export function enforceMemoryPolicy(input = {}) {
  const failures = [];
  const scope = input.scope || "project";
  const confidence = Number(input.confidence ?? 0.8);
  if (!["project", "global"].includes(scope)) failures.push("scope must be project or global");
  if (!input.summary || typeof input.summary !== "string") failures.push("summary is required");
  if (!input.evidenceRef) failures.push("evidenceRef is required");
  if (confidence < 0.5) failures.push("confidence must be at least 0.5");
  if (SECRET_PATTERN.test(input.summary || "")) failures.push("memory summary appears to contain secret material");
  return {
    status: failures.length > 0 ? "blocked" : "passed",
    scope,
    requiresApproval: scope === "global" || input.kind === "standard",
    confidence,
    failures,
    allowedKinds: ["fact", "decision", "episode", "standard", "incident", "release"]
  };
}

export function createKnowledgeGraph(options = {}) {
  const root = options.root || process.cwd();
  const projectPath = options.projectPath || ".";
  const detected = detectProjectProfile({ root, projectPath });
  const projectRoot = detected.project.root;
  const files = listFiles(projectRoot);
  const nodes = [];
  const edges = [];
  const projectNode = node("project", detected.project.name, { profile: detected.profile.id, root: detected.project.relativeRoot });
  nodes.push(projectNode);

  for (const framework of detected.frameworks) {
    const frameworkNode = node("framework", framework);
    nodes.push(frameworkNode);
    edges.push(edge(projectNode.id, frameworkNode.id, "uses_framework"));
  }

  const routeFiles = files.filter((file) => /(^|\/)(routes?|api|pages|app)\//.test(file) && /\.(mjs|js|ts|tsx|jsx)$/.test(file));
  const testFiles = files.filter((file) => /(^|\/)(tests?|__tests__)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file));
  for (const routeFile of routeFiles) {
    const routeNode = node("route", routeFile);
    nodes.push(routeNode);
    edges.push(edge(projectNode.id, routeNode.id, "has_route"));
    const matches = matchingTests(routeFile, testFiles);
    for (const testFile of matches) {
      const testNode = node("test", testFile);
      if (!nodes.some((item) => item.id === testNode.id)) nodes.push(testNode);
      edges.push(edge(routeNode.id, testNode.id, "has_test"));
    }
  }

  for (const dep of Object.keys(detected.project.package ? readJson(path.join(projectRoot, "package.json"), {})?.dependencies || {} : {})) {
    const depNode = node("dependency", dep);
    nodes.push(depNode);
    edges.push(edge(projectNode.id, depNode.id, "depends_on"));
  }

  return {
    status: "passed",
    project: detected.project,
    nodes: dedupeById(nodes),
    edges,
    query(filter = {}) {
      return dedupeById(nodes).filter((item) => {
        if (filter.type && item.type !== filter.type) return false;
        if (filter.id && item.id !== filter.id) return false;
        if (filter.label && !item.label.includes(filter.label)) return false;
        return true;
      });
    }
  };
}

export function proposeLearningUpdate(input = {}) {
  const root = input.root || process.cwd();
  const projectPath = input.projectPath || ".";
  const detected = detectProjectProfile({ root, projectPath });
  const summary = input.summary || `Failure fixed: ${input.failure || "unknown failure"} -> ${input.fix || "unknown fix"}`;
  const policy = enforceMemoryPolicy({
    projectId: detected.project.name,
    scope: input.scope || "project",
    kind: input.kind || "episode",
    source: "learning-loop",
    summary,
    confidence: input.confidence ?? 0.85,
    evidenceRef: input.evidenceRef || "learning-loop"
  });
  return {
    status: policy.status === "passed" ? "proposed" : "blocked",
    project: detected.project,
    proposal: {
      failure: input.failure || null,
      fix: input.fix || null,
      scope: input.scope || "project",
      summary
    },
    memory: {
      policy,
      record: policy.status === "passed"
        ? createMemoryRecord({
            projectId: detected.project.name,
            kind: input.kind || "episode",
            source: "learning-loop",
            actor: input.actor || "sage-kernel",
            confidence: input.confidence ?? 0.85,
            summary,
            tags: ["learning-loop", "approved-required"],
            evidenceType: "workflow",
            evidenceRef: input.evidenceRef || "learning-loop"
          })
        : null
    }
  };
}

export function approveLearningUpdate(proposal, options = {}) {
  if (!proposal || proposal.status !== "proposed" || !proposal.memory?.record) {
    throw new Error("Only proposed learning updates can be approved.");
  }
  return {
    status: "approved",
    approvedBy: options.approvedBy || "local-user",
    approvedAt: options.approvedAt || new Date().toISOString(),
    memory: {
      ...proposal.memory.record,
      source: "learning-loop",
      provenance: {
        ...proposal.memory.record.provenance,
        approvedBy: options.approvedBy || "local-user"
      }
    }
  };
}

export function formatKnowledgeOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(stripFunctions(value), null, 2)}\n`;
  if (value.nodes && value.edges) return `Knowledge graph ${value.status}: ${value.nodes.length} node(s), ${value.edges.length} edge(s)\n`;
  if (value.proposal) return `Learning update ${value.status}: ${value.proposal.summary}\n`;
  if (value.allowedKinds) return `Memory policy ${value.status}: ${value.failures.length} failure(s)\n`;
  return `${JSON.stringify(stripFunctions(value), null, 2)}\n`;
}

function node(type, label, data = {}) {
  return { id: `${type}:${label}`, type, label, data };
}

function edge(from, to, type) {
  return { from, to, type };
}

function matchingTests(file, tests) {
  const base = path.basename(file).replace(/\.[^.]+$/, "").toLowerCase();
  return tests.filter((test) => test.toLowerCase().includes(base));
}

function dedupeById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if ([".git", "node_modules", ".sage-kernel", "coverage", "dist", "build"].includes(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return [path.relative(base, full)];
  }).sort();
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function stripFunctions(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripFunctions);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => typeof item !== "function")
      .map(([key, item]) => [key, stripFunctions(item)])
  );
}
