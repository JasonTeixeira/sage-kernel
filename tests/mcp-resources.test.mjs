import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { __resourceTestInternals, kernelResources, registerKernelResources } from "../apps/mcp-server/src/kernel-resources.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("MCP server exposes read-only kernel resources", async () => {
  const client = new Client({ name: "sage-kernel-resource-test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["apps/mcp-server/src/server.mjs"],
    cwd: root
  });
  await client.connect(transport);
  try {
    const listed = await client.listResources();
    const uris = listed.resources.map((resource) => resource.uri).sort();
    assert.deepEqual(uris, [
      "sage://approvals",
      "sage://catalog",
      "sage://dashboard/snapshot",
      "sage://docs/mcp-server",
      "sage://intelligence/contracts",
      "sage://intelligence/evals",
      "sage://intelligence/experiments",
      "sage://intelligence/memory",
      "sage://intelligence/runbooks",
      "sage://intelligence/semantic-adapters",
      "sage://jobs",
      "sage://metrics",
      "sage://runs",
      "sage://templates"
    ]);

    for (const uri of uris) {
      const result = await client.readResource({ uri });
      assert.equal(result.contents.length, 1, uri);
      assert.equal(result.contents[0].uri, uri);
      assert.equal(typeof result.contents[0].text, "string");
      assert.equal(result.contents[0].text.length > 0, true);
    }

    await assert.rejects(() => client.readResource({ uri: "sage://missing" }), /not found|No resource/i);
  } finally {
    await client.close();
  }
});

test("kernel resources provide bounded fallbacks and registration metadata", async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "sage-resources-"));
  for (const dir of ["catalog", "packages/qa", "apps/worker", "docs", "apps/mcp-server", "packages/db"]) {
    fs.mkdirSync(path.join(sandbox, dir), { recursive: true });
  }
  copyDir(path.join(root, "packages/intelligence"), path.join(sandbox, "packages/intelligence"));
  fs.copyFileSync(path.join(root, "packages/db/schema.sql"), path.join(sandbox, "packages/db/schema.sql"));
  fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ version: "fixture" }));
  fs.writeFileSync(path.join(sandbox, "catalog/phases.json"), JSON.stringify({ phases: null }));
  fs.writeFileSync(path.join(sandbox, "catalog/repos.json"), JSON.stringify({ repos: null }));
  fs.writeFileSync(path.join(sandbox, "catalog/modules.json"), JSON.stringify({ modules: null }));
  fs.writeFileSync(path.join(sandbox, "catalog/templates.json"), JSON.stringify({ templates: [{ id: "fixture", qaProfile: "default", coverage: ["qa"], defaultStack: ["node"] }] }));
  fs.writeFileSync(path.join(sandbox, "catalog/integrations.json"), JSON.stringify({ integrations: null }));
  fs.writeFileSync(path.join(sandbox, "packages/qa/profiles.json"), JSON.stringify({ profiles: null }));
  fs.writeFileSync(path.join(sandbox, "apps/worker/jobs.json"), JSON.stringify({ jobs: null }));
  fs.writeFileSync(path.join(sandbox, "apps/worker/schedules.json"), JSON.stringify({ schedules: null }));
  fs.writeFileSync(path.join(sandbox, "docs/MCP_SERVER.md"), "# Fixture MCP Docs\n");
  fs.writeFileSync(path.join(sandbox, "apps/mcp-server/tools.json"), JSON.stringify({ tools: [{ name: "kernel.fixture" }] }));

  const catalog = kernelResources.find((resource) => resource.uri === "sage://catalog").read(sandbox);
  assert.deepEqual(catalog.phases, []);
  assert.deepEqual(catalog.repos, []);
  assert.deepEqual(catalog.modules, []);
  assert.deepEqual(catalog.integrations, []);
  assert.deepEqual(catalog.qaProfiles, []);
  assert.equal(catalog.templates[0].id, "fixture");
  const jobs = kernelResources.find((resource) => resource.uri === "sage://jobs").read(sandbox);
  assert.deepEqual(jobs, { jobs: [], schedules: [] });

  const docs = kernelResources.find((resource) => resource.uri === "sage://docs/mcp-server").read(sandbox);
  assert.match(docs, /Fixture MCP Docs/);
  const metrics = kernelResources.find((resource) => resource.uri === "sage://metrics").read(sandbox);
  assert.match(metrics, /sage_kernel_tools_total/);
  const contracts = kernelResources.find((resource) => resource.uri === "sage://intelligence/contracts").read(sandbox);
  assert.equal(Boolean(contracts.schemas["memory-record.schema.json"]), true);
  assert.equal(contracts.securityBoundaries.some((boundary) => boundary.action === "semantic_code.apply_refactor"), true);
  const memory = kernelResources.find((resource) => resource.uri === "sage://intelligence/memory").read(sandbox);
  assert.equal(memory.id, "mem_release_ci_passed");

  const registered = [];
  registerKernelResources({
    registerResource(name, uri, metadata, read) {
      registered.push({ name, uri, metadata, read });
    }
  }, { root: sandbox });
  assert.equal(registered.length, kernelResources.length);
  const templates = await registered.find((resource) => resource.uri === "sage://templates").read();
  assert.equal(templates.contents[0].mimeType, "application/json");
  assert.match(templates.contents[0].text, /"fixture"/);
  const docResource = await registered.find((resource) => resource.uri === "sage://docs/mcp-server").read();
  assert.equal(docResource.contents[0].mimeType, "text/markdown");
  assert.match(docResource.contents[0].text, /Fixture MCP Docs/);

  assert.deepEqual(__resourceTestInternals.readJson(sandbox, "missing.json", { ok: true }), { ok: true });
  assert.equal(__resourceTestInternals.resourceText("already text", "text/plain"), "already text");
  assert.match(__resourceTestInternals.resourceText({ ok: true }, "application/json"), /"ok": true/);
  assert.equal(__resourceTestInternals.resourceText(null, "text/plain"), "");
});

function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}
