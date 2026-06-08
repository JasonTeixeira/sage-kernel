# Phase 2: AI Warehouse Integration

Phase 2 makes `ai-warehouse` the kernel's knowledge brain without duplicating the whole warehouse into the kernel repo.

## Observed Source Capability

The existing `ai-warehouse` repo already provides:

- 861 curated tools in `index.json`
- tool docs under `tools/**`
- templates under `templates/**`
- prompts under `prompts/**`
- playbooks under `playbooks/**`
- decision docs
- Python CLI
- stdio MCP server
- Streamable HTTP MCP server
- validation and evidence docs

## Kernel Contract

The kernel adapter defines:

- `memory.schema.json`: durable memory entries for repo summaries, architecture decisions, prompts, playbooks, bug fixes, QA findings, deployment lessons, and case studies.
- `tool-contract.json`: MCP-facing operations the kernel expects from the warehouse.
- `warehouse-summary.mjs`: local proof that the kernel can inspect the current warehouse.

## Design Decision

Do not copy all warehouse content into `sage-kernel`.

The warehouse should remain independently maintainable. The kernel should query it through:

- local index reads for fast inspection
- existing warehouse CLI
- existing warehouse MCP server
- future kernel MCP facade tools

## Completion Criteria

- Memory schema exists.
- Warehouse MCP tool contract exists.
- Local summary script reads the current warehouse.
- Phase 2 validation passes through `npm run warehouse:summary`.
