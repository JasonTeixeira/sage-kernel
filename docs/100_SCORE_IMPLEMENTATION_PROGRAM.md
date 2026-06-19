# Sage Kernel 100/100 Implementation Program

Generated: 2026-06-19

## Target

Make Sage Kernel a 99+ local and public engineering operating system for
software development lifecycle work across project types, agents, harnesses,
architecture, release, and operations.

The score only counts when the system is empirically proven. No category can be
scored at 99+ from documentation alone.

## Scoring Rule

The system is 100/100 only when all of these are true:

1. Public install works from npm.
2. Claude Desktop, Cursor, and Codex all perform real tool calls.
3. 20 curated real repos pass the benchmark matrix or produce explained,
   accepted gaps.
4. Agent evals produce pass@1, pass@3, and pass^3 metrics.
5. Crawler/retrieval layer can cite trusted local/project evidence.
6. Multi-agent orchestration has a durable trace, role contracts, budgets, and
   review gates.
7. Architecture intelligence produces ADRs, dependency graphs, data-flow maps,
   and change-impact analysis.
8. Red-team fixtures cover hostile repos, prompt injection, unsafe tools,
   poisoned memory, huge logs, flaky tests, broken scripts, and fake secrets.
9. Release, soak, stress, security, audit, package, and global-install gates
   pass.
10. The dashboard/CLI/MCP experience gives a daily next-action loop.

## Program 1: Public Release And Client Proof

Goal: make Sage Kernel installable and callable by real users.

### Phase 1.1: Trusted Publishing

Deliverables:

- npm trusted publishing configured for `JasonTeixeira/sage-kernel`.
- GitHub Release workflow publishes with provenance.
- release evidence records npm package URL and provenance status.

Tests:

```bash
npm run release:provenance
npm run release:check
```

Manual E2E:

```bash
npm view sage-kernel version
npm install -g sage-kernel
sage doctor --fast --json
sage mcp smoke
```

Exit criteria:

- npm package exists publicly.
- global install works from registry, not just tarball.

### Phase 1.2: Real Client UI Proof

Deliverables:

- Claude Desktop screenshot/log showing `kernel.phase.status`.
- Cursor screenshot/log showing `kernel.phase.status`.
- Codex proof retained.

Tests:

```bash
npm run mcp:clients:prove
```

Manual E2E:

- Launch Claude Desktop and call `kernel.phase.status`.
- Launch Cursor and call `kernel.phase.status`.
- Save UI/log evidence under release notes.

Exit criteria:

- No client proof is SDK-only.

## Program 2: Evals Everywhere

Goal: every major capability has a deterministic or model-graded eval.

### Phase 2.1: 100-Score Eval Suite

Deliverables:

- `npm run eval:100`
- Eval definitions for release, red-team, benchmark, MCP clients, and program
  completeness.

Tests:

```bash
npm run eval:validate
npm run eval:100
```

Exit criteria:

- 100-score eval suite passes without manual intervention.

### Phase 2.2: Agent Task Evals

Deliverables:

- Golden tasks for each SDLC profile.
- pass@1, pass@3, pass^3 measurement.
- Agent trace capture for each attempt.
- Failure taxonomy: hallucination, wrong tool, missing test, unsafe command,
  weak architecture, bad release advice.

Tests:

```bash
npm run eval:agents -- --suite=sdlc --attempts=3
```

Exit criteria:

- pass@3 >= 0.90 for capability tasks.
- pass^3 = 1.00 for release-critical regression tasks.

### Phase 2.3: Model-Graded Architecture Evals

Deliverables:

- Architecture review rubric.
- Model-graded outputs with deterministic schema.
- Human-review flag for high-risk disagreements.

Tests:

```bash
npm run eval:architecture
```

Exit criteria:

- Architectural recommendations include evidence, tradeoffs, risks, and tests.

## Program 3: Full SDLC Profile Coverage

Goal: select the best lifecycle for any meaningful software project.

### Phase 3.1: Add Missing Profiles

Deliverables:

- embedded/IoT firmware
- game development
- desktop apps
- data science notebook
- ML training pipeline
- ML inference service
- MLOps platform
- security tooling
- compiler/language tooling
- smart contracts
- real-time/low-latency systems
- robotics/autonomy
- enterprise integration/iPaaS
- CRM/ERP/internal business system
- documentation/content repo
- design system/component library
- distributed multi-service system
- regulated government/public-sector system
- education/courseware platform
- plugin ecosystem

Tests:

```bash
npm run profiles:validate
npm run profiles:prove
```

Exit criteria:

- Every profile has a fixture.
- Every profile has done criteria, commands, evidence, and risks.

### Phase 3.2: Lifecycle Method Selection

Deliverables:

- waterfall/phase-gate mode
- agile/scrum mode
- kanban/continuous-flow mode
- Shape Up mode
- V-model/safety-critical mode
- MLOps lifecycle
- data governance lifecycle
- incident-driven lifecycle
- migration lifecycle
- platform engineering lifecycle

Tests:

```bash
npm run lifecycle:prove
```

Exit criteria:

- Kernel recommends lifecycle method with reasons and tradeoffs.

## Program 4: Crawling, Retrieval, And Project Intelligence

Goal: recommendations cite trusted evidence and stay fresh.

### Phase 4.1: Local Repo Crawler

Deliverables:

- file crawler
- docs crawler
- test crawler
- package/dependency crawler
- git history crawler
- issue/PR/release-note crawler when configured

Tests:

