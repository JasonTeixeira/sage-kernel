import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runMcpSmoke } from "../apps/mcp-server/scripts/smoke.mjs";
import { createMcpContractArtifacts, runGenerateContractsCli, __generateContractsTestInternals } from "../apps/mcp-server/scripts/generate-contracts.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("MCP contracts and docs are generated from the manifest", () => {
  const result = spawnSync("node", ["apps/mcp-server/scripts/generate-contracts.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const snapshotPath = path.join(root, "apps/mcp-server/contracts/tools.snapshot.json");
  const promptsSnapshotPath = path.join(root, "apps/mcp-server/contracts/prompts.snapshot.json");
  const resourcesSnapshotPath = path.join(root, "apps/mcp-server/contracts/resources.snapshot.json");
  const docsPath = path.join(root, "docs/mcp-tools.md");
  const promptsDocsPath = path.join(root, "docs/mcp-prompts.md");
  const resourcesDocsPath = path.join(root, "docs/mcp-resources.md");
  assert.equal(fs.existsSync(snapshotPath), true);
  assert.equal(fs.existsSync(promptsSnapshotPath), true);
  assert.equal(fs.existsSync(resourcesSnapshotPath), true);
  assert.equal(fs.existsSync(docsPath), true);
  assert.equal(fs.existsSync(promptsDocsPath), true);
  assert.equal(fs.existsSync(resourcesDocsPath), true);

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "apps/mcp-server/tools.json"), "utf8"));
  assert.equal(snapshot.tools.length, manifest.tools.length);
  assert.equal(snapshot.tools.every((tool) => tool.name && tool.inputHash && tool.risk && tool.permission), true);
  assert.equal(snapshot.tools.every((tool) => tool.outputShape && tool.examples.length > 0 && tool.failureModes.length > 0), true);

  const docs = fs.readFileSync(docsPath, "utf8");
  assert.match(docs, /# Sage Kernel MCP Tools/);
  assert.match(docs, /kernel\.jobs\.run/);
  assert.match(docs, /Approval Required/);
  assert.match(docs, /Output Shape/);
  assert.match(docs, /Failure Modes/);

  const resourceSnapshot = JSON.parse(fs.readFileSync(resourcesSnapshotPath, "utf8"));
  assert.deepEqual(resourceSnapshot.resources.map((resource) => resource.uri).sort(), [
    "sage://agents/checks",
    "sage://agents/global",
    "sage://agents/profiles",
    "sage://approvals",
    "sage://catalog",
    "sage://dashboard/snapshot",
    "sage://docs/mcp-server",
    "sage://intelligence/adapters",
    "sage://intelligence/contracts",
    "sage://intelligence/eval-report",
    "sage://intelligence/evals",
    "sage://intelligence/experiments",
    "sage://intelligence/memory",
    "sage://intelligence/operating-cockpit",
    "sage://intelligence/project-state",
    "sage://intelligence/runbooks",
    "sage://intelligence/semantic-adapters",
    "sage://jobs",
    "sage://metrics",
    "sage://runs",
    "sage://templates"
  ]);

  const resourceDocs = fs.readFileSync(resourcesDocsPath, "utf8");
  assert.match(resourceDocs, /# Sage Kernel MCP Resources/);
  assert.match(resourceDocs, /sage:\/\/agents\/global/);
  assert.match(resourceDocs, /sage:\/\/dashboard\/snapshot/);
  assert.match(resourceDocs, /read-only/i);

  const promptSnapshot = JSON.parse(fs.readFileSync(promptsSnapshotPath, "utf8"));
  assert.deepEqual(promptSnapshot.prompts.map((prompt) => prompt.name).sort(), [
    "sage.audit-repo",
    "sage.create-project",
    "sage.execute-release-runbook",
    "sage.explain-current-risk",
    "sage.explain-failed-job",
    "sage.inspect-approvals",
    "sage.plan-my-day",
    "sage.prepare-release",
    "sage.project-standup",
    "sage.run-full-qa",
    "sage.stress-test-server"
  ]);

  const promptDocs = fs.readFileSync(promptsDocsPath, "utf8");
  assert.match(promptDocs, /# Sage Kernel MCP Prompts/);
  assert.match(promptDocs, /sage\.audit-repo/);
  assert.match(promptDocs, /workflow entry points/i);
});

test("MCP contract generator direct API covers defaults and CLI output", () => {
  const manifest = {
    server: { name: "fixture" },
    tools: [{
      name: "kernel.fixture",
      description: "Fixture tool.",
      risk: "safe",
      permission: "fixture:read",
      inputSchema: { type: "object", properties: {} },
      outputShape: "Fixture output.",
      examples: [{ input: {} }],
      failureModes: ["Fixture failure."]
    }, {
      name: "kernel.approval",
      description: "Approval tool.",
      risk: "mutating",
      permission: "fixture:write",
      approvalRequired: true,
      sideEffects: "writes fixture",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      outputShape: "Approval output.",
      examples: [{ input: { id: "x" } }],
      failureModes: ["Approval failure."]
    }]
  };
  const artifacts = createMcpContractArtifacts({
    manifest,
    prompts: [{ name: "fixture.prompt", title: "Prompt", description: "Prompt description.", argsSchema: null }],
    resources: [{ name: "fixture", uri: "sage://fixture", title: "Fixture", description: "Fixture resource.", mimeType: "application/json" }]
  });
  assert.equal(artifacts.snapshot.tools[0].sideEffects, "none");
  assert.deepEqual(artifacts.snapshot.tools[0].required, []);
  assert.equal(artifacts.snapshot.tools[1].approvalRequired, true);
  assert.equal(artifacts.promptSnapshot.prompts[0].arguments.length, 0);
  assert.match(artifacts.docs, /kernel\.approval/);
  assert.match(__generateContractsTestInternals.hash({ ok: true }), /^[a-f0-9]{64}$/);

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-contracts-direct-"));
  fs.mkdirSync(path.join(workspace, "apps/mcp-server"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "docs"), { recursive: true });
  const lines = [];
  const status = runGenerateContractsCli({
    root: workspace,
    manifest,
    prompts: [],
    resources: [],
    stdout: (line) => lines.push(line)
  });
  assert.equal(status, 0);
  assert.equal(lines[0], "MCP contracts generated.");
  assert.equal(fs.existsSync(path.join(workspace, "apps/mcp-server/contracts/tools.snapshot.json")), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, "apps/mcp-server/contracts/tools.snapshot.json"), "utf8")).tools.length, 2);
});

