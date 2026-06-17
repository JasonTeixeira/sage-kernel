# Sage Kernel MCP Tools

Generated from `apps/mcp-server/tools.json`.

| Tool | Risk | Permission | Approval Required | Side Effects |
| --- | --- | --- | --- | --- |
| `kernel.phase.status` | safe | `phase:read` | No | none |
| `kernel.catalog.search` | safe | `catalog:read` | No | none |
| `kernel.template.list` | safe | `template:read` | No | none |
| `kernel.project.plan` | safe | `project:read` | No | none |
| `kernel.project.scaffold` | mutating | `project:write` | No | writes local files only |
| `kernel.warehouse.summary` | safe | `warehouse:read` | No | none |
| `kernel.warehouse.search` | safe | `warehouse:read` | No | none |
| `kernel.qa.profile` | safe | `qa:read` | No | none |
| `kernel.qa.plan` | safe | `qa:read` | No | none |
| `kernel.qa.run` | mutating | `qa:run` | No | runs local commands only |
| `kernel.repo.inspect` | safe | `repo:read` | No | none |
| `kernel.infra.plan` | safe | `infra:read` | No | none |
| `kernel.deploy.prepare` | safe | `deploy:prepare` | No | none |
| `kernel.jobs.list` | safe | `jobs:read` | No | none |
| `kernel.jobs.run` | approval-required | `jobs:run` | Yes | writes local run history |
| `kernel.jobs.runs` | safe | `jobs:read` | No | none |
| `kernel.jobs.enqueue` | mutating | `jobs:write` | No | writes local SQLite queue state |
| `kernel.worker.tick` | mutating | `worker:tick` | No | runs one local queued job if ready |
| `kernel.approvals.request` | mutating | `approvals:write` | No | writes local SQLite approval state |
| `kernel.approvals.list` | safe | `approvals:read` | No | none |
| `kernel.approvals.approve` | mutating | `approvals:write` | No | writes signed local SQLite approval state |
| `kernel.dashboard.snapshot` | safe | `dashboard:read` | No | none |
| `kernel.dogfood.prod` | safe | `dogfood:read` | No | none |
| `kernel.workflow.audit_repo` | mutating | `workflow:write` | No | runs local QA commands and may write local audit records |
| `kernel.workflow.run_full_qa` | mutating | `workflow:write` | No | runs local QA commands and may write local audit records |
| `kernel.workflow.explain_failures` | safe | `workflow:read` | No | none |
| `kernel.workflow.create_app` | mutating | `workflow:write` | No | writes a generated project directory |
| `kernel.workflow.release_readiness` | safe | `workflow:read` | No | none |
| `kernel.workflow.pending_approvals` | safe | `workflow:read` | No | none |
| `kernel.workflow.stress_dashboard` | safe | `workflow:read` | No | none |
| `kernel.workflow.daily_summary` | safe | `workflow:read` | No | none |

## Output Shape

### `kernel.phase.status`

Array of kernel phase records with id, name, status, goal, and completion criteria.

Example input:

```json
{}
```

### `kernel.catalog.search`

Array of matching catalog entries grouped by kind and original item payload.

Example input:

```json
{
  "query": "qa",
  "limit": 2
}
```

### `kernel.template.list`

Array of template records with coverage, stack, and QA profile metadata.

Example input:

```json
{}
```

### `kernel.project.plan`

Project plan object containing template, target, QA profile, infra plan, and next steps.

Example input:

```json
{
  "template": "next-ai-app",
  "target": "local",
  "name": "demo-ai-app"
}
```

### `kernel.project.scaffold`

Scaffold result with output path and generated file list.

Example input:

```json
{
  "template": "worker-service",
  "name": "demo-worker",
  "out": ".sage-kernel/generated"
}
```

### `kernel.warehouse.summary`

AI Warehouse summary with inventory counts and maturity/category breakdowns.

Example input:

```json
{}
```

### `kernel.warehouse.search`

Array of AI Warehouse tool matches with slug, name, verdict, maturity, tags, and summary.

Example input:

```json
{
  "query": "agent",
  "limit": 5,
  "verdict": "use"
}
```

