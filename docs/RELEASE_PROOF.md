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

1. Authenticate to npm locally or configure trusted publishing.
2. Confirm `npm whoami` succeeds.
3. Confirm the package name is available or owned by the maintainer.
4. Create a signed release tag.
5. Publish a GitHub Release.
6. Watch the Release workflow publish with provenance.

If `npm whoami` fails with `E401`, publishing is not proven from the current
machine. If no Git signing key is configured, signed tags are not proven from
the current machine.

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

