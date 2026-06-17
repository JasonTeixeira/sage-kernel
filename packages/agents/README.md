# Sage Agent Pack

The Sage Agent Pack turns Sage Kernel into a reusable global agent operating
layer. It provides a canonical `AGENTS.md`, role-specific SDLC profiles, local
validation, install/doctor commands, and read-only MCP resources.

Common commands:

```bash
npm run agents:validate
sage agents list --json
sage agents install --force --json
sage agents doctor --json
```

Use `SAGE_AGENT_HOME=/path/to/home` during tests or dry runs to avoid writing to
the real user home directory.
