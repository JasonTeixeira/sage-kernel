# Release Process

Sage Kernel releases must be reproducible from a clean checkout.

## Required Gates

```bash
npm ci
npm run test:coverage
npm run catalog:validate
npm run infra:validate
npm run jobs:validate
npm run mcp:validate
npm run mcp:contracts
npm run mcp:smoke
npm run template:validate-blueprints
npm run v03:validate
npm run security:scan
npm audit
npm run qa:gate
npm run release:check
git diff --check
```

## Coverage Gates

`npm run test:coverage` enforces:

- Lines: 98%+
- Branches: 90%+
- Functions: 97%+

Do not lower these thresholds to ship a release.

## Packaging

Run:

```bash
npm run release:pack
```

Review the tarball contents. Source, docs, MCP manifests, dashboard runtime, worker runtime,
templates, security docs, and CLI files must be included.

## Fresh Install Verification

Run:

```bash
npm run verify:fresh-install
```

This clones the current repository into a temp directory, installs dependencies, validates
the MCP surface, builds the dashboard, and dry-packs the release.

## Versioning

- Patch: bug fixes, docs, test hardening, non-breaking CLI polish.
- Minor: new MCP tools/resources/prompts, new templates, new dashboard workflows.
- Major: breaking MCP contracts, removed tools, incompatible persistence changes.
