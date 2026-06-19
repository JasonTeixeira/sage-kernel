# Sage Kernel MCP Tools

Generated from `apps/mcp-server/tools.json`.

| Tool | Risk | Permission | Approval Required | Side Effects |
| --- | --- | --- | --- | --- |
| `kernel.phase.status` | safe | `phase:read` | No | none |
| `kernel.catalog.search` | safe | `catalog:read` | No | none |
| `kernel.template.list` | safe | `template:read` | No | none |
| `kernel.project.plan` | safe | `project:read` | No | none |
| `kernel.project.scaffold` | mutating | `project:write` | No | writes local files only |
| `kernel.profile.detect` | safe | `profile:read` | No | none |
| `kernel.profile.gaps` | safe | `profile:read` | No | none |
| `kernel.done.generate` | safe | `profile:read` | No | none |
| `kernel.loop.plan` | safe | `workflow:read` | No | none |
| `kernel.loop.run` | mutating | `workflow:write` | No | runs local allowlisted verification commands |
| `kernel.loop.validate` | safe | `workflow:read` | No | none |
| `kernel.loop.prove` | safe | `workflow:read` | No | none |
| `kernel.loop.score` | safe | `workflow:read` | No | none |
| `kernel.loop.full_cycle` | safe | `workflow:read` | No | none |
| `kernel.workflow_engine.validate` | safe | `workflow:read` | No | none |
| `kernel.workflow_engine.prove` | mutating | `workflow:read` | No | creates a temporary fixture project and runs npm test inside it |
| `kernel.workflow_engine.run` | mutating | `workflow:write` | Yes | runs local workflow commands declared by the provided workflow definition |
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
| `kernel.semantic.index_project` | safe | `semantic:read` | No | none |
| `kernel.semantic.search_symbol` | safe | `semantic:read` | No | none |
| `kernel.semantic.find_references` | safe | `semantic:read` | No | none |
| `kernel.semantic.summarize_module` | safe | `semantic:read` | No | none |
| `kernel.adapters.list` | safe | `adapters:read` | No | none |
| `kernel.runbooks.list` | safe | `runbooks:read` | No | none |
| `kernel.runbooks.plan_day` | safe | `runbooks:read` | No | none |
| `kernel.runbooks.generate_adr` | safe | `runbooks:read` | No | none |
| `kernel.runbooks.execute_step` | approval-required | `runbooks:execute` | Yes | may execute allowlisted local commands and writes audit/artifact records |
| `kernel.dogfood.prod` | safe | `dogfood:read` | No | none |
| `kernel.workflow.audit_repo` | mutating | `workflow:write` | No | runs local QA commands and may write local audit records |
| `kernel.workflow.run_full_qa` | mutating | `workflow:write` | No | runs local QA commands and may write local audit records |
| `kernel.workflow.explain_failures` | safe | `workflow:read` | No | none |
| `kernel.workflow.create_app` | mutating | `workflow:write` | No | writes a generated project directory |
| `kernel.workflow.release_readiness` | safe | `workflow:read` | No | none |
| `kernel.workflow.pending_approvals` | safe | `workflow:read` | No | none |
| `kernel.workflow.stress_dashboard` | safe | `workflow:read` | No | none |
| `kernel.workflow.daily_summary` | safe | `workflow:read` | No | none |
| `kernel.agents.list` | safe | `agents:read` | No | none |
| `kernel.agents.validate` | safe | `agents:read` | No | none |
| `kernel.agents.doctor` | safe | `agents:read` | No | none |
| `kernel.agents.install_global` | mutating | `agents:write` | Yes | writes AGENTS.md and profile files under the selected user home |
| `kernel.agent.roles` | safe | `agents:read` | No | none |
| `kernel.agent.validate` | safe | `agents:read` | No | none |
| `kernel.agent.run` | safe | `agents:read` | No | none |
| `kernel.agent.eval` | safe | `agents:read` | No | none |
| `kernel.council.review` | safe | `agents:read` | No | none |
| `kernel.review.inspect_repo` | safe | `review:read` | No | none |
| `kernel.review.architecture_audit` | safe | `review:read` | No | none |
| `kernel.review.clean_code_audit` | safe | `review:read` | No | none |
| `kernel.review.test_audit` | safe | `review:read` | No | none |
| `kernel.review.security_audit` | safe | `review:read` | No | none |
| `kernel.review.diff_review` | safe | `review:read` | No | none |
| `kernel.review.route_test_map` | safe | `review:read` | No | none |
| `kernel.review.quality_score` | safe | `review:read` | No | none |
| `kernel.review.senior_review` | safe | `review:read` | No | none |
| `kernel.review.release_proof` | safe | `review:read` | No | none |
| `kernel.security.threat_model` | safe | `security:read` | No | none |
| `kernel.security.supply_chain` | safe | `security:read` | No | none |
| `kernel.security.proof` | safe | `security:read` | No | none |
| `kernel.testing.strategy` | safe | `testing:read` | No | none |
| `kernel.testing.playwright_template` | safe | `testing:read` | No | none |
| `kernel.testing.performance_budget` | safe | `testing:read` | No | none |
| `kernel.testing.proof` | safe | `testing:read` | No | none |
| `kernel.evidence.list` | safe | `evidence:read` | No | none |
| `kernel.evidence.compare` | safe | `evidence:read` | No | none |
| `kernel.postmortem.generate` | safe | `evidence:read` | No | none |
| `kernel.redteam.agent_safety` | safe | `security:read` | No | none |
| `kernel.benchmark.matrix` | safe | `testing:read` | No | none |
| `kernel.memory.policy` | safe | `memory:read` | No | none |
| `kernel.memory.graph` | safe | `memory:read` | No | none |
| `kernel.memory.learning_propose` | safe | `memory:read` | No | none |
| `kernel.memory.learning_approve` | safe | `memory:read` | No | none |
| `kernel.drift.map` | safe | `drift:read` | No | none |
| `kernel.drift.scope` | safe | `drift:read` | No | none |
| `kernel.drift.self_audit` | safe | `drift:read` | No | none |
| `kernel.drift.proof` | safe | `drift:read` | No | none |

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

