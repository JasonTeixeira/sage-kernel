# Rollback Runbook

## Preconditions

- Identify the failed release version.
- Identify the last known good artifact or deployment.
- Freeze further production deploys.
- Confirm database migration status.

## Rollback Paths

- Vercel: promote previous successful deployment or restore prior alias.
- Docker: redeploy previous image digest.
- Database: restore from backup or apply verified down migration only when safe.
- DNS/Edge: restore previous record or worker version.

## Verification

- Health endpoint passes.
- Critical user flow passes.
- Error rate returns to baseline.
- QA fast profile passes.
- Incident note is written.
