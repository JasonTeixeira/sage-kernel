import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateClientContracts, contractHash, OPERATING_CONTRACT, CONTRACT_START } from "../packages/companion/operating-contract.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

test("ONE contract renders into every client file (CLAUDE.md / .cursorrules / AGENTS.md) — parity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-contract-"));
  try {
    const res = generateClientContracts({ root });
    assert.deepEqual(res.written.sort(), [".cursorrules", "AGENTS.md", "CLAUDE.md"]);
    // Every client file contains the SAME canonical contract body (single source).
    for (const file of res.written) {
      const body = fs.readFileSync(path.join(root, file), "utf8");
      assert.ok(body.includes(CONTRACT_START), `${file} missing managed marker`);
      assert.ok(body.includes("Order of operations"), `${file} missing the contract body`);
      assert.ok(body.includes("kernel.enforce.proof_gate"), `${file} missing the enforce step`);
    }
    assert.equal(res.contractHash, contractHash());
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("generation is idempotent + preserves hand-authored content outside the markers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-contract2-"));
  try {
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "# My project notes\nKeep this.\n");
    generateClientContracts({ root });
    const once = fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8");
    assert.ok(once.includes("My project notes"), "must preserve existing content");
    assert.ok(once.includes(OPERATING_CONTRACT.split("\n")[0]), "must include the contract");
    generateClientContracts({ root }); // re-run
    const twice = fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8");
    assert.equal(once, twice, "re-running must be idempotent (no duplication)");
    // exactly one managed block
    assert.equal(twice.split(CONTRACT_START).length - 1, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("kernel.contract.install MCP tool writes the contract into a target project", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-contract-mcp-"));
  try {
    const res = await callKernelTool(root, "kernel.contract.install", { targetRoot: root });
    assert.equal(res.contractHash, contractHash());
    assert.ok(res.written.includes("CLAUDE.md"));
    assert.ok(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8").includes(CONTRACT_START));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
