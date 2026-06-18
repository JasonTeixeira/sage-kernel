# Sage Kernel

![Sage Kernel architecture](assets/sage-kernel-architecture.svg)

Sage Kernel is an MCP-native engineering operating system for local software work. It gives developers, teams, and AI coding agents one controlled place to inspect a project, run QA, scaffold apps, manage approvals, execute jobs, check release readiness, and view operational state.

The MCP server is the primary product interface. The dashboard is an optional local cockpit. Hosted deployment is optional.

## What It Does

Sage Kernel turns a local repo into a strict engineering control plane:

- Connect an MCP client such as Codex, Claude Desktop, or Cursor.
- Ask the kernel to audit a repo, run QA, explain failures, or prepare a release.
- Generate production-ready app templates from cataloged blueprints.
- Run safe read-only tools without approval and route risky work through approval boundaries.
- Track jobs, runs, approvals, audit records, templates, resources, and dashboard state.
- Use SQLite locally by default, with a tested Postgres path for production-style persistence.
- Run hard quality gates, security scans, stress checks, MCP smoke tests, and release checks.

It is designed as a non-destructive federation layer. Existing repos stay intact; the kernel references, queries, adapts, or copies approved reusable artifacts without rewriting source projects. See [Source Repo Policy](docs/source-repo-policy.md).

## Why It Exists

Modern app building has too many separate surfaces: terminal commands, agent prompts, QA scripts, templates, deployment checks, security scans, approval decisions, run history, and project docs. Sage Kernel brings those surfaces into one auditable local system that both humans and AI coding agents can use.

The practical result:

- A developer can start the day with `sage daily`.
- An AI coding agent can call the MCP server instead of guessing commands.
- A team can standardize project creation, QA, security checks, and release readiness.
- Maintainers can prove behavior through tests, CI, stress scripts, contracts, and docs.

## Quick Start

Requirements:

- Node.js `>=22`
- npm
- SQLite CLI for local DB workflows

Install from a clean checkout:

```bash
git clone https://github.com/JasonTeixeira/sage-kernel.git
cd sage-kernel
npm install
npm link
sage doctor --fast
```

Start the MCP server:

```bash
sage mcp start
```

Generate MCP client config:

```bash
sage mcp config codex --json
sage mcp config claude-desktop --json
sage mcp config cursor --json
```

Run a smoke test:

```bash
sage mcp smoke
```

Open the local dashboard:

```bash
sage dashboard-live
```

By default the dashboard serves on `http://127.0.0.1:8787`.

## Daily Usage

Use these commands from the kernel repo after `npm link`:

```bash
sage daily
sage audit .
sage full-qa .
sage failures '{"status":"failed","checks":[]}'
sage templates
sage create-app worker-service daily-worker
sage release worker-service docker
sage pending
sage stress http://127.0.0.1:8787
```

Common workflows:

- `sage daily`: summarize health, tools, jobs, approvals, and next actions.
- `sage audit .`: run a repo audit workflow against the current project.
- `sage full-qa .`: run the deeper QA workflow for a project path.
- `sage create-app <template> <name>`: scaffold a new app from a production blueprint.
- `sage release <template> <target>`: check release readiness for a template and deployment target.
- `sage pending`: show pending approvals.
- `sage stress <url>`: stress test the dashboard/API endpoint.

More detail: [Usage Guide](docs/USAGE.md).

## MCP Interface

The canonical server entry point is:

```bash
npm run mcp:start
```

The MCP server exposes:

- Tools for catalog search, templates, QA, infra planning, deploy preparation, jobs, approvals, dashboard snapshots, audits, and daily workflows.
- Resources for read-only inspection of kernel state.
- Prompts for repeatable workflows such as auditing a repo, running full QA, preparing a release, and explaining failed jobs.

Docs:

- [MCP Server](docs/MCP_SERVER.md)
- [MCP Clients](docs/MCP_CLIENTS.md)
- [MCP Tools](docs/mcp-tools.md)
- [MCP Resources](docs/mcp-resources.md)
- [MCP Prompts](docs/mcp-prompts.md)

## Architecture

![Sage Kernel workflow](assets/sage-kernel-workflow.svg)

Core layers:

- `apps/mcp-server/`: MCP stdio server, tool manifest, resources, prompts, contracts, smoke tests.
- `apps/dashboard/`: local operations cockpit with health, jobs, approvals, tools, runs, metrics, and workflow controls.
- `apps/worker/`: job definitions, queue commands, worker daemon, run history.
- `packages/core/`: runtime dispatcher, policy checks, doctor, schemas, errors, events.
- `packages/db/`: SQLite and Postgres adapters, migrations, backup, restore, export, import.
- `packages/security/`: signed approvals, permission boundaries, secret scanning.
- `packages/templates/`: production blueprints and scaffold generation.
- `packages/qa/`: QA profiles, runners, and gates.
- `packages/infra/`: infra contracts, plans, and emitters.
- `catalog/`: machine-readable registry of repos, templates, integrations, modules, and phases.

More detail: [Architecture Guide](docs/ARCHITECTURE.md).

## Quality Proof

The project is built around hard gates:

```bash
npm test
npm run test:coverage
npm run coverage:critical -- /tmp/sage-coverage-output.txt
npm run release:check
npm run mcp:smoke
npm run security:scan
npm audit
```

Stress tests:

```bash
npm run stress:queue -- --count=10000
npm run stress:dashboard -- --url=http://127.0.0.1:8787 --count=1000 --concurrency=50
npm run stress:dashboard -- --url=http://127.0.0.1:8787 --endpoint=/health --count=1000 --concurrency=50
```

Postgres integration:

```bash
docker compose -f docker-compose.postgres.yml up -d postgres
SAGE_RUN_POSTGRES_TESTS=1 DATABASE_URL=postgresql://sage:sage@127.0.0.1:55432/sage_kernel npm run postgres:integration
docker compose -f docker-compose.postgres.yml down
```

CI runs the quality gates and a real Postgres integration service on GitHub Actions.

The current CI ratchet prevents branch-coverage regression on critical runtime
modules while the project continues toward 98%+ meaningful branch coverage per
critical file. See [Quality Ratchet](docs/QUALITY_RATCHET.md).

## Documentation Map

- [Install](docs/INSTALL.md)
- [Usage Guide](docs/USAGE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Visual Guide](docs/VISUAL_GUIDE.md)
- [Runtime Engine](docs/RUNTIME_ENGINE.md)
- [Persistence](docs/PERSISTENCE.md)
- [Security Model](docs/SECURITY_MODEL.md)
- [Quality Ratchet](docs/QUALITY_RATCHET.md)
- [Release Process](docs/RELEASE_PROCESS.md)
- [Release Proof](docs/RELEASE_PROOF.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Changelog](CHANGELOG.md)

## Development

```bash
npm install
npm run catalog:validate
npm run mcp:validate
npm run mcp:contracts
npm run test:coverage
npm run release:check
```

Check the dashboard:

```bash
npm run dashboard:serve
npm run dashboard:e2e
```

## Status

Sage Kernel is production-grade for local MCP-native development workflows. It is intended to remain local-first by default. Treat public network exposure as a separate deployment-hardening project.