### `kernel.profile.detect`

Project profile detection report with primary profile, secondary profiles, languages, frameworks, tests, CI, deployment, databases, evidence, and warnings.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.profile.gaps`

Profile gap report with primary/secondary profiles, loop proof status, missing evidence, and next actions.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.done.generate`

Definition-of-done object with acceptance criteria, required checks, commands, evidence, rollback requirement, and stop conditions.

Example input:

```json
{
  "projectPath": ".",
  "objective": "Add production release workflow.",
  "risk": "high"
}
```

### `kernel.loop.plan`

Closed-loop workflow object with phases, commands, evidence, stop conditions, rollback expectation, and next actions.

Example input:

```json
{
  "projectPath": ".",
  "objective": "Ship a production feature.",
  "risk": "high"
}
```

### `kernel.loop.run`

Closed-loop workflow execution with command results and next actions.

Example input:

```json
{
  "projectPath": ".",
  "objective": "Verify the current sprint.",
  "risk": "low"
}
```

### `kernel.loop.validate`

Validation report for closed-loop workflow structure and required gates.

Example input:

```json
{}
```

### `kernel.loop.prove`

Proof report for planned, dry-run, and runner-backed closed-loop workflows.

Example input:

```json
{}
```

### `kernel.loop.score`

Loop score with profile, required checks, phases, hard gaps, and status.

Example input:

```json
{
  "projectPath": ".",
  "risk": "high"
}
```

### `kernel.loop.full_cycle`

Full-cycle plan and scorecard without mutating the target project.

Example input:

```json
{
  "projectPath": ".",
  "objective": "Prepare production release",
  "risk": "high"
}
```

### `kernel.workflow_engine.validate`

Workflow engine validation report with status, state coverage, checked step count, and failures.

Example input:

```json
{}
```

### `kernel.workflow_engine.prove`

Workflow engine proof report with before failure, repaired workflow run, after pass, audit trail, and repair evidence.

Example input:

```json
{}
```

### `kernel.workflow_engine.run`

Workflow execution report with final status, state, validation, step results, repairs, rollback entries, audit trail, and next actions.

Example input:

