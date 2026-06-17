# QA OS Kernel Adapter

This package defines how Sage Kernel OS uses the existing `nexural-qa-os` repo as its quality gate.

The QA OS remains its own source repo. The kernel consumes it through profiles, run contracts, and MCP-facing operations.

## Source QA OS

Set the source repo with:

```bash
QA_OS_ROOT=/path/to/nexural-qa-os
```

If `QA_OS_ROOT` is unset, local summary scripts fail fast with a configuration error.

To allow `kernel.qa.run` to inspect projects outside this repo, set a path-delimited allowlist:

```bash
SAGE_KERNEL_ALLOWED_ROOTS=/path/to/workspace:/path/to/other-workspace
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
