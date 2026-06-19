# Sage Kernel Global Engineering Operating Contract

Sage Kernel is a local, MCP-first software development lifecycle control plane.
It is not primarily a web application. The product is the local MCP server,
CLI, policies, profiles, loops, evidence ledger, and scorecards that help an
engineer or coding agent plan, build, verify, review, release, and improve
software with proof.

The standard is simple:

> Prove every claim, score every pass, and never let unreviewed work escape the
> loop.

## Product Shape

Sage Kernel should be installed locally and exposed through the MCP server:

```bash
npm run mcp:start
sage mcp smoke
sage doctor --fast --json
```

The dashboard is optional. The required surface is:

- MCP tools for project detection, planning, loops, review, security, testing,
  memory, release, self-audit, and orchestration.
- CLI commands that call the same capabilities for terminal use.
- Local persistence for evidence, approvals, run history, memory, and scorecards.
- Strict permission metadata and approval gates for mutating work.

## Core Operating Loop

Every meaningful engineering task should pass through this loop:

1. **Intent**: clarify goal, constraints, non-goals, risk, and success criteria.
2. **Inspect**: detect stack, profile, tests, routes, data, CI, deployment, and
   security boundaries.
3. **Plan**: produce the smallest reversible plan with proof commands.
4. **Design**: check architecture, contracts, UX/API shape, data flow, and
   operational impact before writing code.
5. **Build**: implement scoped patches only.
6. **Verify**: run profile-specific tests, coverage, E2E, security, stress, and
   release gates.
7. **Review**: perform diff, architecture, security, test, clean-code, and
   release review.
8. **Score**: assign category scores with evidence and hard blockers.
9. **Repair**: generate a bounded repair plan for failed gates.
10. **Self-Audit**: check tool contracts, docs drift, profile coverage, and
    missing evidence.
11. **Record**: write audit evidence, decision notes, memory updates, and next
    actions.
12. **Release**: only after fresh install, public install when applicable,
    provenance, rollback, and client proof are recorded.

No loop is complete until its evidence and scorecard exist.

## Required First-Class Profiles

The current broad profiles are useful, but a world-class engineering control
plane needs more specific profiles. These should be first-class detection and
definition-of-done profiles, not only QA profile entries.

### Product Profiles

- `web-app`
- `saas-app`
- `admin-dashboard`
- `marketing-site`
- `docs-site`
- `browser-extension`
- `desktop-app`
- `mobile-app`
- `cli-tool`
- `library`
- `plugin-sdk`

### Backend And Platform Profiles

- `backend-api`
- `worker-service`
- `event-driven-service`
- `mcp-server`
- `multi-service-platform`
- `monorepo`
- `infrastructure`
- `serverless-app`
- `edge-app`
- `realtime-app`

### Data And AI Profiles

- `data-pipeline`
- `data-warehouse-dbt`
- `analytics-dashboard`
- `ml-model-service`
- `ai-app`
- `ai-agent-app`
- `llm-agent-platform`
- `rag-system`
- `eval-harness`

### Regulated Or High-Risk Profiles

- `fintech-app`
- `healthcare-app`
- `trading-system`
- `payments-system`
- `identity-auth-system`
- `internal-admin-tool`
- `security-tool`

Each profile must define:

- detection evidence
- required checks
- optional checks
- commands
- E2E proof
- security proof
- performance proof
- release proof
- rollback proof
- evidence artifacts
- hard blockers
- score weights

## Required Loop Types

The kernel should expose each loop as MCP tools and CLI commands.

### Planning Loops

- `intent.loop`: objective, scope, constraints, non-goals.
- `architecture.loop`: design, contracts, dependencies, tradeoffs.
- `definition_of_done.loop`: profile-aware acceptance criteria.
- `risk.loop`: security, data, payments, AI, infra, compliance risk.

### Build Loops

- `implementation.loop`: scoped changes with rollback notes.
- `test_first.loop`: failing test, implementation, passing proof.
- `migration.loop`: schema/data migration, rollback, backfill, replay.
- `integration.loop`: provider contract, sandbox proof, failure modes.

### Verification Loops

- `unit.loop`
- `integration.loop`
- `e2e.loop`
- `accessibility.loop`
- `mobile-device.loop`
- `performance.loop`
- `stress-soak.loop`
- `security.loop`
- `supply-chain.loop`
- `release.loop`

### Review Loops

- `diff-review.loop`
- `architecture-review.loop`
- `security-review.loop`
- `test-review.loop`
- `ux-review.loop`
- `operability-review.loop`
- `docs-review.loop`
- `release-readiness.loop`

### Self-Improvement Loops

- `self-audit.loop`
- `drift-control.loop`
- `score-regression.loop`
- `memory-learning.loop`
- `profile-gap.loop`
- `benchmark-comparison.loop`
- `postmortem.loop`

