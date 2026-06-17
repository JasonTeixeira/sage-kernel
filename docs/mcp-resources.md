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
