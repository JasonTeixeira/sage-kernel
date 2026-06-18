# Release Proof

This document records what must be proven before a public release.

## Local Proof

Required commands:

```bash
npm ci
npm run test:coverage
npm run release:check
npm run verify:fresh-install
git diff --check
```

Optional stress proof:

```bash
npm run stress:queue -- --count=10000
npm run stress:queue -- --count=100000
npm run soak:run -- --profile=local --cycles=3 --skip-dashboard
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
