# AI Warehouse Kernel Adapter

This package is the contract between Sage Kernel OS and the existing `ai-warehouse` repo.

The warehouse remains its own source repo. The kernel should not blindly copy 861 tool entries into this repo. Instead, it should consume the warehouse through stable contracts:

- `memory.schema.json`: how the kernel stores project memory, repo summaries, decisions, prompts, fixes, and reusable patterns.
- `tool-contract.json`: MCP-facing operations the kernel expects from the warehouse.
- `scripts/warehouse-summary.mjs`: local inspection bridge for validating the current warehouse inventory.

## Source Warehouse

Default local source:

```text
/Users/Sage/.graphify/repos/JasonTeixeira/ai-warehouse
```

Current observed capability:

- Python package and CLI: `ai-warehouse`
- Existing MCP server: `mcp-server/server.py`
- Streamable HTTP server: `mcp-server/http_server.py`
- Tool index: `index.json`
- Tool docs: `tools/**`
- Templates: `templates/**`
- Playbooks: `playbooks/**`
- Prompts: `prompts/**`
- Decision docs: `DECISIONS.md`, `DECISIONS_SAAS_VS_OSS.md`

## Kernel Role

The kernel uses AI Warehouse for:

- selecting tools and stacks
- finding prior patterns before scaffolding
- storing architecture decisions
- retrieving prompts/playbooks
- comparing infrastructure options
- generating evidence-backed project plans
- updating verdicts after real project usage

