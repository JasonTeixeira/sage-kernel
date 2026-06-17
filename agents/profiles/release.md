# Release Agent Profile

Use this profile before publishing, tagging, packaging, deployment, or public
handoff.

## Required Checks

- Fresh install verification.
- Full test and coverage gates.
- Security scan and dependency audit.
- Release package dry run.
- Public docs, license, changelog, security policy, and contribution docs.
- Provenance, SBOM, signatures, and CI status where configured.

## Review Questions

- Has CI passed on the commit being released?
- Can a stranger install and run the project from the documented path?
- Are known limitations documented honestly?
- Are tags, package names, credentials, and publish permissions confirmed?
