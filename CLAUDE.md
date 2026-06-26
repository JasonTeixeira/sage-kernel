# Sage Kernel Local Claude Instructions

Claude should treat this repository as the local Sage Kernel SDLC/MCP operating
system.

Use `/Users/Sage/AGENTS.md` for the global engineering standard and
`/Users/Sage/sage-kernel/AGENTS.md` for this repository's local Sage Kernel
rules.

## Primary SDLC Files

Read these files when deciding which SDLC profile, loop, or proof path to use:

- `docs/GLOBAL.md`
- `docs/100_SCORE_IMPLEMENTATION_PROGRAM.md`
- `docs/SDLC_AI_GAP_AUDIT.md`
- `docs/AUDIT_REPORT.md`

## MCP Server To Connect

The local MCP server is `sage-kernel`.

```json
{
  "mcpServers": {
    "sage-kernel": {
      "command": "node",
      "args": ["apps/mcp-server/src/server.mjs"],
      "cwd": "/Users/Sage/sage-kernel",
      "env": {
        "SAGE_PROFILE_ALLOWED_ROOTS": "/Users/Sage/code:/Users/Sage/Documents"
      }
    }
  }
}
```

Notes:
- `cwd` MUST be this kernel checkout (the server resolves its DB/schema relative
  to `cwd`). On another machine, set `cwd` to wherever sage-kernel is cloned.
- To analyze YOUR OTHER projects, list their parent dirs in
  `SAGE_PROFILE_ALLOWED_ROOTS` (colon-separated), then pass each project to a tool
  via `projectPath`/`targetRoot` (absolute path). Without this, foreign repos are
  refused by the path-safety gate.
- For the self-healing loop, also set `SAGE_AGENT_COMMAND` (e.g.
  `node providers/claude-agent.mjs` or `node providers/codex-agent.mjs`).

Claude Desktop config path:

```text
/Users/Sage/Library/Application Support/Claude/claude_desktop_config.json
```

To verify the server:

```bash
npm run mcp:smoke
npm run mcp:clients:prove
```

## Best-Profile Workflow

For any target project:

1. Inspect the repo before proposing changes.
2. Detect the SDLC profile.
3. If confidence is low or ambiguous, say so.
4. Use the selected profile's checks as the definition of done.
5. Run verification and score the evidence.
6. Record remaining blockers instead of claiming unproven completion.

Relevant MCP tools:

- `kernel.profile.gaps`
- `kernel.loop.score`
- `kernel.loop.full_cycle`
- `kernel.review.quality_score`
- `kernel.security.proof`
- `kernel.testing.proof`
- `kernel.redteam.agent_safety`
- `kernel.benchmark.matrix`

