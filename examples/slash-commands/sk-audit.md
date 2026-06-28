---
description: sage-kernel full SDLC audit of a repo (profile, gaps, score, review, security)
argument-hint: "[absolute path — defaults to current repo]"
---

Run a complete **read-only** SDLC audit with the **sage-kernel** MCP server.

Target: `$ARGUMENTS` — if empty, the current repo (pass its absolute path as `projectPath`).

Call these sage-kernel tools, then synthesize:
1. `kernel.profile.gaps` — profile, confidence, real gaps.
2. `kernel.done.generate` (risk: high) — required checks + this language's toolchain.
3. `kernel.loop.score` (risk: high) — 0–100 health score.
4. `kernel.review.quality_score` — architecture/clean-code/test/security/release.
5. `kernel.security.proof` — SAST + taint + supply-chain.

Report: **headline** (profile · loop · review · security), then the **top 5 highest-leverage fixes** ranked with file/area + why.

Do not modify files. If the repo isn't JS/TS/Node, say deep review/SAST is meta-only and lean on profile + dependency/secret findings. If the path is outside the allowed roots, tell me the value to add to `SAGE_PROFILE_ALLOWED_ROOTS`.
