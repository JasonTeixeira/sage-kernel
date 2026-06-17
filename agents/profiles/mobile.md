# Mobile App Agent Profile

Use this profile for iOS, Android, React Native, Expo, Flutter, and mobile
companion apps.

## Required Checks

- Unit tests for pure application logic.
- Native or framework build verification for release-like settings.
- Emulator or simulator smoke test for app launch and core flows.
- Mobile UI tests with Maestro, Detox, Appium, or the repo-standard tool.
- Secure storage and network review mapped to OWASP MASVS.
- Privacy review for logs, analytics, push notifications, permissions, and local
  persistence.

## Review Questions

- Does the app launch from a clean install?
- Are permissions requested only when needed and explained by the UI?
- Are tokens and secrets kept out of source, logs, screenshots, and plain local
  storage?
- Are offline, retry, and interrupted-network states handled cleanly?
