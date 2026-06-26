# The Sage Kernel Engineering Loop (how to 100x a session)

The kernel is installed as a **user-scope MCP server** — available in every Claude
Code session, operating on whatever project your terminal is in
(`root = process.cwd()`). 124 tools, brain adapters wired.

## Verify it's live
```bash
claude mcp get sage-kernel      # Scope: User · Status: ✔ Connected
npm --prefix /Users/Sage/sage-kernel run mcp:smoke   # boots + lists 124 tools
```
In any session, ask Claude: *"use the sage-kernel MCP tools."* Then call e.g.
`kernel.profile.detect`, `kernel.review.quality_score`, `kernel.security.sast`,
`kernel.cockpit.status`.

## The loop (run in ANY project)
The repeatable cycle — detect profile → run the right gates → score → report:
```bash
sage loop run . --risk=high --json        # full engineering cycle
sage review senior . --json               # diff + architecture + tests + security
sage security proof . --json              # threat model + SBOM + SAST + audit
sage score report . --json                # weighted scorecard + caps + blockers
node /Users/Sage/sage-kernel/scripts/cockpit.mjs   # live terminal cockpit
```
Or via MCP from inside a session: `kernel.loop.full_cycle`, `kernel.review.quality_score`,
`kernel.security.sast`, `kernel.cockpit.status`.

## Autonomy (the 100x): self-healing repair
With `SAGE_AGENT_COMMAND` set (it is, to the Claude CLI adapter), the kernel can
diagnose a failing gate, dispatch the routed agent to fix it, adversarially
verify, and re-run the gate — proven live (a real agent fixed a bug, test went
green). Mutating actions are approval-gated by the policy engine, so nothing
edits without a gate failing + approval.

## How to ACTUALLY earn 90–99 (capability depth)
- **Gate-pass score is already 100.** The depth lens is ~84.
- **Live activation (done):** brain adapters wired → autonomy/grading run for real.
- **Embeddings (your key):** set `SAGE_EMBEDDING_API_URL` + `SAGE_EMBEDDING_API_KEY`
  to make semantic memory live (adapter: `providers/embed-api.mjs`).
- **Phase 13 depth → 90+:** Semgrep-class SAST rules + at-scale fuzzing (security),
  benchmark budgets as a tracked gate (performance), model-backed `task_attempt`
  evals for genuine pass@k, ratchet the coverage floor up.

## Daily habit
1. `cd` into a project.
2. `sage loop run . --risk=high` (or ask Claude to run `kernel.loop.full_cycle`).
3. Fix what it flags (or let autonomy attempt it).
4. `sage score report .` until green; `cockpit` for the live view.
