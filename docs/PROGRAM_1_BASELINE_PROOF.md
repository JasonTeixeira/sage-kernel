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

Status: partially proven, blocked on first-publish credentials/provenance
execution.

Already proven:

- `npm run public:validate`.
- `npm run release:provenance`.
- `npm pack --dry-run` through `npm run release:check`.
- Fresh install from a worktree copy.

Current npm proof:

- `npm login --auth-type=web`: completed on 2026-06-18.
- `npm whoami`: `nexural`.
- `npm profile get name email email_verified`: `nexural`, `sage@sageideas.org`,
  verified.
- `npm view sage-kernel version dist-tags --json`: still returns `E404 Not
  Found`, which means the package is not currently published in the npm
  registry.
- `npm publish --access public --dry-run`: passed for `sage-kernel@0.3.0`.
- `npm publish --access public`: intentionally did not publish because
  `publishConfig.provenance=true` made npm attempt automatic provenance and
  local provenance failed with `Automatic provenance generation not supported
  for provider: null`.

Conclusion:

- Local npm authentication is now proven.
- The package remains unpublished.
- A premium first publish must run from GitHub Actions with OIDC provenance and
  either `NPM_TOKEN` configured as a GitHub secret or another npm-supported
  first-publish path.
- A local one-time publish without provenance is possible only if the project
  explicitly accepts a lower first-release supply-chain bar.

## Phase 1.4 First Public Release Proof

Status: partially complete; npm publishing remains blocked on first-publish
token/trusted-publisher setup and release signing configuration.

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

- Configure `NPM_TOKEN` for first GitHub Actions provenance publish, or choose
  a documented non-provenance bootstrap exception.
- After the package exists, configure npm trusted publishing for
  `JasonTeixeira/sage-kernel` and `.github/workflows/release.yml`.
- Configure signing policy for release tags.
- Create release tag.
- Publish package with provenance.
- Install from public npm in a clean temp project.

## What Is Left After Program 1.1

1. Configure first-publish npm credentials in GitHub Actions.
2. Configure release signing policy.
3. Complete Phase 1.4 only after npm publish credentials and release-tag
   signing policy are available.
4. Record public npm install proof after the first package publish.
