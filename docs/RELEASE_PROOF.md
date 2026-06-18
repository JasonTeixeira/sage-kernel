# Release Proof

This document records what must be proven before a public release.

## Local Proof

Required commands:

```bash
npm ci
npm run test:coverage
npm run release:check
npm run templates:e2e
npm run templates:benchmark
npm run score:report
npm run audit:full
npm run verify:fresh-install
git diff --check
```

Optional stress proof:

```bash
npm run stress:queue -- --count=10000
npm run stress:queue -- --count=100000
npm run soak:run -- --profile=extended
```

Live dashboard stress proof requires the dashboard to be running:

```bash
npm run dashboard:serve
npm run stress:dashboard -- --url=http://127.0.0.1:8787 --endpoint=/health --count=1000 --concurrency=50
```

## Remote Proof

GitHub Actions must pass:

- Quality Gates / Node 22
- Fresh Install Verification
- Postgres Integration

Latest recorded remote proof:

- Date: 2026-06-18
- Commit: `29fd640`
- CI: https://github.com/JasonTeixeira/sage-kernel/actions/runs/27762230259
- Result: passed Quality Gates, Fresh Install Verification, and Postgres
  Integration.

## Current Local Evidence

Latest recorded local proof on 2026-06-18:

- `npm run test:coverage`: passed, 227 tests, 226 passed, 1 skipped local
  Postgres test, 99.14% line coverage, 90.92% branch coverage, 98.12%
  function coverage.
- `npm run release:check`: passed with score, memory E2E, self-healing,
  release evidence, generated-template E2E, and template benchmark gates.
- `npm run score:report`: passed, 98/100, no score blockers after global
  agent install proof.
- `npm run templates:e2e`: passed for `worker-service`, `node-api-service`,
  and `agent-workflow-app`; each generated project installed and ran `npm run
  qa`.
- `npm run templates:benchmark`: passed for the same three templates with
  scaffold/install/QA timing recorded.
- `npm run stress:queue -- --count=100000`: passed, 100000 finished, 0
  unfinished.
- `npm run stress:dashboard -- --url=http://127.0.0.1:8787 --count=1000
  --concurrency=50`: passed, 0 failures, p95 151ms.
- `npm run soak:run -- --profile=extended`: passed 10 cycles. Each cycle ran
  10000 queue jobs, 1000 dashboard health requests at concurrency 50, and MCP
  smoke. Memory delta: RSS +151257088 bytes, heap used +33369104 bytes,
  external +1660531 bytes.
- `sage agents install --force --json`: passed and installed global
  `AGENTS.md`, manifest, and profiles under `/Users/Sage/.sage-kernel/agents`.
- `sage agents doctor --json`: passed after global install.

## Npm Publishing Proof

Before the first npm release:

1. Authenticate to npm locally.
2. Confirm `npm whoami` succeeds.
3. Confirm the package name is available or owned by the maintainer.
4. Configure a publish-capable `NPM_TOKEN` GitHub secret for the first
   provenance publish, or explicitly document a non-provenance bootstrap
   exception.
5. Create a signed release tag.
6. Publish a GitHub Release.
7. Watch the Release workflow publish with provenance.
8. Verify public install from a clean temporary project.
9. After the first package exists, configure npm trusted publishing for
   `JasonTeixeira/sage-kernel` and `.github/workflows/release.yml`.

If `npm whoami` fails with `E401`, publishing is not proven from the current
machine. If no Git signing key is configured, signed tags are not proven from
the current machine.

Current local status on 2026-06-18:

- `npm whoami`: `nexural`.
- `npm view sage-kernel version`: `E404 Not Found`; package is not published.
- `npm publish --access public --dry-run`: passed.
- Local real publish is blocked by provenance because local execution has no
  supported OIDC provider.
- No local Git signing key is configured.

## MCP Client Proof

Automated smoke tests prove the MCP server and config generation. Manual proof
still requires connecting at least one real desktop client:

```bash
sage mcp config codex --json
sage mcp config claude-desktop --json
sage mcp config cursor --json
sage mcp smoke
```

Record the client, config path, date, and successful tool call in release notes.
