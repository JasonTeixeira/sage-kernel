# Program 2: Intelligence Layer

Program 2 turns Sage Kernel from a strong MCP control plane into an intelligent
daily engineering system. The goal is not to add popular AI projects as heavy
dependencies by default. The goal is to wrap the best ideas behind strict MCP
tools, local-first persistence, measurable evals, and auditable approval
boundaries.

## Product Principle

Sage Kernel should remain MCP-first and dependency-light at the core.

External systems such as Serena, Graphiti, Karpathy-style training loops, or
agent frameworks should be optional adapters. They should improve the kernel
without making clean install, release packaging, or local daily use fragile.

## Source-Informed Component Map

### Serena-Style Semantic Code Intelligence

Source:

- https://github.com/oraios/serena

Relevant idea:

- Symbol-aware code retrieval, editing, refactoring, and debugging through MCP.
- IDE-like operations are more useful than raw grep for large codebases.

Sage Kernel adaptation:

- Add a `semantic_code` adapter boundary.
- Start with read-only symbol indexing and symbol search.
- Keep mutation tools approval-gated.
- Prefer integrating with Serena as a sibling MCP server before embedding it.

Candidate MCP tools:

- `semantic_code.index_project`
- `semantic_code.search_symbol`
- `semantic_code.find_references`
- `semantic_code.summarize_module`
- `semantic_code.plan_refactor`
- `semantic_code.apply_refactor` approval-required

Exit standard:

- The kernel can inspect a project semantically without needing an AI model to
  guess from raw text search.

### Graphiti-Style Temporal Memory

Source:

- https://github.com/getzep/graphiti

Relevant idea:

- Temporal context graphs that track facts, relationships, provenance, and
  validity over time.
- Better fit for changing project memory than flat summaries.

Sage Kernel adaptation:

- Add a memory abstraction with pluggable backends:
  - SQLite event memory first.
  - Graph adapter second.
  - Graphiti/Neo4j/FalkorDB optional integration third.
- Every memory write must include source, timestamp, actor, confidence, and
  revocation/supersession behavior.
- Agent-generated memory must not outrank user corrections or verified test
  results.

Candidate MCP tools:

- `memory.write_episode`
- `memory.search`
- `memory.get_project_state`
- `memory.supersede_fact`
- `memory.export`
- `memory.audit`

Exit standard:

- The kernel can answer "what changed, why, who approved it, and what is true
  now?" from durable memory instead of stale chat context.

### Karpathy-Style Feedback Loops

Sources:

- https://github.com/karpathy/autoresearch
- https://github.com/karpathy/nanoGPT
- https://github.com/karpathy/llm.c
- https://github.com/karpathy/minbpe

Relevant idea:

- Small, inspectable systems.
- Experiment loops with clear metrics.
- Training/evaluation runs that keep or discard changes based on measured
  improvement.
- Minimal code paths that are easy to understand and reproduce.

Sage Kernel adaptation:

- Do not embed model training into the core kernel.
- Build a generic `experiment_loop` engine for code, QA, prompts, templates,
  and agent behavior.
- Store each experiment as a run with:
  - hypothesis
  - patch or action
  - evaluation command
  - metric delta
  - decision: keep, reject, needs human review
  - rollback pointer

Candidate MCP tools:

- `experiments.create`
- `experiments.run_once`
- `experiments.compare`
- `experiments.accept`
- `experiments.reject`
- `experiments.report`

Exit standard:

- The kernel can run bounded improvement loops without silently modifying the
  project or pretending unverified changes improved quality.

### Eval Harness

Relevant idea:

- Evals are first-class tests for AI-assisted behavior.
- The system needs deterministic graders before model-based graders.

Sage Kernel adaptation:

- Add eval definitions as versioned project artifacts.
- Support code graders, command graders, schema graders, and optional model
  graders.
- Record pass/fail history in persistence.
- Treat eval regressions like test regressions.

Candidate scripts:

- `npm run eval:validate`
- `npm run eval:run`
- `npm run eval:report`

Candidate MCP tools:

- `evals.list`
- `evals.run`
- `evals.report`
- `evals.compare_baseline`

Exit standard:

- Agent workflows such as "audit repo", "run QA", "explain failure", and
  "prepare release" have repeatable evals with recorded outcomes.

### Agile, Runbooks, And Operating System Layer

Relevant idea:

