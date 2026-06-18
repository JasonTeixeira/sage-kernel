# Program 1 Baseline Proof And Release Stability

Last updated: 2026-06-18

## Phase 1.1 Baseline Audit Snapshot

Status: passed locally.

Evidence:

- `npm run test:coverage | tee /tmp/sage-program1-coverage-output.txt`: passed.
- `npm run coverage:critical -- /tmp/sage-program1-coverage-output.txt`: passed.
- `npm run release:check`: passed.
- `npm run verify:fresh-install -- --worktree-copy`: passed.
- `npm run security:scan`: passed.
- `npm audit`: passed with `0 vulnerabilities`.
- `git diff --check`: passed.

Coverage:

- Tests: 192.
- Passed: 191.
- Skipped: 1 local Postgres integration skip.
- Failed: 0.
- Line coverage: 99.42%.
- Branch coverage: 93.82%.
- Function coverage: 98.26%.

Critical branch ratchet:

- Status: passed.
- Long-term target remains 98%+ branch coverage per critical file.
- Lowest current critical ratchet surfaces:
  - `packages/db/migrations.mjs`: 86.79%.
  - `packages/agents/agent-pack.mjs`: 88.73%.
  - `packages/db/adapter.mjs`: 89.84%.
  - `packages/intelligence/runbooks.mjs`: 90.00%.
  - `packages/intelligence/scripts/eval-runner.mjs`: 90.43%.

Known local proof gap:

- The local Postgres integration test is intentionally skipped unless a real
  Postgres server is configured. CI is expected to prove this path with its
  Postgres service.

## Phase 1.2 CI Proof Lock

Status: passed.

Evidence:

- Commit: `ce3bfc7a7c2360d22cffba6fa7246d3b75105e85`.
- GitHub Actions run: https://github.com/JasonTeixeira/sage-kernel/actions/runs/27733143308
- Quality Gates / Node 22: passed.
- Fresh Install Verification: passed.
- Postgres Integration: passed.

## Phase 1.3 Public Release Readiness

Status: partially proven, blocked on npm authentication for publish proof.

Already proven:

- `npm run public:validate`.
- `npm run release:provenance`.
- `npm pack --dry-run` through `npm run release:check`.
- Fresh install from a worktree copy.

Pending external proof:

- `npm whoami` failed with `E401 Unauthorized` on 2026-06-18.
- `npm view sage-kernel version dist-tags --json` returned `E404 Not Found` on
  2026-06-18, which means the package is not currently published in the npm
  registry.
- Rechecked on 2026-06-18 after Program 3:
  - `npm whoami`: still blocked with `E401 Unauthorized`.
  - `npm view sage-kernel version`: still returns `E404 Not Found`.
- Package ownership/availability must be confirmed during authenticated publish
  setup.

## Phase 1.4 First Public Release Proof

Status: partially complete; npm publishing remains blocked on external
authentication/signing configuration.

Completed evidence:

- Codex MCP client config includes `sage-kernel` in `~/.codex/config.toml`.
- `codex mcp list` shows `sage-kernel` as enabled.
- `node bin/sage.mjs mcp smoke`: passed with 55 tools.
- `node bin/sage.mjs doctor --fast --json`: passed with 0 failed checks.
- Real Codex MCP tool call through `mcp__sage_kernel.kernel_workflow_audit_repo`
  completed successfully on 2026-06-18.
- MCP audit proof:
  - Workflow: `audit_repo`.
  - Status: passed.
  - Project path: `/Users/Sage/sage-kernel`.
  - QA mode: `fast`.
  - `npm:test`: passed.
  - Test result inside MCP path: 192 tests, 191 passed, 1 skipped, 0 failed.
  - Dashboard status: operational.
  - Tools: 55.

Environment hardening added during proof:

- `tests/stress-qa.test.mjs` now isolates `AI_WAREHOUSE_ROOT` while testing the
  missing warehouse configuration branch.
- `tests/mcp-tool-matrix.test.mjs` now isolates `AI_WAREHOUSE_ROOT` while
  testing missing and temporary warehouse configuration branches.
- This prevents real MCP client environments from invalidating tests that need
  to prove missing-configuration behavior.

Required before completion:

- Configure npm trusted publishing or `NPM_TOKEN`.
- Configure signing policy for release tags.
- Create release tag.
- Publish package with provenance.
- Install from public npm in a clean temp project.

## What Is Left After Program 1.1

1. Configure npm authentication or trusted publishing.
2. Configure release signing policy.
3. Complete Phase 1.4 only after npm publish credentials and release-tag
   signing policy are available.
4. Record public npm install proof after the first package publish.
