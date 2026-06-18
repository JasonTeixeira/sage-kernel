# SDLC Profile And Loop Audit

Date: 2026-06-18

## Proven

- `npm run profiles:validate` validates 10 SDLC profiles.
- `npm run profiles:prove` now proves deterministic fixtures for all 10
  profiles:
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
- `npm run workflows:validate` validates the closed-loop workflow contract.
- `npm run workflows:prove` proves closed-loop planning, dry-run behavior, and
  allowlisted execution.
- `npm run workflows:e2e` proves the workflow engine can detect a controlled
  failing fixture, apply a bounded repair, and pass after repair.
- Codex MCP registration is proven by `codex mcp list`.

## Remaining Gaps

- Real external project profile proof depends on user-provided local project
  paths through `SAGE_PROFILE_PROOF_PATHS` or `sage profile prove-paths`.
- Mobile profile proof is fixture-level only; real iOS/Android simulator or
  device smoke is not automated yet.
- Web profile proof includes dashboard/browser tests, but generated app
  Playwright template execution against a real Next/Vite app is still a future
  hardening pass.
- Data-pipeline profile proof is structural; it does not yet run real
  idempotency/backfill/retry fixtures.
- Infrastructure profile proof validates local infra templates, not real cloud
  plan/apply in a sandbox account.
- Agent-app profile proof validates eval/memory/security surfaces, but does not
  yet benchmark against external agent tasks from unrelated repos.
- Claude Desktop and Cursor MCP client proof still require manual client launch
  and one successful tool call.
- Public npm install proof remains blocked until the package is published.

## Release Boundary

The release workflow is configured for npm trusted publishing through GitHub
Actions:

- GitHub user/repo: `JasonTeixeira/sage-kernel`
- Workflow filename: `release.yml`
- Trigger: GitHub Release published
- Required permission: `id-token: write`
- Publish command: `npm publish --provenance --access public`

The remaining external npm setup is one of:

1. Configure npm trusted publishing for the package on npmjs.com, then publish a
   GitHub Release.
2. Bootstrap the first publish with a publish-capable npm token, then configure
   trusted publishing after the package exists.

Do not claim public install proof until `npm view sage-kernel version` succeeds
and a clean `npm install -g sage-kernel` has been recorded.
