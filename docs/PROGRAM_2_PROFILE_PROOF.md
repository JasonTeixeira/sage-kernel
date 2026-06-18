# Program 2 Universal Project Detection And SDLC Profiles

Last updated: 2026-06-18

## Goal

Make Sage Kernel project-agnostic enough to inspect a repository, detect its
stack and SDLC profile, and generate a machine-checkable definition of done.

## Phase 2.1 Project Type Detector

Status: implemented and locally proven.

Deliverables:

- `packages/profiles/project-detector.mjs`
- `sage profile detect [projectPath] --json`
- MCP tool: `kernel.profile.detect`

Detected surfaces:

- Package manager.
- Languages.
- Frameworks.
- Project types.
- Primary SDLC profile.
- Secondary SDLC profiles.
- Scripts.
- CI.
- Docs.
- Tests.
- Databases.
- Deployment surfaces.
- Detection evidence and warnings.

Profiles detected in tests:

- `web-app`
- `backend-api`
- `mcp-server`
- `mobile-app`
- `infrastructure`
- `monorepo`

## Phase 2.2 SDLC Profile Catalog

Status: implemented and locally proven.

Deliverables:

- Built-in `SDLC_PROFILES` catalog.
- `npm run profiles:validate`
- `npm run profiles:prove`

Current profiles:

- `web-app`
- `mobile-app`
- `backend-api`
- `mcp-server`
- `cli-tool`
- `library`
- `data-pipeline`
- `ai-agent-app`
- `infrastructure`
- `monorepo`

Validation evidence:

- `npm run profiles:validate`: passed with 10 profiles.
- `npm run profiles:prove`: passed against generated fixture projects.

## Phase 2.3 Definition Of Done Engine

Status: implemented and locally proven.

Deliverables:

- `generateDefinitionOfDone`.
- `sage done generate [projectPath] --objective=<text> --risk=<level> --json`
- MCP tool: `kernel.done.generate`

Generated output includes:

- Objective.
- Risk.
- Profile.
- Acceptance criteria.
- Required checks.
- Recommended commands.
- Evidence requirements.
- Rollback requirement.
- Stop conditions.

## Phase 2.4 Cross-Project Proof

Status: initial fixture proof complete; broader real-project proof remains.

Completed fixture proof:

- Next/React fixture detected as `web-app`.
- FastAPI fixture detected as `backend-api`.
- MCP fixture detected as `mcp-server`.

Local project proof:

- `sage profile detect . --json` detects `sage-kernel` as an MCP-enabled
  engineering system.
- `sage done generate . --objective=... --risk=high --json` produces high-risk
  acceptance criteria and rollback requirements.

MCP proof:

- `kernel.profile.detect` returns a project profile through the runtime
  dispatcher.
- `kernel.done.generate` returns a definition of done through the runtime
  dispatcher.

## Verification

Focused verification:

- `node --test tests/profiles.test.mjs`: passed.
- `npm run profiles:validate`: passed.
- `npm run profiles:prove`: passed.
- `npm run mcp:validate`: passed.
- `npm run mcp:contracts`: passed.
- `npm run public:validate`: passed.
- `node --test tests/mcp-contracts.test.mjs tests/release-quality.test.mjs tests/security-kernel.test.mjs`: passed.

Full-gate verification:

- `npm run test:coverage`: passed.
- `npm run coverage:critical -- /tmp/sage-program2-coverage-output.txt`: passed.
- Coverage after this pass:
  - Lines: 99.33%.
  - Branches: 92.99%.
  - Functions: 98.21%.
- `npm run release:check`: passed.
- `npm run verify:fresh-install -- --worktree-copy`: passed.
- `npm run security:scan`: passed.
- `npm audit`: passed with 0 vulnerabilities.
- `git diff --check`: passed.

## What Is Left

1. Push and prove CI on GitHub.
2. Expand cross-project proof against real local repos outside Sage Kernel.
3. Add richer framework-specific definitions of done as new project types are
   encountered.
4. Use Program 3 to turn these profiles into closed-loop workflows.