### `kernel.qa.profile`

QA profile object for the requested template, including commands and gates.

Example input:

```json
{
  "template": "next-ai-app"
}
```

### `kernel.qa.plan`

QA execution plan with selected profile, mode, checks, and commands without executing them.

Example input:

```json
{
  "template": "next-ai-app",
  "mode": "standard"
}
```

### `kernel.qa.run`

Signed QA report with project path, mode, status, checks, timestamps, and signature.

Example input:

```json
{
  "projectPath": ".",
  "mode": "fast"
}
```

### `kernel.repo.inspect`

Repository inspection with existence, package metadata, readme preview, and source path.

Example input:

```json
{
  "repo": "nexural-qa-os"
}
```

### `kernel.infra.plan`

Infrastructure plan with deploy target, environment requirements, readiness checks, and rollback notes.

Example input:

```json
{
  "template": "next-ai-app",
  "target": "local"
}
```

### `kernel.deploy.prepare`

Deploy readiness object combining QA gates, infra plan, environment checks, rollback, and approval requirements.

Example input:

```json
{
  "template": "next-ai-app",
  "target": "local"
}
```

### `kernel.jobs.list`

Array of job definitions with id, risk, schedule, approval boundary, and steps.

Example input:

```json
{}
```

### `kernel.jobs.run`

Job run summary with run id, job id, status, duration, path, and step results.

Example input:

```json
{
  "job": "repo-health",
  "approvalId": "approval_123"
}
```

### `kernel.jobs.runs`

Array of recent job run summaries with status, duration, timestamp, and path.

Example input:

```json
{
  "limit": 10
}
```

### `kernel.jobs.enqueue`

Queued job record with id, job id, status, priority, payload, attempts, and next run time.

Example input:

```json
{
  "job": "repo-health",
  "payload": {},
  "delayMs": 0
}
```

### `kernel.worker.tick`

Worker tick result showing claimed job, execution status, and queue transition.

Example input:

```json
{}
```

### `kernel.approvals.request`

Approval record with id, action, status, reason, payload, and creation timestamp.

Example input:

```json
{
  "action": "kernel.jobs.run",
  "reason": "Run repo health audit",
  "payload": {
    "job": "repo-health"
  }
}
```

### `kernel.approvals.list`

Array of approval records filtered by optional status.

Example input:

```json
{
  "status": "pending"
}
```

### `kernel.approvals.approve`

Signed approval record with approved status, decidedBy, decidedAt, and signature.

Example input:

```json
{
  "id": "approval_123",
  "decidedBy": "local-user"
}
```

### `kernel.dashboard.snapshot`

Dashboard snapshot with version, health, DB counts, approvals, jobs, repos, templates, artifacts, and metrics inputs.

Example input:

```json
{}
```

### `kernel.dogfood.prod`

Dogfood audit report with configured source root, targets, checks, QA status, and failed QA checks.

Example input:

```json
{
  "repos": [
    "commerce-command-os"
  ]
}
```

### `kernel.workflow.audit_repo`

Daily audit report with QA result, dashboard health summary, pending approval count, and next actions.

Example input:

```json
{
  "projectPath": ".",
  "mode": "fast"
}
```

### `kernel.workflow.run_full_qa`

Full QA workflow report with mode, QA status, failed checks, and next actions.

Example input:

```json
{
  "projectPath": ".",
  "mode": "standard"
}
```

### `kernel.workflow.explain_failures`

Failure explanation with failed check names, command output excerpts, and recommended rerun steps.

Example input:

```json
{
  "report": {
    "status": "failed",
    "checks": []
  }
}
```

### `kernel.workflow.create_app`

Create-app workflow result with template plan, scaffold output, status, and next actions.

Example input:

```json
{
  "template": "worker-service",
  "name": "daily-worker",
  "out": ".sage-kernel/generated"
}
```

### `kernel.workflow.release_readiness`

Release readiness report with deployment plan, checks, status, and next actions.

Example input:

```json
{
  "template": "worker-service",
  "target": "docker"
}
```

### `kernel.workflow.pending_approvals`

Approval inbox report with status filter, count, approval records, and next actions.

