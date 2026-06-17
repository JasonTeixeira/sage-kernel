# Sage Kernel Persistence

Sage Kernel uses SQLite as the local default and includes a Postgres adapter path for long-lived deployments.

## SQLite Local Runtime

The default database lives at:

```text
.sage-kernel/kernel.db
```

SQLite is the active default for the MCP server, dashboard, approvals, jobs, audit events, and local daily use.

Initialize and inspect it:

```bash
npm run db:init
npm run db:migrate
npm run db:summary
```

`db:migrate` applies and records versioned migrations in `schema_migrations`.
It is idempotent and is the command to run before daily use, before imports,
and during release verification.

Tracked tables:

- `projects`
- `job_queue`
- `job_runs`
- `approvals`
- `decisions`
- `artifacts`
- `audit_events`
- `schema_migrations`

## Backup And Restore

Create a binary SQLite backup:

```bash
npm run db:backup
```

Restore from a backup:

```bash
npm run db:restore -- .sage-kernel/backups/kernel-2026-01-01T00-00-00-000Z.db
```

Restore replaces the local `.sage-kernel/kernel.db` file with the selected backup.

## JSON Export And Import

Create a full JSON export:

```bash
npm run db:export -- --out=.sage-kernel/exports/kernel.json
```

Create a redacted export for bug reports:

```bash
npm run db:export -- --redacted --out=.sage-kernel/exports/kernel-redacted.json
```

Import an export:

```bash
npm run db:import -- .sage-kernel/exports/kernel.json
```

JSON import clears and recreates the known kernel tables from the export payload. Use a backup before importing into an important local database.

## Redaction

Redacted exports preserve table and row shape while replacing secret-looking JSON fields. Redaction covers keys containing:

- `token`
- `secret`
- `password`
- `apikey`
- `api_key`
- `authorization`

Use redacted exports when sharing issue reports or diagnostics.

## Postgres Adapter Path

Set:

```bash
SAGE_DB_PROVIDER=postgres
DATABASE_URL=postgresql://user:password@host:5432/database
```

The DB adapter supports:

- schema initialization from `packages/db/postgres.schema.sql`
- parameterized `execute`
- row-returning `query`
- scalar reads
- batched transactions with rollback on failure
- explicit connection close

Print the schema:

```bash
npm run db:postgres:schema
```

Current boundary: SQLite remains the wired runtime backend for jobs, approvals, dashboard, and MCP server local operation. The Postgres adapter is implemented and tested at the DB adapter layer; the next production-deployment step is wiring the runtime, approval ledger, and job queue to async Postgres repositories end to end.

## Verification

Persistence is covered by:

```bash
node --test --test-concurrency=1 tests/db-adapter.test.mjs
npm run db:summary
npm run db:migrate
npm run db:backup
npm run db:export -- --redacted --out=.sage-kernel/exports/kernel-redacted-test.json
npm run db:postgres:schema
```
