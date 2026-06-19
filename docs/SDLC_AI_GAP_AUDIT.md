# SDLC, AI, Orchestration, And Architecture Gap Audit

Generated: 2026-06-19

## Evidence Used

Commands run:

```bash
npm run audit:full
npm run benchmark:matrix -- --compare --fail-on-regression
```

Current measured posture:

- Final audit: passed, score 98.
- Benchmark matrix: passed, repo score 97.
- Primary profile: `mcp-server`.
- Profile confidence: 100.
- Benchmark regression comparison: passed.
- Remaining warnings: review proof is `needs_work`; release proof is
  `needs_work`; external comparison still needs external evidence.

## Executive Verdict

Sage Kernel is strong as a local MCP-native SDLC control plane. It is not yet
the ultimate engineering and architecture tool because its intelligence layer is
still mostly deterministic and rule-based, not deeply empirical or learning from
real project outcomes.

The strongest areas are MCP surface, local verification, package/install proof,
profile-driven workflows, red-team fixtures, and release gates.

The weakest areas are ML-grade evals, crawling/retrieval, multi-agent execution,
cross-repo learning, architectural reasoning depth, cloud/runtime operations,
and external proof.

## Category Scores

| Category | Score | Posture |
|---|---:|---|
| Core SDLC loop | 88 | Strong local loop, not yet adaptive enough |
| SDLC profile coverage | 82 | Broad, but still heuristic and incomplete for niche domains |
| Profile selection/orchestration | 78 | Explains decisions now; still rule-based |
| Evidence and proof management | 78 | Good local artifacts; weak longitudinal analytics |
| MCP tool surface | 90 | Broad and validated |
| Agent orchestration | 63 | Roles exist; lacks robust multi-agent scheduling/evals |
| AI/ML evaluation | 52 | Basic evals exist; missing pass@k, model graders, task suites |
| Retrieval/crawling/intelligence | 45 | Major gap; no serious crawler/index/retrieval pipeline |
| Code intelligence | 62 | Local semantic search exists; not deep graph/RAG quality yet |
| Architecture intelligence | 68 | Audits exist; lacks ADR graph and tradeoff simulator |
| Red-team and hostile testing | 76 | Executable fixtures exist; needs deeper adversarial suites |
| Security and policy | 82 | Solid local boundaries; needs broader supply-chain/SBOM/dependency policy |
| Infrastructure and deployment | 64 | Plans exist; weak real cloud/K8s/Terraform proof |
| Performance and stress | 84 | Dashboard/queue/release soak strong locally |
| Observability | 58 | Reports exist; lacks traces, metrics server, dashboards over time |
| Release and provenance | 74 | Local proof strong; public npm publish still blocked |
| UX/design for daily use | 66 | Useful CLI/MCP; dashboard still dense and not deeply workflow-guided |
| Documentation/runbooks | 80 | Good docs; needs task-based playbooks per profile |
| Maintainability | 70 | Improved split; large modules remain |
| Real-world proof | 48 | Biggest truth gap: needs 20 curated production repos and real clients |

Overall practical score: 74/100 for "ultimate engineering OS" ambition.
Local release-candidate score: 88/100.
Global/public production score: 62/100 until publish and external client proof.

## Missing SDLC Profiles And Lifecycle Methods

Current profiles are broad, but world-class coverage should add:

- embedded/IoT firmware
- game development
- desktop apps
- data science notebooks
- ML training pipeline
- ML inference service
- MLOps platform
- security tooling
- compiler/language tooling
- blockchain/smart-contract systems
- real-time/low-latency systems
- robotics/autonomy systems
- enterprise integration/iPaaS
- CRM/ERP/internal business systems
- documentation/content-only repos
- design-system/component-library
- multi-service distributed systems
- regulated government/public-sector systems
- education/courseware platforms
- plugin/extension ecosystems beyond browser extensions

Missing lifecycle methods:

- Scrum/kanban project modes
- shape-up style appetite/betting table
- RUP/phase-gate enterprise mode
- safety-critical V-model
- regulated GxP/medical validation mode
- MLOps lifecycle
- data governance lifecycle
- incident-driven lifecycle
- migration/modernization lifecycle
- platform engineering lifecycle

## Missing AI And ML Capabilities

Critical gaps:

