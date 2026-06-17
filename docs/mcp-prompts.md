# Sage Kernel MCP Prompts

Generated from `apps/mcp-server/src/kernel-prompts.mjs`.

These prompts are workflow entry points for day-to-day kernel operations.

| Prompt | Arguments | Description |
| --- | --- | --- |
| `sage.audit-repo` | `scope` | Audit a repository for production readiness, security, tests, docs, and release risk. |
| `sage.run-full-qa` | `mode` | Run the full local QA and verification gate sequence. |
| `sage.create-project` | `template`, `name` | Plan a new production-ready project from a Sage template. |
| `sage.inspect-approvals` | `status` | Review pending approvals and explain which risky actions are waiting. |
| `sage.prepare-release` | `version` | Prepare a release checklist and verify release readiness. |
| `sage.stress-test-server` | `url` | Run local stress tests against queue and dashboard endpoints. |
| `sage.explain-failed-job` | `runId` | Explain a failed job run and propose a repair plan. |