test("MCP server is documented as the canonical product entry point", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts["mcp:start"], "node apps/mcp-server/src/server.mjs");
  assert.equal(pkg.scripts["mcp:server"], pkg.scripts["mcp:start"]);

  const docsPath = path.join(root, "docs/MCP_SERVER.md");
  assert.equal(fs.existsSync(docsPath), true);
  const docs = fs.readFileSync(docsPath, "utf8");
  assert.match(docs, /primary product interface/i);
  assert.match(docs, /npm run mcp:start/);
  assert.match(docs, /Claude Desktop/);
  assert.match(docs, /Codex/);
  assert.match(docs, /npm run mcp:smoke/);
});

test("MCP smoke core validates tool counts and tool-call content", async () => {
  const calls = [];
  const transport = { fake: true };
  const client = {
    async connect(value) {
      calls.push(["connect", value]);
    },
    async listTools() {
      calls.push(["listTools"]);
      return { tools: Array.from({ length: 8 }, (_, index) => ({ name: `tool.${index}` })) };
    },
    async callTool(input) {
      calls.push(["callTool", input]);
      return { content: [{ type: "text", text: "ok" }] };
    },
    async close() {
      calls.push(["close"]);
    }
  };
  const result = await runMcpSmoke({ client, transport });
  assert.equal(result.tools, 8);
  assert.equal(calls.at(-1)[0], "close");

  await assert.rejects(
    () => runMcpSmoke({
      transport,
      client: {
        async connect() {},
        async listTools() {
          return { tools: [] };
        }
      }
    }),
    /Expected at least 8 tools/
  );

  await assert.rejects(
    () => runMcpSmoke({
      transport,
      client: {
        async connect() {},
        async listTools() {
          return { tools: Array.from({ length: 8 }, () => ({})) };
        },
        async callTool() {
          return { content: [] };
        }
      }
    }),
    /returned no content/
  );
});
