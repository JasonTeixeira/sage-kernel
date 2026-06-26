# ADR 0002 — Terminal/stdio MCP is the product surface (no GUI, no required publish)

- Status: accepted
- Date: 2026-06-20

## Context

The score had a cap requiring a GUI screenshot (Claude Desktop/Cursor) and an
npm publish to clear. Neither reflects this product: it is a terminal/stdio MCP
server consumed by MCP clients over JSON-RPC.

## Decision

The external integration contract is **a real MCP client connecting over stdio
and calling tools**, proven headlessly by `mcp:clients:prove` (official
`@modelcontextprotocol/sdk` handshake + a real `claude mcp add --scope project`
config load in a self-cleaning temp dir). A GUI screenshot proves a third-party
app's rendering, not kernel correctness, so it is **not** required. npm publish
remains an optional distribution path, not the contract. The `:8787` dashboard is
an ops liveness endpoint, not a product UI.

## Consequences

- No web/GUI is built or maintained; the dashboard stays terminal/ops-oriented.
- The score cap lifts on real terminal client proof (or, optionally, public install).
- Never `npm publish` without explicit approval.
