import fs from "node:fs";
import path from "node:path";

import { dashboardSnapshot, renderMetrics } from "../../dashboard/server.mjs";
import { createMemoryStore } from "../../../packages/intelligence/memory-store.mjs";
import { createProjectState } from "../../../packages/intelligence/project-state.mjs";
import { listAdapters } from "../../../packages/intelligence/adapters.mjs";
import { createOperatingSnapshot, listRunbooks } from "../../../packages/intelligence/runbooks.mjs";

export const kernelResources = [
  {
    name: "sage.catalog",
    uri: "sage://catalog",
    title: "Sage Catalog",
    description: "Kernel catalog data for phases, repos, modules, templates, integrations, and QA profiles.",
    mimeType: "application/json",
    read: (root) => readCatalog(root)
  },
  {
    name: "sage.templates",
    uri: "sage://templates",
    title: "Sage Templates",
    description: "Project template catalog with coverage, stack, and QA profile metadata.",
    mimeType: "application/json",
    read: (root) => readJson(root, "catalog/templates.json")
  },
  {
    name: "sage.jobs",
    uri: "sage://jobs",
    title: "Sage Jobs",
    description: "Worker job registry and schedule definitions.",
    mimeType: "application/json",
    read: (root) => ({
      jobs: readJson(root, "apps/worker/jobs.json", { jobs: [] }).jobs || [],
      schedules: readJson(root, "apps/worker/schedules.json", { schedules: [] }).schedules || []
    })
  },
  {
    name: "sage.runs",
    uri: "sage://runs",
    title: "Sage Runs",
    description: "Recent job run history from the dashboard snapshot.",
    mimeType: "application/json",
    read: (root) => dashboardSnapshot({ root }).jobs.timeline
  },
  {
    name: "sage.approvals",
    uri: "sage://approvals",
    title: "Sage Approvals",
    description: "Recent approval ledger entries from the dashboard snapshot.",
    mimeType: "application/json",
    read: (root) => dashboardSnapshot({ root }).approvals.inbox
  },
  {
    name: "sage.docs.mcp-server",
    uri: "sage://docs/mcp-server",
    title: "Sage MCP Server Docs",
    description: "Canonical MCP server setup and verification documentation.",
    mimeType: "text/markdown",
    read: (root) => fs.readFileSync(path.join(root, "docs/MCP_SERVER.md"), "utf8")
  },
  {
    name: "sage.metrics",
    uri: "sage://metrics",
    title: "Sage Metrics",
    description: "Prometheus-style dashboard metrics.",
    mimeType: "text/plain",
    read: (root) => renderMetrics(dashboardSnapshot({ root }))
  },
  {
    name: "sage.dashboard.snapshot",
    uri: "sage://dashboard/snapshot",
    title: "Sage Dashboard Snapshot",
    description: "Full DB-backed dashboard snapshot.",
    mimeType: "application/json",
    read: (root) => dashboardSnapshot({ root })
  },
  {
    name: "sage.intelligence.contracts",
    uri: "sage://intelligence/contracts",
    title: "Sage Intelligence Contracts",
    description: "Read-only intelligence schemas and security boundaries for memory, evals, experiments, runbooks, and semantic code.",
    mimeType: "application/json",
    read: (root) => readIntelligenceContracts(root)
  },
  {
    name: "sage.intelligence.memory",
    uri: "sage://intelligence/memory",
    title: "Sage Intelligence Memory",
    description: "Recent durable memory records and memory audit summary.",
    mimeType: "application/json",
    read: (root) => readMemorySnapshot(root)
  },
  {
    name: "sage.intelligence.project-state",
    uri: "sage://intelligence/project-state",
    title: "Sage Intelligence Project State",
    description: "Durable project state summary grounded in git, eval reports, memory, dashboard health, and approvals.",
    mimeType: "application/json",
    read: (root) => createProjectState({ root })
  },
  {
    name: "sage.intelligence.evals",
    uri: "sage://intelligence/evals",
    title: "Sage Intelligence Eval Definitions",
    description: "Validated eval definitions for deterministic release, MCP, dashboard, QA, and workflow checks.",
    mimeType: "application/json",
    read: (root) => readEvalDefinitions(root)
  },
  {
    name: "sage.intelligence.eval-report",
    uri: "sage://intelligence/eval-report",
    title: "Sage Intelligence Latest Eval Report",
    description: "Latest local eval run report, or a missing-state object if no eval suite has run yet.",
    mimeType: "application/json",
    read: (root) => readLatestEvalReport(root)
  },
  {
    name: "sage.intelligence.experiments",
    uri: "sage://intelligence/experiments",
    title: "Sage Intelligence Experiment Fixture",
    description: "Validated experiment-run fixture showing bounded feedback-loop structure.",
    mimeType: "application/json",
    read: (root) => readJson(root, "packages/intelligence/fixtures/valid/experiment-run.json", {})
  },
  {
    name: "sage.intelligence.runbooks",
    uri: "sage://intelligence/runbooks",
    title: "Sage Intelligence Runbooks",
    description: "Validated runbook catalog showing steps, risks, and verification commands.",
    mimeType: "application/json",
    read: (root) => ({ runbooks: listRunbooks({ root }) })
  },
  {
    name: "sage.intelligence.operating-cockpit",
    uri: "sage://intelligence/operating-cockpit",
    title: "Sage Intelligence Operating Cockpit",
    description: "Daily plan, runbooks, eval status, and experiment fixture for cockpit workflows.",
    mimeType: "application/json",
    read: (root) => createOperatingSnapshot({ root })
  },
  {
    name: "sage.intelligence.semantic-adapters",
    uri: "sage://intelligence/semantic-adapters",
    title: "Sage Intelligence Semantic Adapter Fixture",
    description: "Validated semantic-code adapter fixture showing read-only capability metadata.",
    mimeType: "application/json",
    read: (root) => readJson(root, "packages/intelligence/fixtures/valid/semantic-adapter.json", {})
  },
  {
    name: "sage.intelligence.adapters",
    uri: "sage://intelligence/adapters",
    title: "Sage Intelligence Optional Adapters",
    description: "Discovered optional Serena, Graphiti, and local adapter status with safe degradation metadata.",
    mimeType: "application/json",
    read: (root) => listAdapters({ root })
  }
];

