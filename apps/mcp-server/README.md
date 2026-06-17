# Sage Kernel MCP Server

Phase 6 defines the MCP control surface for Sage Kernel OS.

The SDK-backed stdio MCP server is the canonical product entry point. The dependency-free local dispatcher remains available for tests and debugging.

- `tools.json`: stable MCP tool manifest
- `scripts/call-tool.mjs`: dependency-free local dispatcher
- `scripts/list-tools.mjs`: tool inventory
- `scripts/validate-mcp.mjs`: manifest validation
- `src/server.mjs`: SDK-backed stdio MCP server

## Local Tool Calls

List tools:

```bash
npm run mcp:tools
```

Call a tool:

```bash
npm run mcp:call -- kernel.phase.status
npm run mcp:call -- kernel.template.list
npm run mcp:call -- kernel.project.plan '{"template":"next-saas-app","target":"vercel"}'
```

## MCP Server

Run the stdio server:

```bash
npm run mcp:start
```

`npm run mcp:server` is a compatibility alias for the same command. MCP clients should launch the server from the `sage-kernel` repo root. The active runtime uses `@modelcontextprotocol/sdk`.

Full setup notes for Claude Desktop and Codex are in `docs/MCP_SERVER.md`.
