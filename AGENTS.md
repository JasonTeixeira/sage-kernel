# Sage Kernel Local Agent Contract

This repository is the local Sage Kernel SDLC/MCP control plane.

Codex should use this file as the project-local operating contract and should
also honor the global policy at `/Users/Sage/AGENTS.md`.

## What Sage Kernel Is

Sage Kernel is a local MCP-native engineering operating system for software
development lifecycle work. It detects the project profile, selects the best
SDLC loop, plans work, verifies changes, reviews risk, scores evidence, and
records what remains.

Canonical SDLC contract:

- `docs/GLOBAL.md`
- `docs/100_SCORE_IMPLEMENTATION_PROGRAM.md`
- `docs/SDLC_AI_GAP_AUDIT.md`
- `docs/AUDIT_REPORT.md`

## MCP Connection

Use the local MCP server named `sage-kernel`:

```json
{
  "mcpServers": {
    "sage-kernel": {
      "command": "node",
      "args": ["apps/mcp-server/src/server.mjs"],
      "cwd": "/Users/Sage/sage-kernel"
    }
  }
}
```

Installed local client config evidence:

- Claude Desktop: `/Users/Sage/Library/Application Support/Claude/claude_desktop_config.json`
- Cursor: `/Users/Sage/.cursor/mcp.json`
- Latest proof: `.sage-kernel/evidence/mcp-client-proof-latest.json`

Useful commands:

```bash
npm run mcp:clients:install
npm run mcp:clients:prove
npm run mcp:smoke
npm run audit:full
npm run eval:100
```

## How To Pick The Best SDLC Profile

Before editing any project, run or call the profile tools:

```bash
npm run profiles:prove-paths
npm run benchmark:real-repos -- <20 repo paths>
```

For MCP clients, prefer these tools:

- `kernel.profile.gaps`
- `kernel.loop.score`
- `kernel.loop.full_cycle`
- `kernel.benchmark.matrix`
- `kernel.redteam.agent_safety`
- `kernel.evidence.list`
- `kernel.evidence.compare`

The selected profile should drive the definition of done, checks, review path,
and scorecard. If detection is ambiguous, flag ambiguity instead of pretending
confidence is high.

## Done Means Proven

Do not claim completion unless evidence exists. At minimum, report:

- changed files
- commands run
- pass/fail results
- evidence paths
- score caps or blockers
- unverified external proof

