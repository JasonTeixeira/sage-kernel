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

## Phase 3.5 Dashboard Loop Controls

Status: implemented and locally proven.

Dashboard workflow additions:

- `loop-plan`
  - Command: `sage loop plan . --risk=high`
  - Tool: `kernel.loop.plan`
  - Approval: not required.
- `loop-run`
  - Command: `sage loop run . --risk=low`
  - Tool: `kernel.loop.run`
  - Approval: required.

Proof:

- Dashboard workflow list includes both loop controls.
- Safe loop planning executes through the dashboard workflow API.
- Loop execution requests approval before running.
- Approved loop execution runs through the dashboard workflow API.
- The dashboard now renders workflow responses as structured result summaries
  with status, workflow/tool metadata, approval IDs, command exit code,
  highlights, and collapsible raw audit payloads instead of exposing only raw
  JSON.

## Phase 3.6 Framework Refinements

Status: implemented and locally proven.

Closed-loop workflows now add profile-specific commands and evidence for:

- MCP servers.
- Web apps.
- Backend APIs.
- CLI tools.
- Infrastructure projects.

Fallback behavior remains generic and safe for unknown profiles.

## Phase 3.7 Workflow Engine Runtime

Status: implemented and locally proven.

Deliverables:

- `packages/workflows/engine.mjs`
- `sage workflow validate --json`
- `sage workflow prove --json`
- `sage workflow run <workflow-json-file> --json`
- `npm run workflows:engine`
- `npm run workflows:e2e`

Runtime capabilities:

- Validates workflow IDs, unique step IDs, known step types, and command-bearing
  steps.
- Tracks explicit workflow states:
  - `proposed`
  - `planned`
  - `approved`
  - `running`
  - `verifying`
  - `reviewing`
  - `fixing`
  - `blocked`
  - `failed`
  - `passed`
  - `released`
- Supports step types:
  - `inspect`
  - `plan`
  - `command`
  - `test`
  - `review`
  - `security`
  - `stress`
  - `docs`
  - `memory`
  - `approval`
  - `rollback`
  - `release`
- Blocks approval-gated steps when approval evidence is missing.
- Retries failed steps within a configured retry budget.
- Calls a bounded repair hook before retry.
- Executes rollback commands for completed steps after downstream failure.
- Records an in-memory audit trail and supports an injected audit sink.
- Produces a repair-plan-style next-action list on failure.

E2E fixture proof:

- Creates a temporary project with a deliberately failing test.
- Runs the workflow engine against the fixture.
- Uses a controlled repair hook to patch the bug.
- Reruns the exact failing command.
- Verifies the fixture test fails before repair and passes after repair.

Release gate integration:

- `npm run workflows:engine` and `npm run workflows:e2e` now run inside
  `npm run release:check`.

## Verification

Focused verification:

- `node --test tests/profiles.test.mjs tests/workflows-closed-loop.test.mjs`: passed.
- `npm run profiles:prove-paths -- .`: passed.
- `npm run workflows:validate`: passed.
- `npm run workflows:prove`: passed.
- `node --test tests/workflows-engine.test.mjs`: passed.
- `npm run workflows:engine`: passed.
- `npm run workflows:e2e`: passed.
- `npm run mcp:validate`: passed with 61 tools.
- `npm run mcp:contracts`: passed with 61 tools, 11 prompts, and 21 resources.
- `node --test tests/dashboard-app.test.mjs`: passed, including workflow result
  summary rendering and approval-boundary workflow API tests.
- `node --test tests/workflows-closed-loop.test.mjs`: passed.
- `npm run profiles:prove-paths -- .`: passed and detected `sage-kernel` as
  `mcp-server` with secondary `ai-agent-app`, `cli-tool`, and `infrastructure`
  project types.
- `SAGE_PROFILE_ALLOWED_ROOTS="/Users/Sage/revenue-os:/Users/Sage/audit-trayd/trayd:/Users/Sage/ig-winner-mindset-carousel" npm run profiles:prove-paths -- . /Users/Sage/revenue-os /Users/Sage/audit-trayd/trayd /Users/Sage/ig-winner-mindset-carousel`:
  passed.
  - `.`: `mcp-server`, confidence 100.
  - `/Users/Sage/revenue-os`: `cli-tool`, confidence 80.
  - `/Users/Sage/audit-trayd/trayd`: `web-app`, confidence 95, with backend,
    infrastructure, and AI-agent secondary signals.
  - `/Users/Sage/ig-winner-mindset-carousel`: `library`, confidence 65, with a
    warning that no automated tests were detected.

Full-gate verification:

- `npm run test:coverage`: passed.
- Coverage after this pass:
  - Lines: 99.29%.
  - Branches: 92.91%.
  - Functions: 98.26%.
  - `packages/workflows/closed-loop.mjs` branch coverage: 95.77%.
- `npm run coverage:critical -- /tmp/sage-program3-dashboard-loop-coverage-output.txt`: passed.
- `npm run release:check`: passed.
- `npm run verify:fresh-install -- --worktree-copy`: passed.
- `npm run security:scan`: passed.
- `npm audit`: passed with 0 vulnerabilities.
- `git diff --check`: passed.

## What Is Left

1. Push and prove CI on GitHub for the dashboard summary polish.
2. Finish external publish residue: first-publish npm token, signed release, provenance
   publish, and public npm install proof.
3. Keep running `profiles:prove-paths` against additional real repositories as
   their paths are available and allowlisted.
4. Keep raising branch coverage for newly added workflow/profile branches as
   new profiles are added.
5. Next Program 3 pass: expose the workflow engine through MCP and dashboard
   active-workflow views, then use it as the substrate for Program 4 agents.