- A daily engineering kernel should translate goals into plans, tickets, jobs,
  approvals, runbooks, tests, and release evidence.

Sage Kernel adaptation:

- Add lightweight agile artifacts without becoming a project-management clone.
- Keep artifacts local, plain, versionable, and MCP-readable.
- Generate work breakdowns from verified repo state, not from memory alone.

Candidate artifacts:

- `docs/runbooks/*.md`
- `docs/adr/*.md`
- `.sage/plans/*.json`
- `.sage/evals/*.json`
- `.sage/experiments/*.json`

Candidate MCP tools:

- `plans.create`
- `plans.status`
- `runbooks.list`
- `runbooks.execute_step`
- `adr.create`
- `release.readiness`

Exit standard:

- A developer can ask Sage Kernel "what should I do today?" and receive a plan
  grounded in repo state, failing gates, open approvals, recent runs, and
  current release goals.

## Recommended Dependency Policy

Add dependencies only through one of these paths:

1. Core dependency
   - Small, stable, required for every install.
   - Must pass fresh install and release packaging.

2. Optional adapter
   - Disabled by default.
   - Configured through `sage doctor`, docs, and MCP resources.
   - Missing dependency must degrade gracefully.

3. External sibling MCP server
   - Best for Serena, Graphiti, Playwright-like browsers, and specialist tools.
   - Sage Kernel should discover, verify, and orchestrate these servers instead
     of vendoring them.

4. Template dependency
   - Used only by generated projects.
   - Does not affect Sage Kernel runtime.

## Program Phases

### Phase 2.1: Intelligence Architecture And Contracts

Status: complete.

Tasks:

- Add formal contracts for:
  - memory records
  - eval definitions
  - experiment runs
  - runbook steps
  - semantic-code adapter capabilities
- Add validator scripts for those contracts.
- Add MCP resources for planned contracts before adding mutating tools.
- Add docs explaining optional adapter policy.

Implemented:

- Added `packages/intelligence`.
- Added JSON Schema contract files for:
  - memory records
  - eval definitions
  - experiment runs
  - runbooks
  - semantic-code adapters
- Added valid fixtures for every contract.
- Added `packages/intelligence/security-boundaries.json`.
- Added `npm run intelligence:validate`.
- Wired `intelligence:validate` into `npm run release:check`.
- Added read-only MCP resources:
  - `sage://intelligence/contracts`
  - `sage://intelligence/memory`
  - `sage://intelligence/evals`
  - `sage://intelligence/experiments`
  - `sage://intelligence/runbooks`
  - `sage://intelligence/semantic-adapters`
- Regenerated MCP resource contracts and docs.
- Added tests for valid fixtures, invalid fixture shapes, schema regressions,
  security boundaries, and MCP resource reads through the MCP transport.

Verification:

```bash
npm run intelligence:validate
npm test
npm run test:coverage
npm run mcp:validate
npm run mcp:contracts
```

Exit criteria:

- New intelligence artifacts validate locally and in CI.
- No optional framework is required for clean install.
- MCP clients can inspect intelligence contracts without invoking mutating
  tools.

### Phase 2.2: Eval Harness And Feedback Loops

Status: complete for the eval harness scope.

Tasks:

- Add `.sage/evals` or `evals/` definitions.
- Add deterministic graders:
  - command exit code
  - JSON schema
  - file existence
  - coverage threshold
  - MCP contract snapshot
- Add experiment run records.
- Add bounded feedback-loop runner inspired by Karpathy-style experiment
  loops, but policy-gated and rollback-aware.

Implemented:

- Added five real eval definitions:
  - `eval_release_readiness`
  - `eval_mcp_smoke`
  - `eval_dashboard_health`
  - `eval_qa_gate`
  - `eval_project_workflows`
- Added `npm run eval:validate`.
- Added `npm run eval:run`.
- Added `npm run eval:report`.
- Added deterministic graders:
  - command exit code
  - JSON parse/schema-file presence
  - file existence
  - coverage threshold metadata
  - MCP contract snapshot count
- Added latest-report persistence under `.sage-kernel/evals/latest.json`.
- Added read-only MCP resources for eval definitions and latest eval report.
- Added tests for:
  - successful eval execution
  - failed command graders
  - missing files
  - missing MCP contracts
  - workspace path escapes
  - missing latest reports
  - real repository workflow eval execution