## Orchestration Roles

The agent council should be role-based, bounded, and evidence-only. Roles should
never silently mutate external systems.

Required roles:

- `architect`: design, boundaries, dependency choices.
- `builder`: implementation plan and scoped patch proposal.
- `reviewer`: correctness, maintainability, edge cases.
- `test-engineer`: coverage, E2E, fixtures, regression gates.
- `security-engineer`: auth, secrets, supply chain, abuse cases.
- `release-engineer`: packaging, provenance, rollback, changelog.
- `performance-engineer`: load, latency, memory, soak, budgets.
- `data-engineer`: migrations, lineage, replay, idempotency.
- `ux-auditor`: usability, accessibility, error/empty/loading states.
- `product-operator`: user workflow, adoption, docs, demo readiness.

Each role must return:

- findings with severity and confidence
- evidence references
- scorecard inputs
- next action
- stop conditions

## Scorecard Contract

Every pass should score itself across these categories:

- installability
- profile detection
- planning quality
- architecture quality
- code quality
- test quality
- E2E coverage
- security
- supply chain
- data integrity
- AI/tool safety
- observability
- performance
- release readiness
- rollback readiness
- docs quality
- MCP compatibility
- client proof
- memory/learning quality
- self-audit quality

Hard caps:

- Cap at `69` if sensitive auth, payments, PII, destructive actions, or secrets
  are unsafe.
- Cap at `84` if critical E2E or release proof is missing.
- Cap at `89` if only fixtures are proven and no real external project proof is
  recorded.
- Cap at `94` if public install, external MCP client proof, or rollback proof is
  missing.
- Only score `95+` when local, CI, external, and user-facing proof all exist.

## Evidence Ledger

Every completed loop should write or expose:

- command run
- exit status
- timestamp
- git SHA
- profile detected
- artifacts produced
- scorecard
- failures
- repair plan
- approvals used
- rollback note
- next action

Evidence must be machine-readable first and human-readable second.

## Current Missing Layers

These are the biggest gaps keeping Sage Kernel from being a truly elite local
engineering operating system.

1. **Public npm install proof**: package is not globally installable until npm
   publish with provenance succeeds.
2. **Real project matrix**: fixtures are strong, but at least 20 real repos
   should be profiled, looped, reviewed, and scored.
3. **Specific profile expansion**: QA profiles such as `saas-app`,
   `trading-dashboard`, `worker-service`, `admin-tool`, and `extension` should
   become first-class SDLC detector profiles.
4. **Real mobile proof**: simulator/emulator/device smoke, deep links,
   permissions, offline mode, and signing proof.
5. **Real infra proof**: sandbox cloud plan, policy-as-code, drift, cost,
   rollback, and destroy proof.
6. **Real data-pipeline proof**: idempotency, dirty fixtures, replay, partial
   failure, late data, lineage, and backfill proof.
7. **AI red-team proof**: prompt injection, malicious repo content, unsafe tool
   calls, memory poisoning, and output safety fixtures.
8. **External MCP client proof**: Codex and Claude Code are proven; Cursor needs
   live client launch and one successful tool call.
9. **Benchmark comparison**: compare against known tool classes: CI, code review,
   security scanner, test generator, MCP servers, and agent frameworks.
10. **Evidence UX**: optional dashboard should show evidence timelines, score
    diffs, run comparisons, and repair plans clearly.
11. **Policy packs**: solo, team, enterprise, regulated, fintech, healthcare,
    and open-source policies.
12. **Postmortem loop**: every failed pass should produce a root cause,
    prevention rule, memory candidate, and regression test candidate.

## MCP Server Requirements

The local MCP server should expose tools for:

- `profile.detect`
- `done.generate`
- `loop.plan`
- `loop.run`
- `workflow_engine.run`
- `review.diff`
- `review.senior`
- `security.prove`
- `testing.strategy`
- `testing.proof`
- `performance.budget`
- `memory.e2e`
- `drift.prove`
- `score.report`
- `self_heal.prove`
- `audit.full`
- `release.prove`
- `evidence.list`
- `evidence.compare`
- `postmortem.generate`
- `profile.gaps`

Mutating tools must require explicit approval and must record the approval in
the evidence ledger.

## Definition Of World-Class

Sage Kernel is world-class only when a new engineer can install it, connect it
to an MCP client, point it at an unfamiliar repo, and get:

- accurate project detection
- profile-specific definition of done
- architecture and implementation plan
- safe execution loop
- automated tests and reviews
- security and supply-chain proof
- release and rollback proof
- scorecard with blockers
- repair plan
- durable memory and audit trail

The system should be boringly reliable, strict about evidence, and useful every
day. It should not depend on a hosted application to be valuable.
