# Web App Agent Profile

Use this profile for React, Next.js, Express, API, dashboard, and browser-based
applications.

## Required Checks

- Unit tests for domain logic and components.
- API or integration tests for backend routes.
- Playwright E2E for critical user journeys.
- Accessibility checks for keyboard navigation, labels, contrast, and landmarks.
- Performance budget checks for first-load and interaction-sensitive pages.
- Security review mapped to OWASP ASVS for authentication, authorization,
  session handling, input validation, output encoding, secrets, and logging.

## Review Questions

- Can a fresh checkout install, run, test, and build the app?
- Are routes, server actions, and API handlers covered by happy and failure paths?
- Are all user-controlled inputs validated at the boundary?
- Are sensitive values excluded from client bundles, logs, screenshots, and test
  artifacts?
- Does the UI remain usable on mobile and desktop viewports?
