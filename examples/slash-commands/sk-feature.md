---
description: Build a feature correctly — current docs + implement + sage-kernel review
argument-hint: "<what to build>"
---

Build: **$ARGUMENTS**

Chain (use the right MCP server at each step):
1. **Docs** — if this touches a library/framework/SDK, pull its CURRENT docs via the **context7** MCP first; don't rely on memory.
2. **Implement** — the smallest correct change, following the repo's existing conventions and structure.
3. **Tests** — add or update tests for the new behavior.
4. **Review** — run **sage-kernel** `kernel.review.quality_score` and `kernel.security.proof` scoped to the diff; fix anything high/critical before continuing.
5. **Report** — summarize what changed + the scores, then tell me to run `/sk-ship` to verify, prove, and open a PR.

Stay within the stated objective. If it's a non-Node repo, note that sage-kernel review/SAST is meta-only there.
