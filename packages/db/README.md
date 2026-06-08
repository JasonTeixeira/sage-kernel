# DB Persistence

Sage Kernel uses local SQLite for durable local state:

- projects
- job queue
- job runs
- approvals
- decisions
- artifacts

The database is stored at:

```text
.sage-kernel/kernel.db
```

It is ignored by git.

Commands:

```bash
npm run db:init
npm run db:summary
```
