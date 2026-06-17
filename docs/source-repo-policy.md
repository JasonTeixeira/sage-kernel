# Source Repo Policy

Sage Kernel OS must not rip apart existing repos.

## Rule

Existing repos are upstream source systems. They stay intact.

The kernel may:

- reference source repos in catalogs
- inspect source repos
- query source repos through MCP, CLI, or local scripts
- create adapters that call source repo capabilities
- copy a reusable template or pattern into the kernel only when explicitly promoted
- create example links or generated project plans based on source repo knowledge

The kernel must not:

- move code out of source repos
- delete code from source repos
- rewrite source repo structure
- merge whole repos into the kernel without approval
- treat source repos as disposable parts bins
- mutate source repos as part of normal kernel operation

## Why

The correct architecture is federation, not extraction.

`ai-warehouse`, `nexural-qa-os`, `nexural-meta`, and other source repos are independent assets. Sage Kernel OS should orchestrate them through contracts, adapters, and registries.

## Promotion Path

When a reusable artifact is worth bringing into the kernel:

1. Identify the artifact and source repo.
2. Create a small adapter or copied template in `sage-kernel`.
3. Preserve attribution to the source repo.
4. Do not remove the original.
5. Validate the copied/adapted artifact with kernel tests.

## Existing Federation Sources

Federated source repos are optional local inputs. Configure them with environment variables instead of committing personal filesystem paths:

```bash
SAGE_KERNEL_SOURCE_ROOT=/path/to/source/repos
AI_WAREHOUSE_ROOT=/path/to/ai-warehouse
QA_OS_ROOT=/path/to/nexural-qa-os
```

Sage Kernel OS should preserve federated source work and treat it as prior architecture, not overwrite it.
