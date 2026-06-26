#!/usr/bin/env node
// LIVE non-Claude autonomy proof (L2). Drives a real broken repo to green through
// the actual operate loop, with the OpenAI Codex CLI (a non-Claude model) wired as
// the autonomous repairer. Banks the anchored operate:run proof + a before/after
// snapshot as evidence. This is the artifact that proves the loop is model-agnostic
// against a real foreign model — not a stub, not Claude.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { callKernelTool } from "../../apps/mcp-server/src/kernel-tools.mjs";
import { listProofs, verifyLedger } from "../../packages/proof/ledger.mjs";

const kernelRoot = path.resolve(import.meta.dirname, "../..");
process.env.SAGE_AGENT_COMMAND = `node ${path.join(kernelRoot, "providers/codex-agent.mjs")}`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-codex-auto-"));
fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "codex-fix", type: "module", scripts: { test: "node --test" } }, null, 2));
fs.mkdirSync(path.join(dir, "src"));
fs.mkdirSync(path.join(dir, "test"));
// A real bug: discount() should subtract a percentage but adds it.
fs.writeFileSync(path.join(dir, "src", "pricing.mjs"), "export function discount(price, pct) {\n  return price + (price * pct) / 100;\n}\n");
fs.writeFileSync(path.join(dir, "test", "pricing.test.mjs"), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { discount } from '../src/pricing.mjs';\ntest('10% off 100 = 90', () => assert.equal(discount(100, 10), 90));\n");
spawnSync("git", ["init", "-q"], { cwd: dir });
spawnSync("git", ["add", "-A"], { cwd: dir });
spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "broken"], { cwd: dir });

const before = spawnSync("node", ["--test"], { cwd: dir, encoding: "utf8" });
console.error(`baseline tests: ${before.status === 0 ? "GREEN (invalid fixture!)" : "RED (as expected)"}`);

console.error("driving operate loop with CODEX as the repairer...");
const result = await callKernelTool(dir, "kernel.operate.run", {
  goal: "Fix discount() so a 10% discount on 100 returns 90.",
  acceptanceCriteria: ["discount(100,10) === 90", "tests pass"],
  files: ["src/pricing.mjs"],
  approve: true
});

const after = spawnSync("node", ["--test"], { cwd: dir, encoding: "utf8" });
const operateProof = listProofs({ root: dir }).find((p) => p.tool === "operate:run");
const fixedSource = fs.readFileSync(path.join(dir, "src", "pricing.mjs"), "utf8");

const evidence = {
  type: "live-noncclaude-autonomy",
  model: "codex",
  agentCommand: process.env.SAGE_AGENT_COMMAND,
  baselineRed: before.status !== 0,
  finalGreen: after.status === 0,
  operateStatus: result.status,
  proofId: operateProof?.proofId || null,
  ledger: verifyLedger({ root: dir }).status,
  fixedSource,
  generatedAt: new Date().toISOString()
};
const evidenceDir = path.join(kernelRoot, ".sage-kernel/evidence");
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "live-noncclaude-autonomy-latest.json"), `${JSON.stringify(evidence, null, 2)}\n`);

console.error(`\noperate status: ${result.status}`);
console.error(`final tests: ${after.status === 0 ? "GREEN" : "RED"}`);
console.error(`proof: ${evidence.proofId}  ledger: ${evidence.ledger}`);
console.log(JSON.stringify({ baselineRed: evidence.baselineRed, finalGreen: evidence.finalGreen, operateStatus: evidence.operateStatus, proofId: evidence.proofId }));

fs.rmSync(dir, { recursive: true, force: true });
const ok = evidence.baselineRed && evidence.finalGreen && result.status === "passed" && evidence.proofId;
process.exit(ok ? 0 : 1);