- No pass@k or pass^k measurement for agent workflows.
- No model-based grader harness for architectural output quality.
- No task suite of realistic engineering problems.
- No golden trace replay of agent/tool behavior.
- No prompt/version regression ledger.
- No cost/latency/quality frontier tracking.
- No model/provider comparison matrix.
- No hallucination/factuality grader for repo analysis.
- No confidence calibration against real outcomes.
- No learning loop that improves profile rules from failed classifications.

What to build:

1. `npm run eval:agents -- --suite=sdlc`
2. Golden task fixtures for each profile.
3. pass@1, pass@3, pass^3 metrics.
4. Model-graded architecture review rubric.
5. Cost/latency tracking per tool/agent run.
6. Regression baselines saved under `.sage-kernel/evidence/evals`.

## Missing Crawling And Retrieval Capabilities

Critical gaps:

- No crawler for repo docs, issues, PRs, changelogs, and release notes.
- No dependency-doc retrieval from official docs.
- No local vector index or hybrid search over repo/history/evidence.
- No freshness model for stale docs.
- No source trust ranking.
- No citation-backed architecture recommendations.
- No cross-project pattern mining.

What to build:

1. Repo crawler for files, docs, issues, PRs, commits, release notes.
2. Hybrid lexical/vector retrieval.
3. Source trust tiers: local code > tests > docs > issues > web.
4. Evidence citations in every architecture recommendation.
5. Staleness detector for docs and generated plans.

## Missing Orchestration Capabilities

Critical gaps:

- Multi-agent roles exist, but orchestration is not yet a real scheduler.
- No robust planner/executor/reviewer loop with leases, retries, budgets.
- No agent trace viewer.
- No conflict resolution between agents.
- No task queue priority policy by risk.
- No automatic rollback/stop when score regresses.
- No budget-aware model routing.

What to build:

1. Agent run ledger with steps, tools, evidence, cost, duration.
2. Role contracts: architect, implementer, reviewer, security, release.
3. Consensus/review protocol for high-risk changes.
4. Budget and timeout caps per loop.
5. Automatic postmortem on failed loop.

## Missing Architecture Intelligence

Critical gaps:

- Architecture audits are useful but not deep enough for enterprise decisions.
- No ADR graph.
- No dependency graph with ownership and change risk.
- No threat model evolution over time.
- No "architecture fitness functions" enforced in CI.
- No tradeoff simulator for build-vs-buy, monolith-vs-services, sync-vs-async.

What to build:

1. ADR generator plus ADR graph.
2. Architecture map: modules, dependencies, ownership, data flows.
3. Fitness functions per profile.
4. Change-impact analysis.
5. Migration planner.

## Missing Infrastructure And Operations

Critical gaps:

- No real cloud sandbox proof.
- No Kubernetes/Helm validation path.
- No Terraform plan/apply/destroy test harness.
- No SLO/error-budget model.
- No runtime metrics/tracing integration.
- No backup/restore disaster drill beyond local DB utilities.

What to build:

1. `kernel.infra.proof` for Docker, Vercel, AWS, K8s, Terraform.
2. Ephemeral sandbox deploy proof.
3. Rollback drill fixture.
4. SLO and alert policy generator.
5. OpenTelemetry trace hooks for MCP/tool runs.

## Missing Design And Daily UX

Critical gaps:

- Dashboard is informative but not yet a true daily command cockpit.
- No guided "today's highest leverage action" flow.
- No project portfolio view.
- No visual architecture map.
- No task board or evidence timeline.
- No "one command daily loop" that runs plan -> act -> verify -> audit.

What to build:

1. Daily cockpit page.
2. Portfolio matrix across projects.
3. Evidence timeline.
4. Agent run trace viewer.
5. Architecture graph view.

## Highest Priority Fix Order

1. Public npm publish and real Claude/Cursor UI proof.
2. Eval harness with pass@k/pass^k for SDLC agent tasks.
3. Real benchmark matrix over 20 curated production repos.
4. Crawler/retrieval/indexing layer.
5. Multi-agent orchestration ledger and trace viewer.
6. Architecture graph and ADR graph.
7. Infra proof against real sandbox environments.
8. Dashboard daily cockpit.
9. Split large modules further.
10. Add missing specialized SDLC profiles.

## Bottom Line

Sage Kernel is becoming a serious local engineering operating system. The next
level is not more static profiles. The next level is empirical intelligence:
run it on many real projects, capture outcomes, compare agents, score regressions,
retrieve trusted evidence, and learn from failures.

Until that exists, it is strong automation plus strong local proof, not yet the
ultimate adaptive engineering intelligence layer.
