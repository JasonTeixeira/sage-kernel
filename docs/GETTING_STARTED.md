# Getting Started — use sage-kernel on YOUR projects

Three steps from clone to a real SDLC assessment of your own repo.

## Language support (be honest about what's deep vs. shallow)

The deep analysis engines are **JavaScript / TypeScript / Node-native**. Other
languages get profile detection + repository meta-checks, with toolchain commands
**inferred** (not run). Use this matrix to set expectations:

| Capability | JS / TS / Node | Python | Go / Rust / Java / Ruby / PHP / Swift / others |
| --- | --- | --- | --- |
| Profile detection + definition-of-done | ✅ deep | ✅ | ✅ |
| Loop score / gaps / required checks | ✅ | ✅ (meta) | ✅ (meta) |
| AST code review (`review.quality_score`) | ✅ structural | ⚠️ heuristic | ⚠️ heuristic / meta |
| SAST + taint (`security.proof`) | ✅ AST taint | ⚠️ regex rules | ❌ meta only |
| Executed coverage / test run | ✅ `node --test` | ❌ (commands inferred) | ❌ (commands inferred) |

For a non-Node repo, `done.generate` / `profile.gaps` now return the correct
toolchain commands for the detected language (e.g. `pytest`, `go test`) plus a
`toolchainNote` stating the deep analysis is JS/TS-native. **Bottom line: trust the
full SDLC depth on Node/TS repos; treat non-Node output as profile + meta guidance.**

## 1. Install (one time)

```bash
git clone https://github.com/JasonTeixeira/sage-kernel.git
cd sage-kernel
npm install            # Node >= 22 required
npm run mcp:smoke      # real client handshake — should print "passed, 140 tools"
```

## 2. Assess any repo in one command

```bash
npm run onboard -- /path/to/your/repo
```

You get a readable report: detected profile, loop score, review score, security
status, the profile's required checks, and the top gaps — computed from YOUR
repo's actual contents (read-only; your code is never modified).

## 3. Wire it into Claude Code / Cursor (permanent)

Add the MCP server to your client config. The key bit for using it on your own
projects is `SAGE_PROFILE_ALLOWED_ROOTS` — the parent dirs the kernel may analyze:

```json
{
  "mcpServers": {
    "sage-kernel": {
      "command": "node",
      "args": ["apps/mcp-server/src/server.mjs"],
      "cwd": "/absolute/path/to/sage-kernel",
      "env": { "SAGE_PROFILE_ALLOWED_ROOTS": "/Users/you/code:/Users/you/work" }
    }
  }
}
```

- `cwd` MUST be the kernel checkout (it resolves its own DB relative to `cwd`).
- Then call tools with `projectPath` (or `targetRoot`) set to the absolute path of
  the project you want analyzed.

## The everyday SDLC loop (read-only analysis)

| Step | Tool | What it tells you |
| --- | --- | --- |
| Orient | `kernel.profile.gaps` | what kind of project this is + what's missing |
| Define done | `kernel.done.generate` | the required checks for this profile/risk |
| Score | `kernel.loop.score` | a 0-100 health score from real evidence |
| Review | `kernel.review.quality_score` | architecture/clean-code/test/security/release |
| Security | `kernel.security.proof` | AST SAST + taint + threat model |

Every tool returns a uniform envelope: `{ ok: true, data }` or
`{ ok: false, error: { code, kind, message } }` — it never crashes the server.

## Autonomous extras (opt-in, cost real model calls)

- Self-healing repair loop: set `SAGE_AGENT_COMMAND` (e.g.
  `node providers/claude-agent.mjs` or `node providers/codex-agent.mjs`).
- Capability self-audit: `npm run engineer:measure` (proof-backed scorecard),
  `npm run stress:verify -- --passes 5` (stability).
- See [USING_SAGE_KERNEL.md](USING_SAGE_KERNEL.md) for the full surface.
