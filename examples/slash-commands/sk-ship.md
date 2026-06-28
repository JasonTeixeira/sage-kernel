---
description: Review → verify → prove → open PR for the current changes (multi-server)
argument-hint: "[optional PR title]"
---

Ship the current working changes **with evidence**. Stop and report if any step blocks.

1. **Diff** — show a short summary of `git diff` (what's changing).
2. **Review** — run **sage-kernel** `kernel.review.quality_score` + `kernel.security.proof` on the changed files. **BLOCK on any high/critical finding**: list them and stop for my fix.
3. **Verify** — if this is a web/app change, drive the key flow with the **Playwright** MCP; if there are tests, run them. Confirm green.
4. **Prove** — run **sage-kernel** `kernel.enforce.proof_gate` on the current diff. If not allowed (no fresh passing proof), run `kernel.operate.run` to close the gates, then re-check. **Do not proceed until the proof gate returns allowed.**
5. **PR** — open a GitHub PR via the **github** MCP (title: `$ARGUMENTS` or infer one) whose body includes the sage-kernel loop/review scores and the proof id as evidence. Report the PR URL.

Never claim done without the proof gate passing — no fake green.
