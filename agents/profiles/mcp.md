# MCP Agent Profile

Use this profile for MCP servers, tools, resources, prompts, and client setup.

## Required Checks

- Tool manifest validation.
- Contract snapshot generation.
- MCP smoke test against the server transport.
- Strict input schemas and bounded output shapes.
- Read-only resources for inspectable state.
- Approval gates for mutating, destructive, external, paid, or credential actions.

## Review Questions

- Can a clean checkout start the MCP server?
- Can at least one real client config be generated and verified?
- Are resources read-only and bounded?
- Does every tool state risk, permission, examples, and failure modes?
