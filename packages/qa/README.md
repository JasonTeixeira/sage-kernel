# QA OS Kernel Adapter

This package defines how Sage Kernel OS uses the existing `nexural-qa-os` repo as its quality gate.

The QA OS remains its own source repo. The kernel consumes it through profiles, run contracts, and MCP-facing operations.

## Source QA OS

Default local source:

```text
/Users/Sage/.graphify/repos/JasonTeixeira/nexural-qa-os
```

Observed capability:

- 78 runner directories
- CLI package
- MCP server package
- DAG execution package
- evidence package
- cache package
- observability package
- RBAC, audit log, billing, storage, control-plane packages
- manifest-driven QA profiles
- signed evidence and release readiness concepts

## Kernel Role

The kernel uses QA OS for:

- assigning project QA profiles during scaffolding
- planning test gates before implementation
- running fast/standard/thorough/deep modes
- collecting evidence bundles
- blocking unsafe deploys
- explaining release readiness
- generating portfolio-grade proof artifacts

