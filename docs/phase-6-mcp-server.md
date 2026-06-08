# Phase 6: MCP Server

Phase 6 defines the Sage Kernel MCP control surface.

## Built Artifacts

- `apps/mcp-server/tools.json`
- `apps/mcp-server/scripts/list-tools.mjs`
- `apps/mcp-server/scripts/validate-mcp.mjs`
- `apps/mcp-server/scripts/call-tool.mjs`
- `apps/mcp-server/src/kernel-tools.mjs`
- `apps/mcp-server/src/server.mjs`

## Current Capability

The dependency-free dispatcher supports these local tool calls:

- `kernel.phase.status`
- `kernel.catalog.search`
- `kernel.template.list`
- `kernel.project.plan`
- `kernel.project.scaffold`
- `kernel.warehouse.summary`
- `kernel.qa.profile`
- `kernel.infra.plan`

## SDK Server

The SDK-backed stdio server uses `@modelcontextprotocol/sdk`, `McpServer`, `server.registerTool(...)`, `zod/v4` schemas, and `StdioServerTransport`.

Run:

```bash
npm run mcp:server
```

Smoke test:

```bash
npm run mcp:smoke
```

## Boundary

The MCP server may read catalogs and write local scaffolds.

It must not:

- provision cloud resources
- mutate external systems
- delete repos/projects
- write secrets
- deploy production resources

Those actions require explicit approval and should remain separate tools with clear destructive boundaries.
