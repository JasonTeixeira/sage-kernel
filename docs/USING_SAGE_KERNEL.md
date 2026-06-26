# Using sage-kernel — your local senior-engineer operating system

A proof-first, MCP-native SDLC OS that runs **locally with your AI models**. It does
not write your whole app — it makes "done" mean *proven*: detect the project,
run the right gates, fix failures autonomously (with the model in tandem),
re-verify, and record tamper-evident evidence — or honestly say `blocked_*`.

Doctrine: **nothing stated, everything proven. No fake-green.**

---

## 1. Does it work with agents? YES — it IS agent-native

- **It's an MCP server.** Any MCP client/agent (Claude Code, Claude Desktop, etc.)
  calls its tools over stdio. Wire it user-scope (`npm run mcp:config`) so it's
  available in every session, operating on the current project (`cwd`) or an
  explicit `targetRoot`.
- **The self-healing loop is agent-driven.** The repairer shells your model via
  `SAGE_AGENT_COMMAND` (the local `claude` CLI). Proven live: the production loop
  fixed **5/5 distinct non-templated bugs** end-to-end (see
  `.sage-kernel/evidence/live-repair-corpus.json`).
- **Adversarial verification + routing.** Fixes pass an N-verifier panel
  (`SAGE_VERIFIER_COMMAND`); tasks route to the right agent role. Without a model
  configured, those features honestly return `blocked_not_implemented` — never a
  fake pass.
- **No model required for the deterministic spine** (gates, proof, coverage,
  security, chaos). The model adds the *fixing/generation* intelligence.

---

## 2. The daily loop (three moves)

In any project's session, ask the agent to:

1. **Orient** — `kernel.profile.gaps` → the project type + the exact missing
   checks that define "production-grade" here. That list is your definition of done.
2. **Run the loop** — `kernel.operate.run { goal, acceptanceCriteria, files }` (or
   `kernel.loops.run`). It: builds a contract → runs gates **concurrently** →
   diagnoses failures from real stdout/stderr → **repairs via the model** →
   re-verifies → records a proof per gate. Durable-resume skips already-passed gates.
3. **Score** — `kernel.loop.score` → an honest 0–100 backed by the proof ledger.

CLI equivalent (add `alias sage='node /Users/Sage/sage-kernel/bin/sage.mjs'`):
`sage profile detect .` · `sage loop run . --risk=high` · `sage review score .`

---

## 3. Senior-role playbooks

### As a Sr SDET
- `kernel.testing.impact { files }` — only the tests that exercise your change.
- The operate loop enforces **execution-grounded coverage**: a changed file that
  is imported but **not executed** fails the gate (`--test-coverage-include` +
  function/line floors). "Tested" means *run*, not reachable.
- `npm run test:mutation -- --changed` — real token + AST-semantic mutation,
  auto-scoped to changed source; surviving mutants block.
- `kernel.chaos.matrix` — fault-injection (lease contention, ledger truncation,
  DAG fail-closed, durable resume) incl. a real forked-N-process race.
- `kernel.runtime.gate` — Lighthouse + console + smoke evaluation (runs live when
  the target has Playwright; honest `blocked_not_available` otherwise).

### As a Sr AI engineer
- `kernel.intake.contract { idea }` — one line → PRD → design → an executable
  task contract + a generation spec.
- **Model-lane codegen** (`packages/generation/model-gen.mjs`): the model writes a
  working implementation from a spec, gated by **prove-or-discard** (rejected on
  any high SAST finding or a failing acceptance test — never fake-green).
- The autonomous repair loop = your model fixing real bugs under bounded retries +
  adversarial verification, every attempt recorded as a proof.
- `kernel.evals.*`, `kernel.learning.outcomes` — model-graded evals + per-repo
  loop selection that learns from outcomes.

### As a Sr engineer (build + ship)
- `kernel.review.score` / `kernel.security.sast` / `kernel.security.polyglot`
  (Python/Swift) / `kernel.security.dataflow` (cross-file taint) — AST + measured
  (51→77-sample labeled corpus, precision/recall ≥ 0.95/0.92).
- `kernel.deploy.verify_rollback` — deploy → verify → roll back on failure
  (local provider proven; cloud adapters credential-gated).
- `kernel.sdlc.e2e` — the whole arc (idea → intake → generate → gates → runtime →
  deploy → score) on a fixture; a defect at generation **stops before deploy**.
- Plugins: drop a `.sage-kernel/plugins/*.mjs` engine or language plugin and it
  runs in the loop with zero core edits.

---

## 4. Per-project setup (once)

Drop a short `CLAUDE.md` / `AGENTS.md` in each repo so every session adopts the bar:

```md
## Engineering posture
Use the sage-kernel MCP for all work.
- Start: kernel.profile.gaps — its missing-checks list is the definition of done.
- Every change: run kernel.operate.run; a red gate is not "done" — fix it or mark blocked_*.
- Doctrine: nothing stated, everything proven. No fake-green, no debt, no abandoned tasks.
```

Brain wiring (already set user-scope): `SAGE_AGENT_COMMAND`,
`SAGE_VERIFIER_COMMAND` → the local `claude` CLI. Model-lane codegen shells
`claude` directly. Optional: `SAGE_LEDGER_KEY` to cryptographically seal the
proof ledger (fail-closed verification).

---

## 5. What's proven (and the honest limits)

**Proven, reproduced:** live-model autonomy (5/5 diverse bugs), atomic lease under
a 16-process race, ledger truncation/forgery detection, execution-grounded
coverage, measured security (77-sample corpus, 0 FP/FN), real concurrent DAG +
durable resume, load-bearing engine + language plugins.

**Honest limits (by design / scope):**
- Fix/generation quality is **model-bound** — the kernel guarantees the harness,
  verification, and proof; the model supplies the reasoning.
- The security corpus is **curated (77 samples), not the full OWASP/Juliet
  benchmark** — strong, but keep expanding it; the gate floor ratchets up.
- Runtime needs the target repo to have Playwright to run live; cloud deploy needs
  creds — both out of scope for a local-only setup.

Verify any claim yourself: `npm run release:check` (all gates), `npm test`,
`node tests/harness/live-repair-corpus.mjs` (live autonomy proof).