Example input:

```json
{
  "status": "pending"
}
```

### `kernel.workflow.stress_dashboard`

Dashboard stress report with request count, concurrency, failures, throughput, and latency percentiles.

Example input:

```json
{
  "url": "http://127.0.0.1:8787",
  "count": 200,
  "concurrency": 20
}
```

### `kernel.workflow.daily_summary`

Daily summary with dashboard health, DB counts, tool count, pending approvals, recent runs, and next actions.

Example input:

```json
{}
```

## Failure Modes

### `kernel.phase.status`

- Catalog phase file is missing or malformed.

### `kernel.catalog.search`

- input.query is missing.
- Catalog JSON files are missing or malformed.

### `kernel.template.list`

- Template catalog is missing or malformed.

### `kernel.project.plan`

- input.template is missing.
- Template id is unknown.
- Infra target is unknown.

### `kernel.project.scaffold`

- input.template or input.name is missing.
- Template id is unknown.
- Output path is invalid or not writable.

### `kernel.warehouse.summary`

- AI_WAREHOUSE_ROOT is not configured.
- Warehouse index is missing or malformed.

### `kernel.warehouse.search`

- input.query is missing.
- AI_WAREHOUSE_ROOT is not configured.
- Warehouse index is missing or malformed.

### `kernel.qa.profile`

- input.template is missing.
- Template id is unknown.
- QA profile is missing.

### `kernel.qa.plan`

- input.template is missing.
- Template id is unknown.
- QA profile is missing.

### `kernel.qa.run`

- Project path is outside allowed roots.
- Configured command fails.
- Project package or required files are missing.

### `kernel.repo.inspect`

- input.repo is missing.
- SAGE_KERNEL_SOURCE_ROOT is not configured.
- Repo is not in the catalog.

### `kernel.infra.plan`

- input.template is missing.
- Template id is unknown.
- Deploy target is unknown.

### `kernel.deploy.prepare`

- input.template is missing.
- Template id is unknown.
- Deploy target is unknown.

### `kernel.jobs.list`

- Job registry is missing or malformed.

### `kernel.jobs.run`

- input.job is missing.
- Job is unknown.
- Signed approval is missing or invalid.
- Job step fails.

### `kernel.jobs.runs`

- Run history directory or database rows are unreadable.

### `kernel.jobs.enqueue`

- input.job is missing.
- Job is unknown.
- SQLite queue write fails.

### `kernel.worker.tick`

- No job is ready.
- Claimed job fails.
- SQLite queue update fails.

### `kernel.approvals.request`

- input.action or input.reason is missing.
- SQLite approval write fails.

### `kernel.approvals.list`

- Approval database query fails.

### `kernel.approvals.approve`

- input.id is missing.
- Approval id is unknown.
- SQLite approval update fails.

### `kernel.dashboard.snapshot`

- Dashboard database initialization fails.
- Catalog files are missing or malformed.

### `kernel.dogfood.prod`

- Source root is not configured.
- Target repo is missing.
- QA report is malformed or failed.

### `kernel.workflow.audit_repo`

- Project path is outside allowed roots.
- QA command fails.
- Dashboard snapshot cannot be created.

### `kernel.workflow.run_full_qa`

- Project path is outside allowed roots.
- QA command exits non-zero.
- QA report is malformed.

### `kernel.workflow.explain_failures`

- Provided report is malformed.
- Fallback QA run fails before producing JSON.

### `kernel.workflow.create_app`

- input.template or input.name is missing.
- Template id is unknown.
- Output directory already exists.

### `kernel.workflow.release_readiness`

- Template id is unknown.
- Deployment target is unknown.
- Dashboard snapshot cannot be created.

### `kernel.workflow.pending_approvals`

- Approval database query fails.

### `kernel.workflow.stress_dashboard`

- Dashboard URL is unreachable.
- Stress script times out.
- Stress report JSON is malformed.

### `kernel.workflow.daily_summary`

- Dashboard snapshot cannot be created.
- Approval ledger query fails.
- Run history is malformed.

## Approval Required

Tools marked "Yes" require a signed approval record whose action and payload match the requested tool call.
