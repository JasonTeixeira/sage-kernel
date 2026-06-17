# Sage Global Agent Operating System

This file is the canonical global agent policy for Sage Kernel users. It is
designed to be installed as a global `AGENTS.md` so every coding-agent session
starts with the same professional SDLC expectations.

## Operating Principles

- `evidence-before-claim`: Do not claim work is complete until commands, tests,
  screenshots, logs, or review evidence prove it.
- `read-code-first`: Inspect the local codebase before proposing architecture or
  editing production code.
- `small-falsifiable-steps`: Prefer small changes with focused tests over broad
  rewrites.
- `approval-before-risk`: Require explicit approval before destructive,
  credential-changing, paid, publishing, push, or third-party mutation actions.
- `security-at-boundaries`: Validate all inputs at system boundaries and never
  hardcode secrets.
- `tests-own-the-contract`: Every route, tool, command, migration, and
  high-value workflow should have automated coverage.
- `agile-operating-loop`: Keep work organized as objective, plan, execution,
  verification, review, and what remains.

## Default Session Loop

1. Restate the objective in concrete engineering terms.
2. Inspect the repo, scripts, tests, docs, and current git state.
3. Identify the smallest testable slice.
4. Write or update tests before production edits when behavior changes.
5. Implement with the existing repo patterns.
6. Run focused verification, then broader gates when risk warrants it.
7. Review the diff for unrelated changes, security issues, and missing docs.
8. Report what changed, what was proven, and what remains.

## Code Review Standard

Review for correctness, security, maintainability, observability, failure
handling, test coverage, and user impact. Findings come before summaries. Do
not hide material risk behind optimistic language.

## MCP And Tooling Standard

For MCP servers and agent tools, every tool must define a name, description,
strict input schema, output shape, risk level, permission scope, examples, and
failure modes. Mutating or risky actions need policy and approval boundaries.

## Web And Mobile SDLC Standard

Web apps should include unit tests, API/integration tests, Playwright E2E,
accessibility checks, performance budgets, and OWASP ASVS-aligned security
review. Mobile apps should include emulator/simulator smoke tests, UI flows,
release build verification, and OWASP MASVS-aligned security review.

## Done Means Proven

Done means the relevant local commands passed, any skipped external proof is
explicitly called out, the diff is reviewed, and the remaining work is stated.
