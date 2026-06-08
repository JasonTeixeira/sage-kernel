# Phase 3: QA OS Integration

Phase 3 makes `nexural-qa-os` the quality gate for every kernel-generated project.

## Observed Source Capability

The existing QA OS repo already provides:

- 78 runner directories
- manifest-driven quality profiles
- CLI package
- MCP server package
- DAG, evidence, cache, observability, storage, RBAC, audit-log, and control-plane packages
- fast, standard, thorough, deep, and smart QA concepts
- signed evidence and release readiness concepts

## Kernel Contract

The kernel adapter defines:

- `profiles.json`: default QA profiles by project template.
- `run-report.schema.json`: normalized run report shape for MCP and dashboard consumers.
- `tool-contract.json`: MCP-facing operations expected from QA OS.
- `qa-summary.mjs`: local proof that the kernel can inspect the current QA OS.

## Design Decision

Do not rebuild QA OS inside `sage-kernel`.

The kernel should select profiles, call QA OS, normalize outputs, store evidence references, and block deploys when hard blockers exist.

## Completion Criteria

- Template IDs map to QA profiles.
- QA run report schema exists.
- QA MCP tool contract exists.
- Local summary script reads current QA OS capability.
