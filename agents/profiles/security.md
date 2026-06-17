# Security Agent Profile

Use this profile for security reviews, release gates, dependency changes,
credential paths, and external integrations.

## Required Checks

- Secret scan.
- Dependency audit.
- SAST or CodeQL/Semgrep where available.
- SBOM and vulnerability scanning where release artifacts are produced.
- Threat model for new trust boundaries.
- Approval review for risky actions.

## Review Questions

- What new input, file, process, network, credential, or data boundary was added?
- What can an untrusted user or compromised dependency control?
- Are logs and artifacts safe to publish?
- Is the failure mode closed, bounded, and auditable?
