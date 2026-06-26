# Architecture Decision Records

Short, dated records of significant, hard-to-reverse decisions and their rationale.

| ADR | Decision |
|-----|----------|
| [0001](0001-ast-engine-foundation.md) | Single AST parser (acorn) as the structural-analysis foundation |
| [0002](0002-terminal-mcp-only-surface.md) | Terminal/stdio MCP is the product surface (no GUI, no required publish) |
| [0003](0003-enforced-coverage-floor.md) | Enforced coverage floor wired into release:check (anti-rot) |
| [0004](0004-provider-gated-brain.md) | Provider-gated "brain" via Claude CLI adapters |

New ADRs: copy the format of an existing file, increment the number, set status
(`proposed`/`accepted`/`superseded`) and date.
