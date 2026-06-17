# Visual Guide

This repo includes SVG visuals that can be rendered directly by GitHub and opened in a browser.

## Architecture Diagram

![Sage Kernel architecture](../assets/sage-kernel-architecture.svg)

File:

```text
assets/sage-kernel-architecture.svg
```

Use it to explain the system layers: clients, MCP server, policy, runtime, worker, dashboard, persistence, and quality gates.

## Workflow Diagram

![Sage Kernel workflow](../assets/sage-kernel-workflow.svg)

File:

```text
assets/sage-kernel-workflow.svg
```

The workflow diagram includes lightweight SVG motion when opened directly in a browser. In GitHub markdown it remains useful as a static diagram.

## How To Use These Assets

Recommended placements:

- README hero section
- architecture documentation
- release notes
- project website
- demo videos
- GitHub social preview source art

Recommended future assets:

- short MP4 demo of connecting an MCP client
- dashboard walkthrough GIF
- 60-second architecture explainer
- screenshot set for desktop and mobile dashboard states
- generated social preview image for the repository

## Motion Graphics Direction

For professional motion graphics, keep the motion functional:

- show request flow from MCP client to runtime
- show approvals gating risky actions
- show jobs moving through queue, run history, and dashboard
- show QA gates feeding release readiness
- avoid decorative motion that does not explain the system
