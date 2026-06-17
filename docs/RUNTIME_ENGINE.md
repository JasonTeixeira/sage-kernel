# Sage Kernel Runtime Engine

Program 2 makes the runtime explicit, testable, auditable, and plugin-ready.

## Boundaries

- `packages/core/tool-registry.mjs` owns tool metadata validation and duplicate detection.
- `packages/core/policy-engine.mjs` owns permission, read-only, external-risk, and approval checks.
- `packages/core/event-bus.mjs` owns in-process lifecycle event collection.
- `packages/core/audit-log.mjs` owns audit-event persistence and secret redaction.
- `packages/core/kernel-error.mjs` owns stable kernel error codes, safe details, and remediation text.
- `packages/core/runtime.mjs` wires these pieces together and dispatches tool handlers.

CLI scripts should remain thin wrappers. Business logic should stay importable and testable.

## Error Model

Runtime and policy failures should throw `KernelError` with:

- `code`
- `message`
- `details`
- `remediation`

Important codes currently include:

- `KERNEL_TOOL_NOT_FOUND`
- `KERNEL_TOOL_INVALID`
- `KERNEL_TOOL_DUPLICATE`
- `KERNEL_PERMISSION_DENIED`
- `KERNEL_READ_ONLY_DENIED`
- `KERNEL_APPROVAL_REQUIRED`
- `KERNEL_EXTERNAL_APPROVAL_REQUIRED`
- `KERNEL_PLUGIN_INVALID`
- `KERNEL_PLUGIN_NOT_ALLOWLISTED`
- `KERNEL_TOOL_FAILED`

MCP clients should surface `message` and `remediation`, not raw stack traces.

## Audit Events

The runtime emits and persists lifecycle events for tool execution:

- `tool.started`
- `tool.finished`
- `tool.failed`

Events are written to `audit_events` when the runtime has a DB adapter. Secret-looking fields are redacted before persistence. Redaction covers keys containing token, secret, password, api key, or authorization.

## Plugin Model

Plugins are disabled by default.

The only supported plugin path today is a reviewed local `.plugin.json` manifest loaded with:

```js
runtime.loadPlugins({
  enabled: true,
  directory: "/absolute/path/to/plugins",
  allowlist: ["plugin-name"]
});
```

Plugin rules:

- Plugin names must be explicitly allowlisted.
- Plugin tools must use the `kernel.plugin.*` namespace.
- Plugin tools must be read-only by default.
- Plugin tools must declare permission, input schema, side effects, and output.
- Plugins are registered through the normal registry and policy engine.

This creates an extension path without allowing arbitrary code execution by default.

## Verification

Program 2 runtime behavior is covered by:

```bash
node --test --test-concurrency=1 tests/core-runtime.test.mjs
npm test
npm run test:coverage
```

The core tests verify:

- dispatch success
- dispatch failure
- duplicate tool registration
- missing metadata
- permission denial
- normalized kernel errors
- audit persistence
- secret redaction
- disabled-by-default plugin loading
- allowlist-gated plugin loading
