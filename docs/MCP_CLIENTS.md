# MCP Client Setup

Sage Kernel is an MCP server first. Generate client configs from the checkout:

```bash
node bin/sage.mjs mcp config all
node bin/sage.mjs mcp config codex --json
node bin/sage.mjs mcp config claude-desktop --json
node bin/sage.mjs mcp config cursor --json
```

Verify the local server:

```bash
node bin/sage.mjs doctor --fast
node bin/sage.mjs mcp smoke
```

Start the server:

```bash
node bin/sage.mjs mcp start
```

The generated configs use:

```json
{
  "command": "node",
  "args": ["apps/mcp-server/src/server.mjs"],
  "cwd": "/absolute/path/to/sage-kernel"
}
```

Keep the server local. The current product is a local stdio MCP server with a
local dashboard cockpit, not a public hosted service.

Daily commands:

```bash
node bin/sage.mjs daily
node bin/sage.mjs audit .
node bin/sage.mjs full-qa .
node bin/sage.mjs failures '{"status":"failed","checks":[]}'
node bin/sage.mjs create-app worker-service daily-worker
node bin/sage.mjs release worker-service docker
node bin/sage.mjs pending
node bin/sage.mjs stress http://127.0.0.1:8787
```