```json
{
  "definition": {
    "id": "mcp_runtime_smoke",
    "steps": [
      {
        "id": "inspect",
        "type": "inspect"
      },
      {
        "id": "review",
        "type": "review"
      }
    ]
  }
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

### `kernel.semantic.index_project`

Semantic index with adapter metadata, module summaries, extracted symbols, and bounded reference terms.

Example input:

```json
{
  "projectPath": ".",
  "limit": 200
}
```

### `kernel.semantic.search_symbol`

Symbol search result with query, count, and matching symbol records.

Example input:

```json
{
  "query": "createSemanticCode",
  "limit": 5
}
```

### `kernel.semantic.find_references`

Reference search result with file, line, and trimmed text for each hit.

Example input:

```json
{
  "query": "semantic",
  "limit": 10
}
```

### `kernel.semantic.summarize_module`

Module summary with language, line count, symbols, imports, exports, and a short generated summary.

Example input:

```json
{
  "file": "packages/intelligence/semantic-code.mjs"
}
```

### `kernel.adapters.list`

Adapter discovery report with status summary, capabilities, mutation policy, permission, configured environment keys, and install hints.

Example input:

```json
{}
```

### `kernel.runbooks.list`

Runbook catalog with ids, titles, risk, approval requirement, steps, and verification commands.

Example input:

```json
{}
```

### `kernel.runbooks.plan_day`

Daily plan with objective, phase, risks, steps, gates, and evidence summary.

Example input:

```json
{
  "objective": "Advance Sage Kernel safely."
}
```

### `kernel.runbooks.generate_adr`

ADR object with id, title, status, markdown, and optional root-bounded output path.

Example input:

```json
{
  "title": "Use local-first runbooks",
  "decision": "Keep runbooks in-repo and validated."
}
```

### `kernel.runbooks.execute_step`

Runbook step execution result with status, command, timeout, duration, stdout/stderr excerpts, rollback metadata, and audit record.

Example input:

```json
{
  "runbook": "runbook_release_verification",
  "step": "local_release_check",
  "dryRun": true
}
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

### `kernel.agents.list`

Agent profile list with id, title, source path, byte size, and content hash.

Example input:

```json
{}
```

### `kernel.agents.validate`

Validation report with status, coverage counts, and failures.

Example input:

```json
{}
```

### `kernel.agents.doctor`

Doctor report with source pack, global file, manifest, and installed profile checks.

Example input:

```json
{}
```

### `kernel.agents.install_global`

Install result with target path, manifest path, profile directory, and backup paths.

Example input:

```json
{
  "force": true,
  "approvalId": "approval_id"
}
```

### `kernel.agent.roles`

Executable agent role catalog with bounded permissions, quality checklist, memory policy, and approval policy.

Example input:

```json
{}
```

### `kernel.agent.validate`

Agent runtime validation report with role count, required-role coverage, policy coverage, and failures.

Example input:

```json
{}
```

### `kernel.agent.run`

Agent task result with role metadata, project evidence, findings, permission policy, and next actions.

Example input:

```json
{
  "role": "reviewer",
  "projectPath": "."
}
```

### `kernel.agent.eval`

Agent eval report with pass/fail status for role contracts, agent execution, and council review.

Example input:

```json
{}
```

### `kernel.council.review`

Council review result with per-agent results, scorecards, deduplicated severity-ranked findings, decision, and next actions.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.review.inspect_repo`

Repository inspection summary with project metadata, counts, scripts, docs, CI, surfaces, and findings.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.review.architecture_audit`

Architecture category score with findings and evidence references.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.review.clean_code_audit`

Clean-code category score with findings and evidence references.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.review.test_audit`

Testing category score with findings and evidence references.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.review.security_audit`

Security category score with findings and evidence references.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.review.diff_review`

Diff review with changed files, risk classification, severity/confidence findings, and pass/needs-work status.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.review.route_test_map`

Route-to-test map with route counts, matching tests, untested route findings, and status.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.review.quality_score`

Inspection plus validated review report with architecture, clean-code, testing, security, and release scores.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.review.senior_review`

Senior review result with inspection, diff review, route-test map, validated report, status, and remaining work.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.review.release_proof`

Release-proof review report with release evidence, score, remaining work, and status.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.security.threat_model`

Threat model with assets, identities, external systems, trust boundaries, threats, mitigations, and required reviews.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.security.supply_chain`

Supply-chain report with SBOM components, license status, dependency risk findings, scorecard, and status.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.security.proof`

Security proof report with threat-model, supply-chain, license, dependency-risk, and scorecard gates.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.testing.strategy`

Test strategy with profile, layers, missing layers, required commands, evidence, and definition of done.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.testing.playwright_template`

Playwright template file map with config, smoke spec, page object, and setup instructions.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.testing.performance_budget`

Performance budget with latency, memory, throughput, stress profiles, and release evidence requirements.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.testing.proof`

Testing lab proof with strategy, Playwright template, performance budget, and release soak plan.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.evidence.list`

Evidence artifact list with kind, path, size, and modified timestamp.

Example input:

```json
{
  "limit": 10
}
```

### `kernel.evidence.compare`

Evidence comparison with summarized left/right status and score delta.

Example input:

