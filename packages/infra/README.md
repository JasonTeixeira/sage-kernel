# Infra Engine

The Infra Engine turns a project template into a production infrastructure plan.

Phase 5 is local-only and non-destructive. It does not provision cloud resources. It emits plans and reusable templates that later MCP tools can call.

## Commands

Validate infra contracts:

```bash
npm run infra:validate
```

Generate an infra plan:

```bash
npm run infra:plan -- --template next-saas-app --target vercel
npm run infra:plan -- --template fastapi-service --target docker
```

Optional output file:

```bash
npm run infra:plan -- --template next-ai-app --target vercel --out generated/infra-plan.json
```

## Boundaries

The Infra Engine may:

- generate local plans
- emit local config templates
- recommend cloud services
- define environment and secret contracts

The Infra Engine must not:

- create cloud resources without approval
- mutate Vercel/AWS/GCP/Azure/Supabase
- write secrets
- deploy code
- delete infrastructure

