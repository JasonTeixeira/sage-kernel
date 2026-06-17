# DB Persistence

Sage Kernel uses local SQLite for durable local state:

- projects
- job queue
- job runs
- approvals
- decisions
- artifacts
- audit events

The database is stored at:

```text
.sage-kernel/kernel.db
```

It is ignored by git.

Commands:

```bash
npm run db:init
npm run db:migrate
npm run db:summary
npm run db:backup
npm run db:restore -- .sage-kernel/backups/kernel-2026-01-01T00-00-00-000Z.db
npm run db:export -- --out=.sage-kernel/exports/kernel.json
npm run db:export -- --redacted --out=.sage-kernel/exports/kernel-redacted.json
npm run db:import -- .sage-kernel/exports/kernel.json
npm run db:postgres:schema
```

`db:migrate` records versioned schema migrations in `schema_migrations`. It is safe to rerun and reports which migrations were applied or skipped.

Use redacted exports for bug reports. Redacted exports preserve row shape while replacing secret-looking JSON fields such as tokens, passwords, API keys, and authorization values.

Postgres adapter support is available through `createPostgresAdapter()` and `SAGE_DB_PROVIDER=postgres` / `DATABASE_URL`. SQLite remains the default wired runtime backend. See `docs/PERSISTENCE.md` for the full persistence contract and current Postgres boundary.
