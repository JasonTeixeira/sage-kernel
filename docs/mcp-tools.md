# Sage Kernel MCP Tools

Generated from `apps/mcp-server/tools.json`.

| Tool | Risk | Permission | Approval Required | Side Effects |
| --- | --- | --- | --- | --- |
| `kernel.phase.status` | safe | `phase:status` | No | none |
| `kernel.catalog.search` | safe | `catalog:search` | No | none |
| `kernel.template.list` | safe | `template:list` | No | none |
| `kernel.project.plan` | safe | `project:plan` | No | none |
| `kernel.project.scaffold` | mutating | `project:write` | No | writes local files only |
| `kernel.warehouse.summary` | safe | `warehouse:summary` | No | none |
| `kernel.warehouse.search` | safe | `warehouse:search` | No | none |
| `kernel.qa.profile` | safe | `qa:profile` | No | none |
| `kernel.qa.plan` | safe | `qa:plan` | No | none |
| `kernel.qa.run` | mutating | `qa:run` | No | runs local commands only |
| `kernel.repo.inspect` | safe | `repo:inspect` | No | none |
| `kernel.infra.plan` | safe | `infra:plan` | No | none |
| `kernel.deploy.prepare` | safe | `deploy:prepare` | No | none |
| `kernel.jobs.list` | safe | `jobs:list` | No | none |
| `kernel.jobs.run` | mutating | `jobs:run` | Yes | writes local run history |
| `kernel.jobs.runs` | safe | `jobs:runs` | No | none |
| `kernel.jobs.enqueue` | mutating | `jobs:write` | No | writes local SQLite queue state |
| `kernel.worker.tick` | mutating | `worker:tick` | No | runs one local queued job if ready |
| `kernel.approvals.request` | mutating | `approvals:write` | No | writes local SQLite approval state |
| `kernel.approvals.list` | safe | `approvals:read` | No | none |
| `kernel.approvals.approve` | mutating | `approvals:write` | No | writes signed local SQLite approval state |
| `kernel.dashboard.snapshot` | safe | `dashboard:snapshot` | No | none |
| `kernel.dogfood.prod` | safe | `dogfood:prod` | No | none |

## Approval Required

Tools marked "Yes" require a signed approval record whose action and payload match the requested tool call.
