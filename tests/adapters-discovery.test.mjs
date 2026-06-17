import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { adaptersSmoke, listAdapters, validateAdapters } from "../packages/intelligence/adapters.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("optional adapter registry validates and discovers default clean-install state", () => {
  const validation = validateAdapters({ root });
  assert.equal(validation.status, "passed");
  assert.deepEqual(validation.failures, []);
  assert.equal(validation.checked.adapters, 3);

  const discovery = listAdapters({
    root,
    env: {},
    commandExists: () => false
  });
  assert.equal(discovery.summary.total, 3);
  assert.equal(discovery.summary.available, 1);
  assert.equal(discovery.summary.missing, 2);

  const local = discovery.adapters.find((adapter) => adapter.id === "adapter_semantic_local");
  assert.equal(local.status, "available");
  assert.equal(local.mutationPolicy, "read_only");
  assert.equal(local.configured, true);

  const serena = discovery.adapters.find((adapter) => adapter.id === "adapter_serena_mcp");
  assert.equal(serena.status, "missing");
  assert.match(serena.reasons[0], /SAGE_SERENA_MCP_COMMAND/);
  assert.equal(serena.connection.command, null);
});

test("optional adapter discovery handles command, URL, disabled, and degraded branches", () => {
  const byUrl = listAdapters({
    root,
    env: { SAGE_GRAPHITI_MCP_URL: "http://127.0.0.1:7447" },
    commandExists: () => false
  });
  assert.equal(byUrl.adapters.find((adapter) => adapter.id === "adapter_graphiti_memory").status, "available");

  const byCommand = listAdapters({
    root,
    env: { SAGE_SERENA_MCP_COMMAND: "serena-mcp --stdio" },
    commandExists: (command) => command === "serena-mcp --stdio"
  });
  assert.equal(byCommand.adapters.find((adapter) => adapter.id === "adapter_serena_mcp").status, "available");

  const degraded = listAdapters({
    root,
    env: { SAGE_SERENA_MCP_COMMAND: "missing-serena" },
    commandExists: () => false
  });
  const serena = degraded.adapters.find((adapter) => adapter.id === "adapter_serena_mcp");
  assert.equal(serena.status, "degraded");
  assert.match(serena.reasons[0], /not found/);

  const disabled = listAdapters({
    root,
    env: { SAGE_DISABLE_OPTIONAL_ADAPTERS: "true", SAGE_SERENA_MCP_URL: "http://127.0.0.1:9000" },
    commandExists: () => true
  });
  assert.equal(disabled.summary.disabled, 3);
  assert.equal(disabled.adapters.every((adapter) => adapter.status === "disabled"), true);

  const disabledOne = listAdapters({
    root,
    env: { SAGE_DISABLE_SERENA_ADAPTER: "1", SAGE_SERENA_MCP_URL: "http://127.0.0.1:9000" },
    commandExists: () => true
  });
  assert.equal(disabledOne.adapters.find((adapter) => adapter.id === "adapter_serena_mcp").status, "disabled");
});

test("optional adapter smoke passes without external dependencies", () => {
  const result = adaptersSmoke({
    root,
    env: {},
    commandExists: () => false
  });
  assert.equal(result.status, "passed");
  assert.equal(result.discovery.summary.available, 1);
});

test("optional adapter validator rejects unsafe or malformed catalogs", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-adapters-"));
  const catalogPath = path.join(workspace, "bad-adapters.json");
  fs.writeFileSync(catalogPath, JSON.stringify({
    version: 0,
    adapters: [
      {
        id: "bad",
        name: "",
        kind: "unknown",
        mode: "network",
        builtIn: "yes",
        capabilities: ["apply_refactor"],
        mutationPolicy: "read_only",
        permission: "bad",
        installHint: "",
        commandEnv: "bad-env"
      },
      {
        id: "bad",
        name: "Duplicate",
        kind: "memory",
        mode: "external",
        builtIn: false,
        capabilities: [],
        mutationPolicy: "disabled",
        permission: "memory:read",
        installHint: "Missing connection envs."
      }
    ]
  }));

  const result = validateAdapters({ root, catalogPath });
  const failures = result.failures.join("\n");
  assert.equal(result.status, "failed");
  assert.match(failures, /version must be an integer >= 1/);
  assert.match(failures, /adapters\[0\]\.id has invalid format/);
  assert.match(failures, /adapters\[0\]\.kind must be one of/);
  assert.match(failures, /adapters\[0\]\.mutationPolicy must be approval_required/);
  assert.match(failures, /adapters\[1\] must define commandEnv or urlEnv/);

  fs.writeFileSync(catalogPath, "{");
  assert.match(validateAdapters({ root, catalogPath }).failures.join("\n"), /Invalid optional adapter catalog/);
});

test("optional adapter CLI commands are executable", () => {
  for (const script of ["adapters:validate", "adapters:list", "adapters:smoke"]) {
    const result = spawnSync("npm", ["run", script, "--silent"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const parsed = JSON.parse(result.stdout);
    assert.equal(typeof parsed.status === "string" || Array.isArray(parsed.adapters), true);
  }

  const invalidRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-adapters-invalid-cli-"));
  fs.mkdirSync(path.join(invalidRoot, "packages/intelligence/adapters"), { recursive: true });
  fs.writeFileSync(path.join(invalidRoot, "packages/intelligence/adapters/optional-adapters.json"), JSON.stringify({
    version: 1,
    adapters: [{ id: "", name: "", kind: "unknown", mode: "external", builtIn: false, capabilities: [], mutationPolicy: "disabled", permission: "bad" }]
  }));
  for (const script of [
    "packages/intelligence/scripts/adapters-validate.mjs",
    "packages/intelligence/scripts/adapters-smoke.mjs"
  ]) {
    const result = spawnSync("node", [path.join(root, script)], {
      cwd: invalidRoot,
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /failed/);
  }
});
