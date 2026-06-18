# Sage Review Engine

The review package defines the machine-readable contract and deterministic
runtime for senior engineering review reports. It is designed for CLI, MCP, CI,
and agent-council use.

Current scope:

- Review report schema.
- Valid fixture.
- Score and status helpers.
- Repository inspection.
- Architecture, clean-code, test, security, and release category scoring.
- Risk-aware diff review with severity and confidence.
- Route/API to test mapping.
- Senior review report generation.
- CLI and MCP tool surfaces.

Run:

```bash
npm run review:validate
npm run review:senior
sage review senior . --json
```
