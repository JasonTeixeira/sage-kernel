# Architecture

Sage Kernel is MCP-first and local-first. Its core job is to provide a strict, auditable control plane for software engineering workflows.

## System Overview

```text
MCP Client / CLI / Dashboard
            |
            v
MCP Server and Runtime Dispatcher
            |
            v
Policy, Permissions, Approvals, Audit Events
            |
            v
Tools, Resources, Prompts, Jobs, Templates, QA, Infra
            |
            v
SQLite or Postgres Persistence
```

## Primary Interfaces

### MCP Server

Location:

```text
apps/mcp-server/
```

Responsibilities:

- expose tool definitions from `tools.json`
- expose read-only resources
- expose workflow prompts
- validate contracts
- run smoke tests through the MCP SDK transport
- call into the kernel runtime and policy layer

### CLI

Location:

```text
bin/sage.mjs
```

Responsibilities:

- provide daily commands such as `sage daily`, `sage audit`, and `sage full-qa`
- generate MCP client config
- run doctor checks
- start the MCP server
- call the same MCP tools used by clients

### Dashboard

Location:

```text
apps/dashboard/
```

Responsibilities:

- display health, readiness, tools, jobs, approvals, runs, and metrics
- expose local workflow execution with approval boundaries
- provide a human-friendly cockpit for the same kernel state

### Worker

Location:

```text
apps/worker/
```

Responsibilities:

- define jobs
- enqueue jobs
- claim and execute jobs
- record run history
- support scheduled and manual operations

## Core Packages

### `packages/core`

Runtime primitives:

- tool registry
- runtime dispatcher
- policy checks
- doctor reports
- events
- errors
- schema helpers

### `packages/security`

Security primitives:

- permission metadata
- read-only mode
- approval requests
- approval signatures
- approval verification
- secret scanning

### `packages/db`

Persistence primitives:

- SQLite local default
- Postgres adapter
- migrations
- backup and restore
- export and import

### `packages/templates`

Template primitives:

- blueprint registry
- scaffold generation
- production-readiness artifacts
- validation for generated templates

### `packages/qa`

QA primitives:

- QA profiles
- QA runner
- QA gate
- failure reporting

### `packages/infra`

Infrastructure primitives:

- environment contracts
- deploy target definitions
- readiness checks
- infra plan and emit commands

## Data Flow

1. A user or AI client calls an MCP tool, CLI command, or dashboard action.
2. The request enters the runtime dispatcher.
3. Policy checks decide whether the action is safe, mutating, or approval-required.
4. Safe actions run immediately.
5. Mutating or high-risk actions respect read-only mode and approval boundaries.
6. Results, jobs, approvals, and run history are persisted.
7. Dashboard and MCP resources expose read-only snapshots of the current state.

## Safety Boundaries

The system is intentionally local-first. It should not be exposed on a public network without a separate auth and deployment hardening layer.

Important boundaries:

- MCP tools declare risk and permission metadata.
- Read-only mode blocks mutating tools.
- Approval-required tools use signed approvals.
- Secret scanning runs as part of release checks.
- Filesystem and project-root boundaries are validated in workflows that touch local paths.

## Persistence Choices

SQLite is the local default because it keeps installation simple and reliable.

Postgres is supported for production-style integration and is tested both locally and in CI through a real Postgres service.

## Extension Points

The intended extension model is:

- add new MCP tools through the manifest and runtime registry
- add resources for read-only state
- add prompts for repeatable workflows
- add templates for app scaffolding
- add jobs for scheduled operations
- add QA profiles for project types
- add infra targets for deployment patterns

Every extension should include docs, tests, contract updates, and release-gate coverage.
