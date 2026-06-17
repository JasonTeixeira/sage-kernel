# Sage Kernel Security Model

Sage Kernel is local-first and MCP-first. Its security model assumes an MCP client,
dashboard user, worker, or CLI may request actions with different risk levels. The
kernel must make those risk levels explicit, auditable, and enforceable.

## Trust Boundaries

- MCP clients are callers, not trusted administrators.
- The dashboard is a local cockpit, not a bypass around MCP policy.
- Worker jobs may execute local commands only through registered jobs.
- Database records are audit evidence and must not contain raw secrets.
- External services are read-only by default unless a documented tool requires otherwise.

## Tool Risk Classes

- `safe`: Read-only or deterministic local inspection.
- `local-read`: Reads local files or project state.
- `local-compute`: Runs bounded local work such as QA or stress checks.
- `mutating`: Writes local state, queues jobs, or creates artifacts.
- `external`: Talks to external services or may change remote state.
- `destructive`: Deletes, overwrites, publishes, pushes, or performs irreversible changes.

## Approval Rules

- Mutating, external, and destructive workflows require explicit permission review.
- Dashboard workflows that run expensive or mutating actions request signed approvals.
- Approval signatures are tamper-evident and scoped to action plus payload.
- Approval checks fail closed on unknown approvals, mismatched actions, mismatched payloads,
  pending status, or invalid signatures.
- Permission scopes support exact grants such as `catalog:read` and bounded wildcard
  grants such as `dashboard.workflow:*`. Global `*` is intended only for trusted local
  development.

## Filesystem Rules

- Project paths must remain inside the configured workspace/root unless a tool explicitly
  documents a broader read boundary.
- Tools must not accept arbitrary command strings.
- Filesystem inputs require root-boundary validation before use.
- Template generation must refuse to overwrite existing output directories unless the user
  explicitly selects an overwrite path in a future approved workflow.

## Secret Handling

- Secrets belong in environment variables, never committed fixtures.
- `.env.local` is treated as local/private state.
- Audit events redact secret-like keys before persistence.
- Security scans run before release packaging.
- Error messages should describe remediation without dumping credentials.

## Database Security

- SQLite is the local default.
- Postgres is the production/team option.
- Writes must use parameterized statements where supported.
- Migrations are forward-only and recorded in `schema_migrations`.
- Backups and exports should be treated as sensitive artifacts.

## MCP Client Guidance

Use the smallest necessary permission set for the client. Prefer read-only workflows until
you understand the tool surface. Run:

```bash
npm run doctor -- --fast
npm run mcp:smoke
```

before granting broad local access.

## Non-Goals

- Sage Kernel is not a remote multi-tenant SaaS authorization server.
- Sage Kernel does not replace host OS sandboxing.
- Sage Kernel does not guarantee safety if a user manually runs arbitrary shell commands
  outside the kernel control plane.
