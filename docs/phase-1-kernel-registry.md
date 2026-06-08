# Phase 1: Kernel Registry

Phase 1 creates the durable source of truth that later MCP tools will use.

This registry is non-destructive. It records how repos participate in the kernel, but it does not move, delete, or rewrite source repos.

## Built Artifacts

- `catalog/repos.json`: consolidation plan for existing repos.
- `catalog/modules.json`: target kernel modules and current/target capability scores.
- `catalog/templates.json`: reusable app/system templates and default QA profiles.
- `catalog/integrations.json`: external systems, capabilities, and action boundaries.
- `catalog/phases.json`: roadmap with machine-readable completion criteria.
- `scripts/validate-catalog.mjs`: validation gate for catalog quality.

## Engineering Rule

The kernel should never depend on memory-only repo knowledge. Every tool should read from the catalog first, then inspect code only when it needs implementation detail.

## Next Phase

Phase 2 integrates `ai-warehouse` as the memory and retrieval layer for repo summaries, architecture decisions, previous fixes, prompts, and reusable patterns.
