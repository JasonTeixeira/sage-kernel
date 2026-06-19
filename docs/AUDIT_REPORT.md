# Sage Kernel Audit Report

Generated: 2026-06-19

## Executive Posture

Sage Kernel is now in a release-candidate posture for local MCP-native SDLC use.
The local product surface, package surface, release checks, hostile fixtures,
client-compatible MCP calls, and fresh global install simulation are proven.

The remaining hard blocker is external publication and true UI proof:

- npm registry still has no `sage-kernel` package.
- local npm auth is missing or invalid.
- Claude Desktop and Cursor configs are installed, and SDK-compatible MCP calls
  pass, but manual UI launch/tool-call evidence is still required.

## Completed Work

- Installed/merged Claude Desktop config at
  `/Users/Sage/Library/Application Support/Claude/claude_desktop_config.json`.
- Installed/merged Cursor config at `/Users/Sage/.cursor/mcp.json`.
- Preserved Cursor config backup:
  `/Users/Sage/.cursor/mcp.json.sage-kernel-backup-1781833416126`.
- Proved MCP SDK tool calls for Claude Desktop, Codex, and Cursor-compatible
  stdio configs using `kernel.phase.status`.
- Saved MCP client evidence to
  `.sage-kernel/evidence/mcp-client-proof-latest.json`.
- Added `npm run verify:global-install` and proved a temp-prefix global install.
- Added `npm run release:pipeline` for provenance, npm auth, registry, and global
  install proof.
- Added executable red-team fixtures for malicious repos, prompt injection, fake
  secrets, huge logs, broken package scripts, destructive tool calls, flaky
  tests, and poisoned memory.
- Added benchmark matrix proof with profile detection, done criteria, loop score,
  security proof, testing proof, review score, evidence save, comparison, and CI
  regression gate.
- Improved profile decisions with winner reason, candidate scores, ambiguity
  flags, and close candidates.
- Split SDLC/MCP proof helpers out of `kernel-tools.mjs` into
  `apps/mcp-server/src/sdlc-tools.mjs`.
- Fixed npm package contents by including
  `apps/dashboard/dashboard-components.mjs`.

## Proof Commands

Passed:

```bash
npm run mcp:clients:install
npm run verify:global-install
npm run release:provenance
npm run release:pipeline
npm run redteam:fixtures
npm run benchmark:matrix -- --save --compare --fail-on-regression
npm run release:check
npm run mcp:contracts
npm run audit:full
npm run public:validate
```

Key results:

- MCP tools exposed: 91.
- Client-compatible MCP calls: 3/3 passed.
- Global install simulation: passed.
- Red-team fixtures: 8/8 passed.
- Benchmark matrix: passed, score 97 for this repo.
- Full release check: passed.
- Final audit: passed, score 98.

## Release Pipeline Status

Ready locally:

- `publishConfig.access=public`.
- `publishConfig.provenance=true`.
- GitHub Release workflow validates trusted publishing requirements.
- `npm publish --provenance --access public` is configured in
  `.github/workflows/release.yml`.
- Fresh global install simulation passes from packed tarball.

Blocked externally:

- `npm whoami` returns `E401`.
- `npm view sage-kernel` returns `E404`.
- No public `npm install -g sage-kernel` proof can exist until first publish.

## Remaining Required Manual Evidence

Before claiming full public/global production posture:

1. Configure npm trusted publishing for `JasonTeixeira/sage-kernel` or provide a
   publish-capable `NPM_TOKEN` through GitHub Actions.
2. Publish a GitHub Release and let the release workflow publish with
   provenance.
3. Verify:

   ```bash
   npm view sage-kernel version
   npm install -g sage-kernel
   sage doctor --fast --json
   sage mcp smoke
   ```

4. Launch Claude Desktop and call `kernel.phase.status`.
5. Launch Cursor and call `kernel.phase.status`.
6. Attach UI screenshots/logs for both clients to release evidence.

## Honest Weaknesses

- Claude Desktop and Cursor proof is not full UI proof yet. It is config install
  plus SDK-compatible stdio tool-call proof.
- npm publication is not done.
- The benchmark matrix is now executable but still needs a curated set of 20
  production-grade repos for stronger external confidence.
- `apps/dashboard/dashboard-render.mjs` remains large and should be split after
  publish-critical work.
- `apps/mcp-server/src/kernel-tools.mjs` is improved but still large because it
  remains the dispatcher for many tool families.

## Recommendation

Do not publish claims beyond release-candidate quality until npm provenance
publish and manual Claude Desktop/Cursor UI proofs are attached. The local
engineering posture is strong enough to proceed to a controlled GitHub Release
publish path once npm trusted publishing or `NPM_TOKEN` is configured.
