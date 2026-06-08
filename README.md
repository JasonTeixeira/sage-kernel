# Sage Kernel OS

Sage Kernel OS is a personal engineering operating system for planning, scaffolding, testing, securing, deploying, and documenting real-world software systems through an MCP server.

This is a non-destructive federation layer. Existing repos stay intact; the kernel references, queries, adapts, or copies approved reusable artifacts without ripping source repos apart. See `docs/source-repo-policy.md`.

The kernel is built around five durable surfaces:

- `catalog/`: source of truth for repos, templates, modules, integrations, and phases.
- `apps/mcp-server/`: MCP control plane.
- `apps/dashboard/`: visual command center.
- `apps/worker/`: background orchestration and scheduled checks.
- `packages/`: reusable engines for app, infra, AI, QA, auth, API, data, jobs, security, and observability.

## Phase Plan

1. Kernel Registry
2. AI Warehouse Integration
3. QA OS Integration
4. Template Engine
5. Infra Engine
6. MCP Server
7. Orchestration and Jobs
8. Command Center Dashboard

## Phase 1 Completion Criteria

- Repos are cataloged by consolidation role.
- Reusable modules are defined with ownership and target package.
- Templates are defined by project type and required capabilities.
- Integrations are defined by external system and boundary.
- Phase roadmap is machine-readable.
- Catalog validation passes.

Run:

```bash
npm run catalog:validate
```

## Daily Terminal Use

From this repo:

```bash
node bin/sage.mjs status
node bin/sage.mjs plan next-saas-app vercel contractor-dispatch-os
node bin/sage.mjs run nightly-local-audit
node bin/sage.mjs dashboard
```

After `npm link`, use `sage` from any terminal.

## Local Secrets

Local secrets go in `.env.local`, which is ignored by git.

Required for Playwright MCP browser extension workflows:

```bash
PLAYWRIGHT_MCP_EXTENSION_TOKEN=
```

Check:

```bash
npm run playwright:check
```
