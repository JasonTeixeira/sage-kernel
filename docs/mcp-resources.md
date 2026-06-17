# Sage Kernel MCP Resources

Generated from `apps/mcp-server/src/kernel-resources.mjs`.

These resources are read-only. Use resources when an MCP client needs to inspect kernel state without invoking command-style tools.

| Resource | URI | MIME Type | Description |
| --- | --- | --- | --- |
| Sage Catalog | `sage://catalog` | `application/json` | Kernel catalog data for phases, repos, modules, templates, integrations, and QA profiles. |
| Sage Templates | `sage://templates` | `application/json` | Project template catalog with coverage, stack, and QA profile metadata. |
| Sage Jobs | `sage://jobs` | `application/json` | Worker job registry and schedule definitions. |
| Sage Runs | `sage://runs` | `application/json` | Recent job run history from the dashboard snapshot. |
| Sage Approvals | `sage://approvals` | `application/json` | Recent approval ledger entries from the dashboard snapshot. |
| Sage MCP Server Docs | `sage://docs/mcp-server` | `text/markdown` | Canonical MCP server setup and verification documentation. |
| Sage Metrics | `sage://metrics` | `text/plain` | Prometheus-style dashboard metrics. |
| Sage Dashboard Snapshot | `sage://dashboard/snapshot` | `application/json` | Full DB-backed dashboard snapshot. |
| Sage Intelligence Contracts | `sage://intelligence/contracts` | `application/json` | Read-only intelligence schemas and security boundaries for memory, evals, experiments, runbooks, and semantic code. |
| Sage Intelligence Memory | `sage://intelligence/memory` | `application/json` | Recent durable memory records and memory audit summary. |
| Sage Intelligence Project State | `sage://intelligence/project-state` | `application/json` | Durable project state summary grounded in git, eval reports, memory, dashboard health, and approvals. |
| Sage Intelligence Eval Definitions | `sage://intelligence/evals` | `application/json` | Validated eval definitions for deterministic release, MCP, dashboard, QA, and workflow checks. |
| Sage Intelligence Latest Eval Report | `sage://intelligence/eval-report` | `application/json` | Latest local eval run report, or a missing-state object if no eval suite has run yet. |
| Sage Intelligence Experiment Fixture | `sage://intelligence/experiments` | `application/json` | Validated experiment-run fixture showing bounded feedback-loop structure. |
| Sage Intelligence Runbooks | `sage://intelligence/runbooks` | `application/json` | Validated runbook catalog showing steps, risks, and verification commands. |
| Sage Intelligence Operating Cockpit | `sage://intelligence/operating-cockpit` | `application/json` | Daily plan, runbooks, eval status, and experiment fixture for cockpit workflows. |
| Sage Intelligence Semantic Adapter Fixture | `sage://intelligence/semantic-adapters` | `application/json` | Validated semantic-code adapter fixture showing read-only capability metadata. |
| Sage Intelligence Optional Adapters | `sage://intelligence/adapters` | `application/json` | Discovered optional Serena, Graphiti, and local adapter status with safe degradation metadata. |
| Sage Global Agents | `sage://agents/global` | `text/markdown` | Canonical global AGENTS.md operating rules for evidence-first engineering sessions. |
| Sage Agent Profiles | `sage://agents/profiles` | `application/json` | Role-specific web, mobile, backend, MCP, security, and release SDLC profiles. |
| Sage Agent Pack Checks | `sage://agents/checks` | `application/json` | Validation report for global agent rules, profile coverage, and required operating policies. |