```json
{
  "left": ".sage-kernel/runs/a.json",
  "right": ".sage-kernel/runs/b.json"
}
```

### `kernel.postmortem.generate`

Postmortem draft with failure, impact, hypotheses, prevention rules, and next actions.

Example input:

```json
{
  "failure": "Dashboard stress failed at concurrency 200."
}
```

### `kernel.redteam.agent_safety`

Agent safety red-team scenario matrix with expected defenses and missing automation.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.benchmark.matrix`

Benchmark matrix over local project paths with profile detection and recommended proof commands.

Example input:

```json
{
  "paths": [
    "."
  ]
}
```

### `kernel.memory.policy`

Memory policy decision with status, scope, approval requirement, confidence, failures, and allowed kinds.

Example input:

```json
{
  "summary": "Use contract tests for MCP tools.",
  "evidenceRef": "review"
}
```

### `kernel.memory.graph`

Knowledge graph with nodes, edges, project metadata, and queryable relationships.

Example input:

```json
{
  "projectPath": "."
}
```

### `kernel.memory.learning_propose`

Learning proposal with policy decision and normalized memory record candidate.

Example input:

```json
{
  "projectPath": ".",
  "failure": "Test failed.",
  "fix": "Added regression test."
}
```

### `kernel.memory.learning_approve`

Approved learning update with approved memory record and approval metadata.

Example input:

```json
{
  "proposal": {
    "status": "proposed"
  }
}
```

### `kernel.drift.map`

Drift map with architecture directories, MCP parity counts, dashboard routes, docs, tests, permissions, and findings.

Example input:

```json
{}
```

### `kernel.drift.scope`

Scope report with inspected files, allowed scopes, denied patterns, and blocking findings.

Example input:

```json
{}
```

### `kernel.drift.self_audit`

Self-audit report with parity checks for MCP dispatcher, contracts, docs, permissions, scripts, and release gates.

Example input:

```json
{}
```

### `kernel.drift.proof`

Complete drift proof with status, map, scope report, self-audit report, findings, and remaining work.

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

### `kernel.profile.detect`

- Project path is outside allowed profile roots.
- Project files are unreadable.

### `kernel.profile.gaps`

- Project path is outside allowed profile roots.
- Project profile cannot be detected.

### `kernel.done.generate`

- Project path is outside allowed profile roots.
- Profile id is unknown.

### `kernel.loop.plan`

- Project path is outside allowed profile roots.
- Project profile cannot be detected.

### `kernel.loop.run`

- One or more verification commands fail.
- Project path is outside allowed profile roots.

### `kernel.loop.validate`

- Closed-loop workflow contract is incomplete.

### `kernel.loop.prove`

- Closed-loop fixture proof fails.

### `kernel.loop.score`

- Project path is outside allowed profile roots.
- Project profile cannot be detected.

### `kernel.loop.full_cycle`

- Project path is outside allowed profile roots.
- Review, security, or testing proof cannot be generated.

### `kernel.workflow_engine.validate`

- Workflow definition is malformed.
- A command-required step is missing a command.

### `kernel.workflow_engine.prove`

- Fixture setup fails.
- The controlled failing test does not fail before repair.
- The repaired fixture test does not pass.

### `kernel.workflow_engine.run`

- Input definition is missing.
- Workflow validation fails.
- A workflow command fails after retry budget.
- A required approval is missing.

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

### `kernel.semantic.index_project`

- Project path is outside the kernel root.
- Project files are unreadable.
- Configured extension list is invalid.

### `kernel.semantic.search_symbol`

- input.query is missing.
- Project path is outside the kernel root.
- Project files are unreadable.

### `kernel.semantic.find_references`

- input.query is missing.
- Project path is outside the kernel root.
- Project files are unreadable.

### `kernel.semantic.summarize_module`

- input.file is missing.
- File path is outside the kernel root.
- Module file is missing or unreadable.

### `kernel.adapters.list`

- Optional adapter catalog is missing or malformed.
- Configured adapter command is missing from PATH.
- Optional adapter is intentionally disabled by environment.

### `kernel.runbooks.list`

- Runbook catalog JSON is missing or malformed.
- Runbook validation fails.

### `kernel.runbooks.plan_day`

- Catalog phase file is missing or malformed.
- Eval report is missing, producing a needs_attention plan.
- Memory store cannot initialize, producing fallback evidence.

### `kernel.runbooks.generate_adr`

- Output path is outside the project root.
- Output directory cannot be created.
- ADR input contains unsupported values.

### `kernel.runbooks.execute_step`

- Signed approval is missing or invalid for execution.
- Runbook or step id is unknown.
- Command is not in the runbook execution allowlist.
- Step command times out or exits non-zero.

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

### `kernel.agents.list`

- Agent manifest is missing or malformed.
- A profile file is missing.

### `kernel.agents.validate`

- Required global rules are missing.
- Required profile sections are missing.

### `kernel.agents.doctor`

- Global AGENTS.md is not installed.
- Install manifest is missing.
- One or more installed profiles are missing.

### `kernel.agents.install_global`

- Approval is missing or invalid.
- Agent pack validation fails.
- Existing AGENTS.md requires --force.
- Selected home is not writable.

### `kernel.agent.roles`

- Agent role catalog is invalid.

### `kernel.agent.validate`

- A role is missing permissions, policies, or quality checklist.
- Duplicate role ids exist.

### `kernel.agent.run`

- Unknown role.
- Project path is outside allowed review roots.
- Review evidence cannot be generated.

### `kernel.agent.eval`

- Agent role validation fails.
- Agent execution eval fails.
- Council eval fails.

### `kernel.council.review`

- No roles were provided.
- Unknown role.
- Project path is outside allowed review roots.

### `kernel.review.inspect_repo`

- Project path is outside allowed review roots.
- Project files cannot be read.

### `kernel.review.architecture_audit`

- Project path is outside allowed review roots.
- Project metadata cannot be read.

### `kernel.review.clean_code_audit`

- Project path is outside allowed review roots.
- Source files cannot be scanned.

### `kernel.review.test_audit`

- Project path is outside allowed review roots.
- Test metadata cannot be scanned.

### `kernel.review.security_audit`

- Project path is outside allowed review roots.
- Security metadata cannot be scanned.

### `kernel.review.diff_review`

- Project path is outside allowed review roots.
- Diff cannot be parsed.

### `kernel.review.route_test_map`

- Project path is outside allowed review roots.
- Route files cannot be scanned.

### `kernel.review.quality_score`

- Project path is outside allowed review roots.
- Review report cannot be constructed.

### `kernel.review.senior_review`

- Project path is outside allowed review roots.
- Senior review report cannot be constructed.

### `kernel.review.release_proof`

- Project path is outside allowed review roots.
- Release proof cannot be constructed.

### `kernel.security.threat_model`

- Project path is outside allowed security roots.
- Project metadata cannot be scanned.

### `kernel.security.supply_chain`

- Project path is outside allowed security roots.
- Dependency manifest cannot be scanned.

### `kernel.security.proof`

- Project path is outside allowed security roots.
- Security proof cannot be constructed.

### `kernel.testing.strategy`

- Project path is outside allowed roots.
- Project profile cannot be detected.

### `kernel.testing.playwright_template`

- Project path is outside allowed roots.
- Project profile cannot be detected.

### `kernel.testing.performance_budget`

- Project path is outside allowed roots.
- Unknown project profile.

### `kernel.testing.proof`

- Project path is outside allowed roots.
- Testing proof cannot be constructed.

### `kernel.evidence.list`

- Evidence directories are missing or unreadable.

### `kernel.evidence.compare`

- Evidence path is missing.
- Evidence JSON cannot be parsed.

### `kernel.postmortem.generate`

- Input failure context is too vague for useful postmortem detail.

### `kernel.redteam.agent_safety`

- Project path is outside allowed roots.
- Project profile cannot be detected.

### `kernel.benchmark.matrix`

- One or more project paths are outside allowed profile roots.
- Project profile cannot be detected.

### `kernel.memory.policy`

- Summary is missing.
- Memory contains secret-like material.
- Confidence is too low.

### `kernel.memory.graph`

- Project path is outside allowed roots.
- Project profile cannot be detected.

### `kernel.memory.learning_propose`

- Project path is outside allowed roots.
- Memory policy blocks the update.

### `kernel.memory.learning_approve`

- Proposal is missing.
- Proposal was not in proposed state.

### `kernel.drift.map`

- Repository files cannot be scanned.
- MCP manifest or dispatcher files are malformed.

### `kernel.drift.scope`

- Git status is unavailable and filesystem fallback cannot be scanned.
- Denied files are present in the inspected scope.

### `kernel.drift.self_audit`

- Generated docs or contracts are stale.
- Permission guard does not match MCP risk metadata.

### `kernel.drift.proof`

- Any drift map, scope, contract, documentation, or permission check has a blocking finding.

## Approval Required

Tools marked "Yes" require a signed approval record whose action and payload match the requested tool call.
