# Usage Guide

This guide explains what Sage Kernel does in practical terms and how to use it day to day.

## Mental Model

Sage Kernel is a local engineering control plane.

Instead of remembering dozens of one-off scripts, prompts, and project conventions, you use one kernel that exposes the same capabilities through:

- an MCP server for AI clients and agents
- a `sage` CLI for terminal workflows
- a local dashboard for human inspection and workflow execution
- a worker engine for queued and scheduled jobs
- a persistence layer for runs, approvals, jobs, audit records, and exports

The MCP server is the primary product. The CLI and dashboard are human-friendly ways to use the same system.

## What You Can Do With It

### Inspect A Project

Use the kernel to summarize project state, catalog data, templates, jobs, approvals, and health.

```bash
sage daily
sage status
sage tools
sage templates
sage ask qa
```

Use this when you sit down to work and want a quick operating picture.

### Audit A Repo

Run a repo audit against the current project:

```bash
sage audit .
```

This calls the `kernel.workflow.audit_repo` MCP workflow. It runs the kernel QA path for the selected project and returns structured next actions.

### Run Full QA

Run a stronger QA workflow:

```bash
sage full-qa .
```

This calls `kernel.workflow.run_full_qa` and is the right command before a serious commit, release, or handoff.

### Explain Failures

Pass a failed report into the failure explanation workflow:

```bash
sage failures '{"status":"failed","checks":[{"name":"npm:test","status":"failed","result":{"stderr":"unit failed"}}]}'
```

This is useful for AI-assisted debugging because the kernel returns structured failures and recommendations.

### Create A New App

List templates:

```bash
sage templates
```

Create an app:

```bash
sage create-app worker-service daily-worker
```

Plan a project without creating files:

```bash
sage plan next-saas-app vercel contractor-dispatch-os
```

Create directly through the lower-level scaffold command:

```bash
sage new next-ai-app ai-research-copilot
```

### Prepare Infrastructure

Plan infra:

```bash
sage infra next-saas-app vercel
```

Emit infra artifacts:

```bash
sage emit worker-service docker-compose daily-worker
```

Prepare deployment checks:

```bash
sage deploy worker-service docker
```

### Check Release Readiness

```bash
sage release worker-service docker
```

This calls `kernel.workflow.release_readiness` and checks readiness across templates, infra, pending approvals, and expected release conditions.

### Manage Jobs

```bash
sage jobs
sage enqueue repo-health
sage tick
sage run nightly-local-audit
sage runs
```

Use this to run background checks and inspect run history.

### Manage Approvals

```bash
sage pending
sage approvals
sage approvals pending
```

Risky or mutating actions pass through policy and approval boundaries. The exact boundary is declared in the MCP tool manifest.

### Open The Dashboard

```bash
sage dashboard-live
```

The dashboard is the local human cockpit. It surfaces health, readiness, metrics, tools, jobs, runs, approvals, and daily workflow controls.

Default URL:

```text
http://127.0.0.1:8787
```

### Stress Test The Dashboard

```bash
sage stress http://127.0.0.1:8787
```

Lower-level stress scripts:

```bash
npm run stress:queue -- --count=10000
npm run stress:dashboard -- --url=http://127.0.0.1:8787 --count=1000 --concurrency=50
npm run stress:dashboard -- --url=http://127.0.0.1:8787 --endpoint=/health --count=1000 --concurrency=50
```

### Execute Runbooks

Plan a runbook step without executing it:

```bash
npm run runbooks:execute -- --runbook=runbook_release_verification --step=local_release_check
```

Runbook execution through MCP is approval-gated. The execution result records timeout, command output excerpts, rollback metadata, and audit/artifact records.

### Run Soak Profiles

Run the CI-safe quick soak profile:

```bash
npm run soak:quick
```

Run a live local dashboard soak after starting the dashboard:

```bash
npm run dashboard:serve
npm run soak:run -- --profile=local --dashboard --url=http://127.0.0.1:8787 --endpoint=/health
```

## MCP Client Setup

Generate config:

```bash
sage mcp config codex --json
sage mcp config claude-desktop --json
sage mcp config cursor --json
```

Validate the server:

```bash
sage mcp smoke
```

Start the server:

```bash
sage mcp start
```

After connecting an MCP client, useful prompts are:

```text
Use Sage Kernel to audit this repo.
Use Sage Kernel to run full QA.
Use Sage Kernel to explain the latest failures.
Use Sage Kernel to create a worker-service app named daily-worker.
Use Sage Kernel to check release readiness.
Use Sage Kernel to show pending approvals.
Use Sage Kernel to summarize today's project state.
```

## Local Database

Initialize and inspect:

```bash
npm run db:init
npm run db:migrate
npm run db:summary
```

Backup and restore:

```bash
npm run db:backup
npm run db:restore -- path/to/backup.db
```

Export and import:

```bash
npm run db:export
npm run db:import -- path/to/export.json
```

## Quality Gates

Run the main gates:

```bash
npm test
npm run test:coverage
npm run release:check
```

Run MCP-specific gates:

```bash
npm run mcp:validate
npm run mcp:contracts
npm run mcp:smoke
```

Run security checks:

```bash
npm run security:scan
npm audit
```

## Recommended Daily Flow

1. Start with `sage daily`.
2. Audit the active repo with `sage audit .`.
3. Use `sage pending` to check blocked or risky work.
4. Build or change code.
5. Run `sage full-qa .`.
6. Use `sage release <template> <target>` before publishing.
7. Use the dashboard when you want a visual operational view.