export function registerKernelResources(server, { root = process.cwd() } = {}) {
  for (const resource of kernelResources) {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        description: resource.description,
        mimeType: resource.mimeType
      },
      async () => ({
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: resourceText(resource.read(root), resource.mimeType)
          }
        ]
      })
    );
  }
}

function readCatalog(root) {
  return {
    phases: readJson(root, "catalog/phases.json", { phases: [] }).phases || [],
    repos: readJson(root, "catalog/repos.json", { repos: [] }).repos || [],
    modules: readJson(root, "catalog/modules.json", { modules: [] }).modules || [],
    templates: readJson(root, "catalog/templates.json", { templates: [] }).templates || [],
    integrations: readJson(root, "catalog/integrations.json", { integrations: [] }).integrations || [],
    qaProfiles: readJson(root, "packages/qa/profiles.json", { profiles: [] }).profiles || []
  };
}

function readIntelligenceContracts(root) {
  const schemasDir = path.join(root, "packages/intelligence/schemas");
  const schemas = {};
  if (fs.existsSync(schemasDir)) {
    for (const file of fs.readdirSync(schemasDir).filter((item) => item.endsWith(".schema.json")).sort()) {
      schemas[file] = JSON.parse(fs.readFileSync(path.join(schemasDir, file), "utf8"));
    }
  }
  return {
    schemas,
    securityBoundaries: readJson(root, "packages/intelligence/security-boundaries.json", { boundaries: [] }).boundaries || []
  };
}

function readEvalDefinitions(root) {
  const evalDir = path.join(root, "packages/intelligence/evals");
  if (!fs.existsSync(evalDir)) return [];
  return fs
    .readdirSync(evalDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => readJson(root, path.join("packages/intelligence/evals", file), {}));
}

function readLatestEvalReport(root) {
  return readJson(root, path.join(".sage-kernel/evals/latest.json"), {
    status: "missing",
    evals: [],
    summary: { total: 0, passed: 0, failed: 0 },
    failures: ["No eval report has been generated yet."]
  });
}

function readMemorySnapshot(root) {
  try {
    const store = createMemoryStore({ root });
    return {
      status: "available",
      audit: store.audit(),
      records: store.search({ limit: 20 })
    };
  } catch (error) {
    return {
      status: "unavailable",
      audit: { total: 0, kinds: [], sources: [], latest: [] },
      records: [],
      error: error.message
    };
  }
}

function readJson(root, relativePath, fallback = null) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function resourceText(value, mimeType) {
  if (typeof value === "string") return value;
  if (mimeType === "application/json") return JSON.stringify(value, null, 2);
  return String(value ?? "");
}

export const __resourceTestInternals = {
  readCatalog,
  readEvalDefinitions,
  readIntelligenceContracts,
  readLatestEvalReport,
  readMemorySnapshot,
  readJson,
  resourceText
};
