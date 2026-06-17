import fs from "node:fs";
import path from "node:path";

import { dashboardSnapshot, renderMetrics } from "../../dashboard/server.mjs";

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
  readJson,
  resourceText
};
