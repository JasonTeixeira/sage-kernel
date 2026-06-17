import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { kernelPrompts, registerKernelPrompts } from "../apps/mcp-server/src/kernel-prompts.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("MCP server exposes workflow prompts for daily kernel operations", async () => {
  const client = new Client({ name: "sage-kernel-prompt-test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["apps/mcp-server/src/server.mjs"],
    cwd: root
  });
  await client.connect(transport);
  try {
    const listed = await client.listPrompts();
    const names = listed.prompts.map((prompt) => prompt.name).sort();
    assert.deepEqual(names, [
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

    const prompt = await client.getPrompt({
      name: "sage.audit-repo",
      arguments: { scope: "current repo" }
    });
    assert.equal(prompt.messages.length, 1);
    assert.equal(prompt.messages[0].role, "user");
    assert.match(prompt.messages[0].content.text, /Audit/);
    assert.match(prompt.messages[0].content.text, /npm run qa:gate/);
  } finally {
    await client.close();
  }
});

test("kernel prompts render defaults and custom workflow arguments", async () => {
  const registered = [];
  registerKernelPrompts({
    registerPrompt(name, metadata, render) {
      registered.push({ name, metadata, render });
    }
  });

  assert.equal(registered.length, kernelPrompts.length);
  const customCases = {
    "sage.audit-repo": { scope: "packages/core" },
    "sage.run-full-qa": { mode: "deep" },
    "sage.create-project": { template: "worker-service", name: "queue-runner" },
    "sage.inspect-approvals": { status: "approved" },
    "sage.prepare-release": { version: "v1.0.0" },
    "sage.stress-test-server": { url: "http://localhost:9999" },
    "sage.explain-failed-job": { runId: "run_123" },
    "sage.plan-my-day": { objective: "finish Program 5" },
    "sage.project-standup": { focus: "runbooks" },
    "sage.execute-release-runbook": { runbook: "runbook_daily_release_readiness" },
    "sage.explain-current-risk": { scope: "release" }
  };

  for (const prompt of registered) {
    assert.equal(typeof prompt.metadata.title, "string");
    const defaultRendered = await prompt.render(undefined);
    assert.equal(defaultRendered.messages[0].role, "user");
    assert.equal(defaultRendered.messages[0].content.type, "text");
    assert.equal(defaultRendered.messages[0].content.text.length > 20, true);

    const customRendered = await prompt.render(customCases[prompt.name]);
    assert.equal(customRendered.messages[0].content.text.length > 20, true);
    for (const value of Object.values(customCases[prompt.name])) {
      assert.match(customRendered.messages[0].content.text, new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});
