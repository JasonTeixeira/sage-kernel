# Roadmap

This roadmap is scoped to making Sage Kernel useful as a daily local MCP
engineering operating system and credible as a public open-source project.

The canonical MCP-first operating contract is `docs/GLOBAL.md`.

## Now

- MCP server as the primary product interface.
- Local dashboard as an optional operations cockpit.
- SQLite default with tested Postgres integration.
- Signed approval ledger for risky actions.
- Job queue, run history, runbooks, memory, drift checks, review tools, and QA gates.
- CI with coverage, fresh install, Postgres integration, security, MCP smoke, and release packaging.

## Next

1. Raise critical-file branch coverage toward 98%+.
2. Publish the first npm package with provenance.
3. Record the public demo video and screenshot set.
4. Add more real-world templates and example apps.
5. Add optional external adapter examples for memory, graph, and repo intelligence systems.

## Later

1. Plugin API for third-party MCP tools and templates.
2. Long-running daemon mode with scheduled jobs.
3. Richer dashboard traces and run replay.
4. Multi-user/team policy profiles.
5. Production deployment profile for Postgres-backed shared instances.

## Non-Goals For The First Public Release

- Hosted SaaS operation by default.
- Mutating third-party repos without explicit approval.
- Replacing a full CI/CD system.
- Secret management beyond local redaction and approval boundaries.