Deferred:

- Bounded experiment loops remain Program 5 scope. Program 2 proves evals and
  verification; it does not yet mutate code or accept/reject experiments.

Verification:

```bash
npm run eval:validate
npm run eval:run
npm run eval:report
node --test tests/eval-runner.test.mjs
npm run qa:gate
```

Exit criteria:

- Sage Kernel can prove whether an agent workflow improved or regressed.
- Sage Kernel can run deterministic evals and persist a report that MCP
  clients can inspect.

### Phase 2.3: Durable Memory And Project State

Status: complete.

Tasks:

- Add memory event schema.
- Add SQLite-backed memory store.
- Add project-state summarizer sourced from:
  - git state
  - test results
  - CI status where available
  - approvals
  - jobs
  - run history
- Add Graphiti adapter spike behind an optional configuration flag.
- Add memory contamination protections:
  - user correction priority
  - source provenance
  - expiration/supersession
  - confidence scores

Implemented:

- Added `memory_records` to SQLite and Postgres schemas.
- Added migration `0006_memory_records`.
- Added durable memory store APIs for:
  - write
  - search
  - audit
  - normalization
  - validation against the memory-record contract
- Added project-state summarizer grounded in:
  - git branch, commit, cleanliness, changed files
  - latest eval report
  - durable memory audit
  - dashboard health
  - pending approvals
- Added CLI scripts:
  - `npm run memory:write`
  - `npm run memory:search`
  - `npm run memory:audit`
  - `npm run memory:state`
  - `npm run memory:smoke`
- Added read-only MCP resources:
  - `sage://intelligence/memory`
  - `sage://intelligence/project-state`
- Added deterministic eval `eval_memory_project_state`.
- Added tests for memory writes, invalid memory records, search filters,
  audit summaries, project-state summaries, migration idempotency, MCP
  resource exposure, and CLI smoke execution.

Deferred:

- Graphiti integration remains optional adapter work for a later pass.
- Memory supersession tools are not exposed as mutating MCP tools yet.

Verification:

```bash
npm run memory:validate
npm run memory:smoke
npm run memory:state
npm run eval:run
npm test
npm run security:scan
```

Exit criteria:

- Sage Kernel can produce a reliable project-state answer without relying on
  chat history.

### Phase 2.4: Semantic Code Intelligence

Status: planned.

Tasks:

- Add a semantic-code adapter interface.
- Add read-only local baseline using repo metadata and structured search.
- Add optional Serena MCP discovery and doctor checks.
- Add MCP tools for indexing, symbol search, module summary, and reference
  lookup.
- Keep edit/refactor tools approval-required.

Verification:

```bash
npm run semantic:validate
npm run semantic:smoke
npm run mcp:contracts
npm run dashboard:e2e
```

Exit criteria:

- Sage Kernel can use semantic code intelligence when available and falls back
  cleanly when unavailable.

### Phase 2.5: Agile Runbooks And Daily Operating Cockpit

Status: planned.

Tasks:

- Add runbook schema and validator.
- Add ADR template and generator.
- Add local plan format with phases, risks, gates, and evidence.
- Add dashboard views for:
  - today's plan
  - runbooks
  - eval results
  - experiment history
  - memory/project state
- Add MCP prompts:
  - plan my day
  - run project standup
  - execute release runbook
  - explain current risk

Verification:

```bash
npm run runbooks:validate
npm run dashboard:e2e
npm run mcp:smoke
npm run verify:fresh-install
```

Exit criteria:

- Sage Kernel is useful as a daily engineering operating cockpit, not only a
  collection of scripts.

## What To Avoid

- Do not vendor large AI repositories into the core package.
- Do not add autonomous code mutation before evals, approvals, and rollback are
  implemented.
- Do not make memory write-only; memory needs audit, deletion/supersession, and
  confidence rules.
- Do not let agent-generated summaries become trusted facts without provenance.
- Do not require Docker, Neo4j, GPUs, Python ML stacks, or external API keys for
  the default install path.

## Score Impact

This program targets the remaining gap between a strong release-ready MCP
kernel and a genuinely world-class engineering system:

- Better daily usefulness through plans, runbooks, and project state.
- Better agent reliability through evals and deterministic graders.
- Better long-term context through temporal memory and provenance.
- Better code understanding through semantic retrieval.
- Better improvement loops through measured experiments and rollback.
