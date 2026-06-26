# ADR 0004 — Provider-gated "brain" via Claude CLI adapters

- Status: accepted
- Date: 2026-06-20

## Context

Autonomy (agent repair), adversarial verification, and model-graded evals are
only meaningful with a real model. Hardcoding a provider would couple the kernel
to one vendor and incur cost on every run.

## Decision

Keep these subsystems **provider-gated** behind env vars
(`SAGE_AGENT_COMMAND`, `SAGE_VERIFIER_COMMAND`, `SAGE_MODEL_RUBRIC_COMMAND`).
Ship reference adapters in `providers/` that use the local Claude Code CLI, plus
`brain:check` / `evals:real`. Adapters are contract-tested with a stub `claude`
(no live model in CI); live runs are explicit. The rubric adapter uses the
stdin `{rubric,minimumScore}` → stdout `{score,evidence}` contract that feeds the
score cap.

## Consequences

- Unset = `blocked_not_implemented` (honest), never fabricated results.
- pass@k from `task_attempt` graders measures deterministic command reliability;
  model-stochastic pass@k requires a model-backed `task_attempt` (see BRAIN_ACTIVATION.md).
- Live autonomy edits files (`--permission-mode acceptEdits`); scope it to repos you intend to edit.
