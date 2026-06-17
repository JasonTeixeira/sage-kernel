# Security Policy

## Supported Versions

Security fixes target the current `main` branch until formal release channels are introduced.

## Reporting A Vulnerability

Do not open public issues for suspected vulnerabilities. Email the maintainer or use a private GitHub security advisory when the repository is public.

Include:

- affected version or commit
- reproduction steps
- expected and actual behavior
- impact assessment
- any logs with secrets removed

## Security Boundaries

Sage Kernel is a local-first control plane. Networked and mutating actions must remain explicit, scoped, and auditable.

- Secrets must live in environment variables or local ignored files.
- `.env`, `.env.*`, `.sage-kernel/`, generated projects, and SQLite files must not be committed.
- External publishing, pushing, paid jobs, deploys, and credential changes require explicit human approval.
- MCP tools with write or external side effects must declare permissions and approval requirements.

## Verification

Run before release:

```bash
npm run security:scan
npm audit --audit-level=moderate
npm test
npm run test:coverage
npm run release:pack
```
