# Program 3 Closed-Loop Workflow Engine

Last updated: 2026-06-18

## Goal

Turn detected SDLC profiles into enforceable closed-loop workflows that plan,
verify, harden, and report with explicit evidence and stop conditions.

## Phase 3.1 Loop Planner

Status: implemented and locally proven.

Deliverables:

- `packages/workflows/closed-loop.mjs`
- `sage loop plan [projectPath] --objective=<text> --risk=<level> --json`
- MCP tool: `kernel.loop.plan`

The planner generates:

- Detected project profile.
- Secondary profiles.
- Objective and risk.
- Inspect, implement, verify, harden, and report phases.
- Allowlisted commands.
- Evidence requirements.
- Stop conditions.
- Rollback expectation.
- Next actions.

## Phase 3.2 Loop Validation And Proof

Status: implemented and locally proven.

Deliverables:

- `npm run workflows:validate`
- `npm run workflows:prove`
- MCP tools:
  - `kernel.loop.validate`
  - `kernel.loop.prove`

Proof coverage:

- Plan mode against a generated FastAPI fixture.
- Dry-run mode against a generated fixture.
- Runner-backed run mode with injected command execution.

## Phase 3.3 Allowlisted Execution

Status: implemented and locally proven.

Deliverables:

- `sage loop run [projectPath] --risk=<level> --json`
- MCP tool: `kernel.loop.run`

Execution boundary:

- Only allowlisted local verification commands can run.
- Unknown commands are blocked with a non-zero command result.
- MCP `kernel.loop.run` is marked mutating and uses `workflow:write`.
- Read-only kernel mode blocks mutating loop execution through the existing
  security guard.

## Phase 3.4 Release Gate Integration

Status: implemented and locally proven.

Release gate additions:

- `npm run profiles:validate`
- `npm run profiles:prove`
- `npm run profiles:prove-paths`
- `npm run workflows:validate`
- `npm run workflows:prove`

These now run inside `npm run release:check`.

## Verification

Focused verification:

- `node --test tests/profiles.test.mjs tests/workflows-closed-loop.test.mjs`: passed.
- `npm run profiles:prove-paths -- .`: passed.
- `npm run workflows:validate`: passed.
- `npm run workflows:prove`: passed.
- `npm run mcp:validate`: passed with 61 tools.
- `npm run mcp:contracts`: passed with 61 tools, 11 prompts, and 21 resources.

Full-gate verification:

- `npm run test:coverage`: passed.
- Coverage after this pass:
  - Lines: 99.28%.
  - Branches: 92.55%.
  - Functions: 98.25%.
- `npm run coverage:critical -- /tmp/sage-program3-coverage-output.txt`: passed.
- `npm run release:check`: passed.
- `npm run verify:fresh-install -- --worktree-copy`: passed.
- `npm run security:scan`: passed.
- `npm audit`: passed with 0 vulnerabilities.
- `git diff --check`: passed.

## What Is Left

1. Push and prove CI on GitHub.
2. Connect the loop engine to dashboard workflow controls.
3. Add per-framework loop refinements as real projects are scanned.
4. Finish external publish residue: npm auth, signed release, provenance
   publish, and public npm install proof.
