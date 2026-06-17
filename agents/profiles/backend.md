# Backend Agent Profile

Use this profile for APIs, workers, queues, CLIs, databases, migrations, and
service runtime code.

## Required Checks

- Unit tests for domain logic and validation.
- Integration tests for persistence, queues, and external adapters.
- Migration tests for forward and rollback behavior when supported.
- Load or stress tests for queue, API, or hot-path behavior.
- Structured logging and auditable failure states.
- Permission checks for every mutating or sensitive operation.

## Review Questions

- Are inputs validated before hitting persistence or command execution?
- Are transactions, retries, timeouts, and idempotency handled intentionally?
- Can failures be explained from logs or persisted run records?
- Are destructive operations approval-gated?
