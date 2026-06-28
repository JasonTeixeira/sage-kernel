---
description: Point sage-kernel at any repo for a one-screen SDLC report
argument-hint: "<absolute path to a repo>"
---

Onboard the repo at `$ARGUMENTS` with the **sage-kernel** MCP server (read-only).

With `projectPath` = that absolute path, call `kernel.profile.gaps`, `kernel.loop.score`, `kernel.review.quality_score`, `kernel.security.proof`, `kernel.done.generate` (risk: high).

Print a **one-screen** report: profile + confidence · loop score · review score · security status · required checks · top gaps (max 6).

If the path is outside the allowed roots, tell me the exact value to add to `SAGE_PROFILE_ALLOWED_ROOTS`. Honest: deep analysis is JS/TS/Node-native; otherwise it's profile + meta. Modify nothing.
