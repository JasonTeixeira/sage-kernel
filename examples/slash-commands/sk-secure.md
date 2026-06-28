---
description: Deep security pass with sage-kernel (SAST, taint, supply-chain), ranked
argument-hint: "[absolute path — defaults to current repo]"
---

Run a focused security review with the **sage-kernel** MCP server on `$ARGUMENTS` (absolute path as `projectPath`; default = current repo).

1. `kernel.security.proof` — threat model + SAST + taint + supply-chain + secret scan.
2. `kernel.review.security_audit` — AST-level findings.

Report **only real issues**, ranked **critical → high → medium**, each with `file:line` and a concrete fix. Ignore framework build artifacts. If the repo isn't JS/TS, state SAST is meta-only and focus on dependency + secret findings. Read-only.
