# Intelligence Contracts

This package contains the first implementation layer for Sage Kernel's
intelligence systems.

The contracts are intentionally dependency-light. They define the data shapes
for future memory, eval, experiment, runbook, and semantic-code adapter systems
before mutating MCP tools are added.

## Contracts

- `memory-record.schema.json`
- `eval-definition.schema.json`
- `experiment-run.schema.json`
- `runbook.schema.json`
- `semantic-adapter.schema.json`

## Validation

Run:

```bash
npm run intelligence:validate
```

The validator checks the schema files and bundled valid fixtures. It is also
importable from tests for invalid-fixture coverage.

