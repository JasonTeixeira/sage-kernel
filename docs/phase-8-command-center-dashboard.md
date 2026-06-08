# Phase 8: Command Center Dashboard and Terminal CLI

Phase 8 makes Sage Kernel OS usable from daily terminals and visible through a local command center.

## Built Artifacts

- `bin/sage.mjs`
- `apps/dashboard/scripts/build-dashboard.mjs`
- `apps/dashboard/dist/index.html`

## Terminal Commands

```bash
sage status
sage tools
sage ask <query>
sage templates
sage plan <template> [target] [name]
sage new <template> <name>
sage infra <template> [target]
sage jobs
sage run <job-id>
sage runs
sage dashboard
sage doctor
sage mcp
```

From the repo root, use:

```bash
node bin/sage.mjs status
```

For global use later:

```bash
npm link
```

## Dashboard

Build:

```bash
npm run dashboard:build
```

Output:

```text
apps/dashboard/dist/index.html
```
