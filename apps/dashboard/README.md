# Dashboard Cockpit

The dashboard is a local operations cockpit generated from Sage Kernel state. It
shows health, workflows, approvals, job runs, queued work, MCP tools, repo
readiness, template readiness, artifacts, and persistence ledger counts.

Build:

```bash
npm run dashboard:build
```

Run live:

```bash
npm run dashboard:serve
```

Verify with browser screenshots:

```bash
npm run dashboard:browser-check -- --url=http://127.0.0.1:8787
```

Output:

```text
apps/dashboard/dist/index.html
```

The dashboard intentionally avoids a framework dependency. It is server-rendered
HTML backed by `/api/snapshot`, `/health`, `/ready`, and `/metrics`.
