# Contributing

## Development Setup

```bash
npm ci
npm run db:init
npm test
```

Optional local source adapters:

```bash
AI_WAREHOUSE_ROOT=/path/to/ai-warehouse
QA_OS_ROOT=/path/to/nexural-qa-os
SAGE_KERNEL_SOURCE_ROOT=/path/to/source/repos
SAGE_KERNEL_ALLOWED_ROOTS=/path/to/workspace
```

Use `:` as the path separator on macOS/Linux and `;` on Windows for multi-root values.

## Quality Gates

Before opening a pull request:

```bash
npm run catalog:validate
npm run infra:validate
npm run jobs:validate
npm run mcp:validate
npm run mcp:contracts
npm run template:validate-blueprints
npm test
npm run test:coverage
npm run qa:gate
npm run mcp:smoke
npm run v03:validate
npm run security:scan
npm audit --audit-level=moderate
```

## Coding Standards

- Keep local state out of git.
- Prefer structured JSON contracts over ad hoc text parsing.
- Keep MCP tool metadata, generated contracts, and docs in sync.
- Add focused regression tests for every bug fix.
- Keep side-effecting tools explicit about permissions, approval requirements, and local/external effects.

## Pull Request Checklist

- Tests and coverage pass.
- Security scan and dependency audit pass.
- Generated MCP contracts are current.
- New public behavior is documented.
- New side effects have a clear approval and rollback path.
