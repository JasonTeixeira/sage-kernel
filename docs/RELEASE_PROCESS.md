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
npm run public:validate
npm run release:provenance
npm run release:check
npm run verify:fresh-install
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

## Provenance

Sage Kernel publishes through GitHub Actions using npm provenance.

Required release workflow properties:

- Trigger: GitHub Release `published`.
- Runner: GitHub-hosted `ubuntu-latest`.
- Permissions: `contents: read` and `id-token: write`.
- Node setup: npm registry set to `https://registry.npmjs.org`.
- Release build cache: package-manager cache disabled.
- Publish command: `npm publish --provenance --access public`.

The package also declares:

```json
{
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

Validate the release/provenance configuration with:

```bash
npm run release:provenance
```

Before publishing the first npm release, configure npm trusted publishing for:

- Repository: `JasonTeixeira/sage-kernel`
- Workflow: `.github/workflows/release.yml`
- Event: published GitHub release

## Fresh Install Verification

Run:

```bash
npm run verify:fresh-install
```

This clones the current repository into a temp directory, installs dependencies, validates
the MCP surface, builds the dashboard, and dry-packs the release.

## Release Workflow

1. Confirm the worktree is clean.
2. Confirm CI is green on `main`.
3. Run the required gates locally.
4. Update `CHANGELOG.md`.
5. Bump `package.json` and `package-lock.json` together.
6. Commit with a release message.
7. Create a signed tag named `vX.Y.Z`.
8. Publish a GitHub Release for that tag.
9. Watch the `Release` workflow publish to npm with provenance.
10. Verify the npm package page shows provenance after publish.

## Versioning

- Patch: bug fixes, docs, test hardening, non-breaking CLI polish.
- Minor: new MCP tools/resources/prompts, new templates, new dashboard workflows.
- Major: breaking MCP contracts, removed tools, incompatible persistence changes.
