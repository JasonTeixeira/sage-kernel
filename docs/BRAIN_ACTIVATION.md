# Brain Activation (provider commands)

The autonomy and model-evaluation subsystems are **provider-gated**: they do
nothing until you point three environment variables at a command that talks to a
model. This repo ships reference adapters that use the local **Claude Code CLI**
(`claude`). Adapters live in `providers/` and are contract-tested in
`tests/providers.test.mjs` (with a stub `claude`, so CI needs no live model).

## Quick start

```bash
npm run brain:check    # report which providers + the claude CLI are available
npm run evals:real     # wire the adapters and run the eval suite for real
```

`evals:real` sets the three variables to the bundled adapters (only if unset)
and runs the eval suite. To wire them yourself:

```bash
export SAGE_AGENT_COMMAND="node providers/claude-agent.mjs"
export SAGE_VERIFIER_COMMAND="node providers/claude-verifier.mjs"
export SAGE_MODEL_RUBRIC_COMMAND="node providers/claude-rubric.mjs"
```

## Contracts (verified against source)

| Provider | Env var | Invocation | Success / output |
|----------|---------|-----------|------------------|
| Agent repair | `SAGE_AGENT_COMMAND` | `<cmd> <agentId> <diagnosisJSON>` (`packages/agents/executor.mjs`) | `applied = exit 0`; stdout = short summary |
| Adversarial verifier | `SAGE_VERIFIER_COMMAND` | `<cmd> <index> <claimJSON>` (`packages/agents/verify.mjs`) | confirm = exit 0 **and** stdout matches `/confirm\|verified\|true\|yes/i`; strict majority of 3 |
| Model grader | `SAGE_MODEL_RUBRIC_COMMAND` | stdin `{rubric, minimumScore}` (`eval-runner.mjs` `runModelRubricGrader`) | stdout JSON `{score:0-100, evidence}`; pass if `score >= minimumScore` |

The agent/verifier paths are spawned with `shell:true`, which can word-split a
JSON argument; the adapters rejoin `argv` and fall back to treating the payload
as a plain instruction/claim. The rubric path uses stdin and is robust.

## Honest note on pass@k

The scoreboard's `pass@1/pass@3/pass^3` come from **`task_attempt`** graders,
which run a real command k times and score it by exit code
(`summarizeMetrics` in `eval-runner.mjs`). The default eval
(`packages/intelligence/evals/100-eval-reliability.json`) runs
`npm run workflows:validate` 3×, so it measures **deterministic command
reliability** — genuinely executed, but always 1.0 because the command is
deterministic. It is real, not fabricated, but it is **not** model-stochastic.

To get genuine *model* pass@k (a value that can be < 1.0 and reflects model
capability), add an eval definition whose `task_attempt.command` invokes a
model-backed task through `SAGE_AGENT_COMMAND` and verifies the result. Keep such
definitions out of the default suite (they require the env var and a live model);
run them via `npm run evals:real`.

## Cost / safety

Live runs spawn real `claude -p` subprocesses (tokens + minutes). The agent
adapter runs with `--permission-mode acceptEdits` so it can modify files — only
point `SAGE_AGENT_COMMAND` at it inside a repo you intend the agent to edit.
