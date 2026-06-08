# Worker and Job Orchestration

Phase 7 makes Sage Kernel OS alive locally through repeatable jobs, run history, logs, retry limits, and approval gates.

This worker is local-first and non-destructive. It does not mutate external systems.

## Commands

Validate job registry:

```bash
npm run jobs:validate
```

List jobs:

```bash
npm run jobs:list
```

Run a job:

```bash
npm run jobs:run -- repo-health
npm run jobs:run -- kernel-self-check
npm run jobs:run -- warehouse-summary
```

List runs:

```bash
npm run jobs:runs
```

Show a run:

```bash
npm run jobs:show -- <run-id>
```

## Boundaries

Jobs can read local repos, run local validation commands, write local run history, and summarize results.

Jobs must not create, delete, deploy, publish, push, provision, or mutate external systems unless a future approved job explicitly implements that boundary.

