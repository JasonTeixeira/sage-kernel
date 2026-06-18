# Quality Ratchet

Sage Kernel uses two layers of coverage enforcement.

## Repo-Wide Gate

`npm run test:coverage` enforces the hard repository floor:

- Lines: 98%+
- Branches: 90%+
- Functions: 97%+

This gate must pass before merging or releasing.

## Critical-File Branch Gate

`npm run coverage:critical -- /tmp/sage-coverage-output.txt` parses the Node test coverage
table and enforces per-file branch floors for critical runtime modules.

Current ratchet floors prevent regression on:

- `packages/db/adapter.mjs`
- `packages/db/migrations.mjs`
- `packages/db/persistence.mjs`
- `apps/dashboard/dashboard-workflows.mjs`
- `apps/dashboard/server.mjs`
- `apps/mcp-server/src/kernel-tool-helpers.mjs`
- `packages/intelligence/runbooks.mjs`
- `packages/intelligence/scripts/eval-runner.mjs`
- `scripts/soak-runner.mjs`
- `packages/agents/agent-pack.mjs`

The CI workflow pipes coverage output into this gate:

```bash
npm run test:coverage | tee /tmp/sage-coverage-output.txt
npm run coverage:critical -- /tmp/sage-coverage-output.txt
```

In CI, the coverage output is written to `$RUNNER_TEMP` so drift checks never see
generated proof artifacts in the repository root.

## World-Class Target

The long-term target is 98%+ meaningful branch coverage on every critical file.
Do not inflate coverage with meaningless tests. Preferred closure order:

1. Test real failure modes and boundary conditions.
2. Refactor oversized command wrappers into testable pure functions.
3. Add test-internals exports only for pure helper branches.
4. Ignore only environment-impossible branches, with a comment explaining why.

## Defensive Branch Policy

Some branches exist only for unavailable host capabilities, broken operating
systems, or external credentials. Those branches should be handled explicitly:

- If the branch can be reached with dependency injection, test it.
- If the branch requires external credentials, test the validator and document
  the manual proof path.
- If the branch depends on this Node runtime missing a built-in module that is
  present in CI, use `node:coverage ignore` only on that precise branch.
