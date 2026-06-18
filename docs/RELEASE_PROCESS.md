# Release Process

Sage Kernel releases must be reproducible from a clean checkout.

## Required Gates

```bash
npm ci
npm run test:coverage | tee /tmp/sage-coverage-output.txt
npm run coverage:critical -- /tmp/sage-coverage-output.txt
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

`npm run coverage:critical -- /tmp/sage-coverage-output.txt` also prevents branch
coverage regression on critical files. See [Quality Ratchet](QUALITY_RATCHET.md).

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
- Runtime: Node `22.14.0` or newer and npm `11.10.0` or newer.
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

Before publishing the first npm release, prefer GitHub Actions provenance over a
local publish. The current package sets `publishConfig.provenance=true`, so a
local `npm publish` will fail outside a supported CI/OIDC provider with
`Automatic provenance generation not supported for provider: null`.

First-publish options:

1. Provenance-first release:
   - Create a publish-capable npm token in npm.
   - Store it as the GitHub secret `NPM_TOKEN`.
   - Publish a GitHub Release and let `.github/workflows/release.yml` run
     `npm publish --provenance --access public` on a GitHub-hosted runner.
   - Verify the npm package exists and shows provenance.
2. Bootstrap exception:
   - Temporarily publish without provenance from a trusted local account.
   - Immediately configure trusted publishing.
   - Treat this as a documented supply-chain exception. Do not call this a
     full premium provenance release.

After the package exists, configure npm trusted publishing for:

- Repository: `JasonTeixeira/sage-kernel`
- Workflow filename: `release.yml`
- Event: published GitHub release
- Allowed action: `npm publish`

For a brand-new npm package, the package name must exist before `npm trust`
can manage trusted publishing from the CLI. After the first package exists, run:

```bash
npx npm@latest trust github sage-kernel --repo JasonTeixeira/sage-kernel --file release.yml --allow-publish
```

After the trust relationship exists, future releases should publish through
GitHub Actions instead of local `npm publish`.

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

Record final local, CI, npm, MCP-client, and soak evidence in
[Release Proof](RELEASE_PROOF.md) or in the GitHub Release notes.

## Versioning

- Patch: bug fixes, docs, test hardening, non-breaking CLI polish.
- Minor: new MCP tools/resources/prompts, new templates, new dashboard workflows.
- Major: breaking MCP contracts, removed tools, incompatible persistence changes.