```bash
npm run crawl:repo -- --project=.
npm run retrieval:prove
```

Exit criteria:

- Every recommendation can cite code/test/doc evidence.

### Phase 4.2: Hybrid Retrieval

Deliverables:

- lexical index
- vector index
- source trust ranking
- staleness detection
- citation formatter

Tests:

```bash
npm run retrieval:e2e
```

Exit criteria:

- Retrieval returns relevant, cited, bounded context.

## Program 5: Multi-Agent Orchestration

Goal: agents can collaborate without hidden failures.

### Phase 5.1: Agent Role Contracts

Deliverables:

- architect
- implementer
- reviewer
- security reviewer
- release engineer
- test engineer
- docs engineer
- red-team agent

Tests:

```bash
npm run agents:validate
npm run agents:eval
```

Exit criteria:

- Every role has permissions, inputs, outputs, stop conditions, and evidence.

### Phase 5.2: Orchestration Ledger

Deliverables:

- run ledger
- tool-call trace
- budget/cost/duration tracking
- retry policy
- approval policy
- consensus/review protocol

Tests:

```bash
npm run orchestration:e2e
```

Exit criteria:

- A full task can be planned, executed, reviewed, and audited with trace.

## Program 6: Architecture Intelligence

Goal: produce architecture decisions that are useful, defensible, and testable.

### Phase 6.1: Architecture Graph

Deliverables:

- module graph
- dependency graph
- route/API graph
- data-flow graph
- ownership/risk graph

Tests:

```bash
npm run architecture:graph
npm run architecture:prove
```

Exit criteria:

- Change-impact analysis identifies touched systems and tests.

### Phase 6.2: ADR And Fitness Functions

Deliverables:

- ADR generator
- ADR graph
- architecture fitness functions
- migration planner
- tradeoff simulator

Tests:

```bash
npm run architecture:adr
npm run architecture:fitness
```

Exit criteria:

- Architectural recommendations include ADR, alternatives, risks, and gates.

## Program 7: Infrastructure And Operations

Goal: prove deployability and operations, not just code quality.

### Phase 7.1: Real Sandbox Proof

Deliverables:

- Docker proof
- Vercel proof
- AWS proof
- Kubernetes/Helm proof
- Terraform plan/apply/destroy proof

Tests:

```bash
npm run infra:prove
```

Exit criteria:

- At least one sandbox deploy/rollback path is proven.

### Phase 7.2: Observability

Deliverables:

- OpenTelemetry trace hooks
- MCP/tool run metrics
- SLO/error budget model
- alert/runbook generator
- evidence timeline

Tests:

```bash
npm run observability:prove
```

Exit criteria:

- A failed loop produces traces, metrics, and a postmortem draft.

## Program 8: Daily UX And Design

Goal: make it the tool you actually use every day.

### Phase 8.1: Daily Cockpit

Deliverables:

- next-action view
- project portfolio view
- evidence timeline
- agent trace viewer
- score trends
- release readiness panel

Tests:

```bash
npm run dashboard:e2e
npm run dashboard:browser-check
```

Exit criteria:

- Dashboard answers "what should I do next?" for each project.

### Phase 8.2: One Command Daily Loop

Deliverables:

- `sage daily-loop`
- plan -> act -> verify -> review -> score -> evidence
- bounded budgets
- no destructive action without approval

Tests:

```bash
npm run daily-loop:e2e
```

Exit criteria:

- A project can be advanced safely from one command.

## Program 9: Red-Team And Reliability

Goal: hostile behavior becomes a regression suite.

### Phase 9.1: Expand Hostile Fixtures

Deliverables:

- malicious repo fixture
- prompt injection fixture
- fake secret fixture
- huge log fixture
- broken package script fixture
- destructive tool-call fixture
- flaky test fixture
- poisoned memory fixture
- dependency confusion fixture
- symlink/path traversal fixture
- generated-code trap fixture

Tests:

```bash
npm run redteam:fixtures
```

Exit criteria:

- Every hostile fixture has expected defense and postmortem path.

## Program 10: Real-World Benchmark Matrix

Goal: stop proving only the repo itself.

### Phase 10.1: 20 Curated Repos

Deliverables:

- 20 local or cloned repos across profiles.
- Saved benchmark evidence.
- Accepted gaps with reasons.

Tests:

```bash
npm run benchmark:matrix -- --save --compare --fail-on-regression <repo...>
```

Exit criteria:

- Matrix includes web, API, CLI, worker, data, AI, agent, infra, mobile, and
  regulated-style examples.

### Phase 10.2: Regression CI

Deliverables:

- baseline evidence
- score regression gate
- profile-change gate
- warning trend gate

Tests:

```bash
npm run benchmark:matrix -- --compare --fail-on-regression
```

Exit criteria:

- CI fails when quality regresses.

## Current 100-Score Eval Command

```bash
npm run eval:100
```

This currently proves the 100-score program exists and that release, red-team,
benchmark, and MCP client proof gates pass locally. It does not yet prove the
future crawler, MLOps, architecture graph, real cloud, or 20-repo requirements.

## Definition Of 99+

99+ requires:

- all current local gates pass;
- public npm install works;
- real MCP clients call tools;
- 20-repo benchmark matrix passes;
- pass@k agent evals pass;
- crawler/retrieval cites evidence;
- orchestration ledger captures full agent work;
- architecture graph and ADR graph exist;
- infra sandbox proof passes;
- daily cockpit is usable.

Until then, the system can be excellent locally, but it is not honestly 99+.
