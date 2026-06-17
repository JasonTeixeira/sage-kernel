import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const defaultCatalogPath = path.join("packages", "intelligence", "adapters", "optional-adapters.json");
const mutatingCapabilities = new Set(["apply_refactor", "write_episode", "supersede_fact"]);

export function listAdapters(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const catalog = readAdapterCatalog(root, options.catalogPath);
  const env = options.env || process.env;
  const commandExists = options.commandExists || defaultCommandExists;
  const disabledAll = isTruthy(env.SAGE_DISABLE_OPTIONAL_ADAPTERS);
  const adapters = catalog.adapters.map((adapter) => describeAdapter(adapter, { env, commandExists, disabledAll }));
  return {
    version: catalog.version,
    adapters,
    summary: summarizeAdapters(adapters)
  };
}

export function validateAdapters(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const failures = [];
  const catalog = readAdapterCatalog(root, options.catalogPath, failures);
  const ids = new Set();
  for (const [index, adapter] of arrayItems(catalog.adapters).entries()) {
    const label = `adapters[${index}]`;
    requireString(adapter.id, /^adapter_[a-z0-9][a-z0-9_-]*$/, `${label}.id`, failures);
    if (ids.has(adapter.id)) failures.push(`${label}.id duplicates ${adapter.id}`);
    ids.add(adapter.id);
    requireString(adapter.name, null, `${label}.name`, failures);
    requireEnum(adapter.kind, ["semantic-code", "memory", "qa", "orchestration"], `${label}.kind`, failures);
    requireEnum(adapter.mode, ["local", "mcp", "external"], `${label}.mode`, failures);
    if (typeof adapter.builtIn !== "boolean") failures.push(`${label}.builtIn must be boolean`);
    requireStringArray(adapter.capabilities, `${label}.capabilities`, failures, { minItems: 1 });
    requireEnum(adapter.mutationPolicy, ["read_only", "approval_required", "disabled"], `${label}.mutationPolicy`, failures);
    requireString(adapter.permission, /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/, `${label}.permission`, failures);
    requireString(adapter.installHint, null, `${label}.installHint`, failures);
    for (const key of ["commandEnv", "urlEnv", "disableEnv"]) {
      if (adapter[key] !== undefined) requireString(adapter[key], /^[A-Z][A-Z0-9_]*$/, `${label}.${key}`, failures);
    }
    const requiresApproval = arrayItems(adapter.capabilities).some((capability) => mutatingCapabilities.has(capability));
    if (requiresApproval && adapter.mutationPolicy !== "approval_required") {
      failures.push(`${label}.mutationPolicy must be approval_required for mutating capabilities`);
    }
    if (!adapter.builtIn && !adapter.commandEnv && !adapter.urlEnv) {
      failures.push(`${label} must define commandEnv or urlEnv when it is not built in`);
    }
  }
  return {
    status: failures.length === 0 ? "passed" : "failed",
    checked: { adapters: arrayItems(catalog.adapters).length },
    failures
  };
}

export function adaptersSmoke(options = {}) {
  const validation = validateAdapters(options);
  const discovery = listAdapters(options);
  const hasLocal = discovery.adapters.some((adapter) => adapter.id === "adapter_semantic_local" && adapter.status === "available");
  return {
    status: validation.status === "passed" && hasLocal ? "passed" : "failed",
    validation,
    discovery
  };
}

function describeAdapter(adapter, { env, commandExists, disabledAll }) {
  const command = adapter.commandEnv ? env[adapter.commandEnv] || null : null;
  const url = adapter.urlEnv ? env[adapter.urlEnv] || null : null;
  const disabled = disabledAll || isTruthy(adapter.disableEnv ? env[adapter.disableEnv] : "");
  const status = adapterStatus(adapter, { command, url, disabled, commandExists });
  const reasons = adapterReasons(adapter, { command, url, disabled, commandExists, status });
  return {
    id: adapter.id,
    name: adapter.name,
    kind: adapter.kind,
    mode: adapter.mode,
    status,
    capabilities: adapter.capabilities,
    mutationPolicy: adapter.mutationPolicy,
    permission: adapter.permission,
    configured: Boolean(command || url || adapter.builtIn),
    env: {
      command: adapter.commandEnv || null,
      url: adapter.urlEnv || null,
      disable: adapter.disableEnv || null
    },
    connection: {
      command,
      url
    },
    reasons,
    installHint: adapter.installHint
  };
}

function adapterStatus(adapter, { command, url, disabled, commandExists }) {
  if (disabled) return "disabled";
  if (adapter.builtIn) return "available";
  if (url) return "available";
  if (command) return commandExists(command) ? "available" : "degraded";
  return "missing";
}

function adapterReasons(adapter, { command, url, disabled, commandExists, status }) {
  if (disabled) return ["Adapter disabled by environment."];
  if (adapter.builtIn) return ["Built-in adapter is always available."];
  if (url) return [`Configured with ${adapter.urlEnv}.`];
  if (command) {
    return commandExists(command)
      ? [`Configured command found from ${adapter.commandEnv}.`]
      : [`Configured command from ${adapter.commandEnv} was not found on PATH.`];
  }
  if (status === "missing") return [`Set ${adapter.commandEnv} or ${adapter.urlEnv} to enable this optional adapter.`];
  return [];
}

function summarizeAdapters(adapters) {
  return adapters.reduce(
    (summary, adapter) => {
      summary.total += 1;
      summary[adapter.status] = (summary[adapter.status] || 0) + 1;
      return summary;
    },
    { total: 0, available: 0, missing: 0, degraded: 0, disabled: 0 }
  );
}

function readAdapterCatalog(root, catalogPath = defaultCatalogPath, failures = []) {
  const fullPath = path.isAbsolute(catalogPath) ? catalogPath : path.join(root, catalogPath);
  try {
    const catalog = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    if (!Number.isInteger(catalog.version) || catalog.version < 1) failures.push("optional-adapters.json.version must be an integer >= 1");
    if (!Array.isArray(catalog.adapters)) failures.push("optional-adapters.json.adapters must be an array");
    return { version: catalog.version || 1, adapters: arrayItems(catalog.adapters) };
  } catch (error) {
    failures.push(`Invalid optional adapter catalog: ${error.message}`);
    return { version: 1, adapters: [] };
  }
}

function defaultCommandExists(command) {
  const executable = String(command).trim().split(/\s+/)[0];
  if (!executable) return false;
  const result = spawnSync("command", ["-v", executable], {
    shell: true,
    encoding: "utf8",
    timeout: 3000
  });
  return result.status === 0;
}

function isTruthy(value) {
  return value === "1" || value === "true" || value === "yes";
}

function arrayItems(value) {
  return Array.isArray(value) ? value : [];
}

function requireString(value, pattern, label, failures) {
  if (typeof value !== "string" || value.length === 0) {
    failures.push(`${label} must be a non-empty string`);
    return;
  }
  if (pattern && !pattern.test(value)) failures.push(`${label} has invalid format: ${value}`);
}

function requireStringArray(value, label, failures, options = {}) {
  if (!Array.isArray(value)) {
    failures.push(`${label} must be an array of strings`);
    return;
  }
  if (options.minItems && value.length < options.minItems) failures.push(`${label} must contain at least ${options.minItems} item`);
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) failures.push(`${label} must contain only non-empty strings`);
  }
}

function requireEnum(value, values, label, failures) {
  if (!values.includes(value)) failures.push(`${label} must be one of: ${values.join(", ")}`);
}
