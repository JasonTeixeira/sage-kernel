# Program 1: Foundation Hardening

Program 1 makes the existing kernel boringly reliable before adding larger agent, sandbox, memory, eval, and observability systems.

## Phase 1.1: Repo Cleanup And Baseline Audit

Status: complete.

Objective:

- Verify the repo is clean and synced.
- Verify ignored local state is not tracked.
- Verify public package metadata and package contents.
- Run the current release, coverage, and fresh-install gates.
- Fix concrete cleanup issues found during audit.

Findings:

- The worktree started clean and synced with `origin/main`.
- Ignored runtime artifacts such as `.sage-kernel/`, local DB files, `node_modules/`, and `.env.local` were not tracked.
- Public package metadata exists: MIT license, repository metadata, executable `sage` bin, Node `>=22`.
- Packaging gap found: README visual assets were referenced but not included in the npm `files` allowlist.

Fixes:

- Added `assets` to `package.json` package files.
- Added release-quality assertions that package metadata includes `assets`.
- Added release-quality assertions that both public SVG visual assets exist.

Verification:

```bash
node --test tests/release-quality.test.mjs
npm pack --dry-run --json
npm run release:check
npm run test:coverage
npm run verify:fresh-install
git diff --check
```

Baseline results:

- Release-quality test: passed.
- Package dry run: passed, with both SVG visuals included.
- Release check: passed.
- Fresh-install verification: passed.
- Coverage gate: passed.
  - Lines: 99.27%
  - Branches: 90.18%
  - Functions: 97.80%

Residual risks:

- Real Postgres integration is covered in CI, but Phase 1.1 did not rerun Docker Postgres locally.
- Long-duration soak testing is out of scope for Phase 1.1 and belongs to later stress/operations phases.
- The package is packable, but not yet published with provenance.

## Phase 1.2: CI Quality Gates Expansion

Status: pending.

Goal:

- Add or tighten CI gates for package contents, docs links, action hygiene, and release artifacts.
- Keep Node 22 project runtime and current GitHub Actions majors.
- Make CI fail on missing public assets, broken generated contracts, and release packaging regressions.

## Phase 1.3: Fresh-Install Verification Hardening

Status: pending.

Goal:

- Extend fresh-install checks to prove the installed `sage` executable, MCP smoke, package visuals, and dashboard build from a clean clone.

## Phase 1.4: Release Packaging And Provenance

Status: pending.

Goal:

- Prepare npm release automation, provenance, signed tags, version policy, and release candidate checklist.

