# Phase 7: Orchestration and Jobs

Phase 7 makes Sage Kernel OS alive locally through repeatable jobs, run history, logs, retry limits, schedules, and approval gates.

## Built Artifacts

- `apps/worker/jobs.json`
- `apps/worker/schedules.json`
- `apps/worker/approval-policy.json`
- `apps/worker/scripts/validate-jobs.mjs`
- `apps/worker/scripts/jobs-list.mjs`
- `apps/worker/scripts/jobs-run.mjs`
- `apps/worker/scripts/runs-list.mjs`
- `apps/worker/scripts/runs-show.mjs`

## Current Jobs

- `kernel-self-check`
- `repo-health`
- `warehouse-summary`
- `qa-os-summary`
- `template-smoke`
- `nightly-local-audit`
- external deploy jobs are intentionally absent until a real provider-backed implementation exists

## MCP Tools

- `kernel.jobs.list`
- `kernel.jobs.run`
- `kernel.jobs.runs`

## Run History

Runs are written to:

```text
.sage-kernel/runs/
```

## Boundary

The Phase 7 runner is safe-local only.

It can:

- read local catalogs
- inspect local source repos
- run validation scripts
- write local run history

It must not:

- mutate external systems
- deploy
- provision cloud resources
- push to remotes
- write secrets
- apply database migrations
