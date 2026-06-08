# Phase 5: Infra Engine

Phase 5 adds local production infrastructure planning.

This phase is intentionally plan-only. It does not provision, deploy, mutate cloud projects, or write secrets.

## Built Artifacts

- `packages/infra/env-contract.json`
- `packages/infra/deploy-targets.json`
- `packages/infra/readiness-checks.json`
- `packages/infra/templates/docker/node.Dockerfile`
- `packages/infra/templates/docker/python-fastapi.Dockerfile`
- `packages/infra/templates/github-actions/quality-gate.yml`
- `packages/infra/templates/runbooks/rollback.md`
- `packages/infra/scripts/validate-infra.mjs`
- `packages/infra/scripts/infra-plan.mjs`

## Commands

```bash
npm run infra:validate
npm run infra:plan -- --template next-saas-app --target vercel
npm run infra:plan -- --template fastapi-service --target docker
```

## Production Boundary

All cloud/resource mutations require explicit approval.

Allowed by default:

- local plan generation
- local template emission
- readiness check selection
- environment variable naming

Requires approval:

- deploying
- provisioning cloud infra
- mutating DNS/domains
- changing secrets
- applying database migrations
- deleting resources
