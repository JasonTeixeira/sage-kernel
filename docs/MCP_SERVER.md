# Sage Kernel MCP Server

Sage Kernel is MCP-first. The MCP server is the primary product interface; the dashboard is an optional local cockpit for humans.

The canonical server entry point is:

```bash
npm run mcp:start
```

`npm run mcp:server` is kept as a compatibility alias for the same command.

For day-to-day use, the `sage` CLI wraps the same MCP server and tool surface:

```bash
sage doctor --fast
sage mcp config all
sage mcp smoke
sage mcp start
sage daily
```

## What The Server Exposes

The MCP server exposes the kernel through strict, manifest-backed tools for:

- catalog and phase inspection
- project planning from templates
- QA profile lookup and QA execution
- infrastructure planning and deployment preparation
- durable job listing, enqueueing, and run history
- signed approval request and approval flows
- dashboard snapshot access
- dogfood production audit reports
- daily workflow tools for repo audits, full QA, failure explanation,
  app creation, release readiness, approvals, stress tests, and summaries

The tool manifest is stored in `apps/mcp-server/tools.json`. Generated contracts live in `apps/mcp-server/contracts/tools.snapshot.json`, and generated human docs live in `docs/mcp-tools.md`.

Read-only MCP resources are registered from `apps/mcp-server/src/kernel-resources.mjs`. Generated resource contracts live in `apps/mcp-server/contracts/resources.snapshot.json`, and generated human docs live in `docs/mcp-resources.md`.

Workflow prompts are registered from `apps/mcp-server/src/kernel-prompts.mjs`. Generated prompt contracts live in `apps/mcp-server/contracts/prompts.snapshot.json`, and generated human docs live in `docs/mcp-prompts.md`.

## Local Verification

Before connecting an MCP client, verify the server surface:

```bash
npm run mcp:validate
npm run mcp:contracts
npm run mcp:smoke
```

The smoke test starts the SDK-backed stdio server and calls a safe read-only tool through an MCP client transport.

Resource E2E coverage starts the same server, lists resources, reads each registered resource, and verifies missing resources fail cleanly.

Prompt E2E coverage starts the same server, lists workflow prompts, and verifies a daily-use prompt returns an actionable message.

## Claude Desktop

Generate a local stdio config:

```bash
sage mcp config claude-desktop --json
```

It emits a config equivalent to:

```json
{
  "mcpServers": {
    "sage-kernel": {
      "command": "node",
      "args": ["apps/mcp-server/src/server.mjs"],
      "cwd": "/absolute/path/to/sage-kernel"
    }
  }
}
```

Replace `/absolute/path/to/sage-kernel` with the local checkout path.

## Codex

Generate a local stdio config:

```bash
sage mcp config codex --json
```

It emits a config equivalent to:

```toml
[mcp_servers.sage-kernel]
command = "node"
args = ["apps/mcp-server/src/server.mjs"]
cwd = "/absolute/path/to/sage-kernel"
```

Keep the server local by default. Do not expose it on a public network unless authentication, authorization, and deployment hardening have been added.

## Direct Local Calls

For debugging without an MCP client:

```bash
npm run mcp:tools
npm run mcp:call -- kernel.catalog.search '{"query":"qa","limit":2}'
npm run mcp:call -- kernel.workflow.daily_summary '{}'
```

The direct dispatcher is useful for tests and local debugging. The SDK-backed MCP server remains the canonical product entry point.

## Workflow Prompts

The server exposes prompts for daily kernel operations:

- `sage.audit-repo`
- `sage.run-full-qa`
- `sage.create-project`
- `sage.inspect-approvals`
- `sage.prepare-release`
- `sage.stress-test-server`
- `sage.explain-failed-job`

Use prompts when you want an MCP client to guide a repeatable workflow instead of manually composing the instruction each time.

## Daily Workflow Tools

The server exposes direct workflow tools for the commands you will use most:

- `kernel.workflow.audit_repo`
- `kernel.workflow.run_full_qa`
- `kernel.workflow.explain_failures`
- `kernel.workflow.create_app`
- `kernel.workflow.release_readiness`
- `kernel.workflow.pending_approvals`
- `kernel.workflow.stress_dashboard`
- `kernel.workflow.daily_summary`

## Safety Model

Every MCP tool must declare risk and permission metadata in the manifest. Mutating or risky actions must pass through the kernel policy and approval model.

Phase 1.1 is complete only when:

- `npm run mcp:start` starts the canonical stdio server.
- `npm run mcp:server` remains an alias for compatibility.
- `npm run mcp:validate` passes.
- `npm run mcp:smoke` passes.
- `npm run mcp:contracts` passes.
- Client setup instructions exist for Claude Desktop and Codex.
