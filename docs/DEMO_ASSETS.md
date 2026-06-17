# Demo Assets

This document defines the public demo package for Sage Kernel.

## Required Screens

Capture these screens before a public release:

1. MCP client connected to `sage-kernel`.
2. `kernel.workflow.daily_summary` response.
3. Dashboard overview at `http://127.0.0.1:8787`.
4. Dashboard workflow approval request.
5. Runbook dry-run result.
6. Soak report with memory delta.

## Demo Commands

```bash
npm run verify:fresh-install
npm run mcp:smoke
npm run runbooks:execute -- --runbook=runbook_release_verification --step=local_release_check
npm run soak:quick
npm run dashboard:serve
```

For a live dashboard stress shot, start the dashboard first and run:

```bash
npm run soak:run -- --profile=local --dashboard --url=http://127.0.0.1:8787 --endpoint=/health
```

## Video Storyboard

Length: 60 to 90 seconds.

1. Open with the control loop: MCP client, kernel runtime, approvals, jobs, tests, dashboard.
2. Show a developer asking the MCP client to summarize project state.
3. Show the dashboard cockpit with health, jobs, approvals, and runbooks.
4. Request an approval-gated runbook execution.
5. Run the approved step and show the audit/artifact record.
6. Run the quick soak profile and show memory delta.
7. End with install commands and the GitHub repo.

## Visual Assets

- `assets/sage-kernel-architecture.svg`
- `assets/sage-kernel-workflow.svg`
- `assets/sage-kernel-control-loop.svg`

The SVG files are safe for GitHub rendering. Motion appears when opened directly in a browser and degrades to a static diagram in Markdown.
